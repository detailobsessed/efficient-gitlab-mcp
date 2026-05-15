import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseGitLabResponse } from "../schemas/parse.js";
import { GitLabTreeListSchema } from "../schemas/repositories.js";
import {
  buildQueryString,
  defaultClient,
  isNotFoundError,
  resolveProjectId,
} from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const SearchRepositoriesSchema = z.object({
  search: z.string().optional().describe("Search query"),
  query: z.string().optional().describe("Search query (alias for search)"),
  page: z.number().optional().describe("Page number for pagination"),
  per_page: z.number().optional().describe("Number of results per page"),
});

const GetFileContentsSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  file_path: z.string().describe("Path to the file in the repository"),
  ref: z.string().optional().describe("Branch, tag, or commit SHA"),
  max_bytes: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Hard byte cap on the returned (decoded) content. Applied after any head/tail/range. Useful for capping large files within a context budget.",
    ),
  head: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe("Return only the first N lines (mutually exclusive with tail and range)"),
  tail: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe("Return only the last N lines (mutually exclusive with head and range)"),
  range: z
    .string()
    .regex(/^\d+-\d+$/, "range must be 'start-end' (e.g. '10-50')")
    .optional()
    .describe(
      "Line range to return, 1-indexed and inclusive (e.g. '10-50'). Mutually exclusive with head and tail.",
    ),
});

type TrimResult = { content: string; truncated: boolean; note?: string };

function trimByRange(text: string, range: string): TrimResult {
  const match = range.match(/^(\d+)-(\d+)$/);
  // Regex on the schema already validated the shape, but assert defensively
  if (!match) throw new Error(`invalid range: ${range}`);
  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  if (start < 1 || end < start) {
    throw new Error(`invalid range '${range}': start must be >= 1 and <= end`);
  }
  const lines = text.split("\n");
  const sliced = lines.slice(start - 1, end);
  if (sliced.length === lines.length) return { content: text, truncated: false };
  return {
    content: sliced.join("\n"),
    truncated: true,
    note: `Showing lines ${start}-${Math.min(end, lines.length)} of ${lines.length}`,
  };
}

function trimByHead(text: string, head: number): TrimResult {
  const lines = text.split("\n");
  if (lines.length <= head) return { content: text, truncated: false };
  return {
    content: lines.slice(0, head).join("\n"),
    truncated: true,
    note: `Showing first ${head} of ${lines.length} lines`,
  };
}

function trimByTail(text: string, tail: number): TrimResult {
  const lines = text.split("\n");
  if (lines.length <= tail) return { content: text, truncated: false };
  return {
    content: lines.slice(-tail).join("\n"),
    truncated: true,
    note: `Showing last ${tail} of ${lines.length} lines`,
  };
}

function trimByMaxBytes(text: string, max_bytes: number): TrimResult {
  const buf = Buffer.from(text, "utf8");
  if (buf.byteLength <= max_bytes) return { content: text, truncated: false };
  // TextDecoder with fatal:false drops the trailing partial UTF-8 sequence
  // gracefully so we never hand the LLM a half-character.
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return {
    content: decoder.decode(buf.subarray(0, max_bytes)),
    truncated: true,
    note: `Truncated to ${max_bytes} of ${buf.byteLength} bytes`,
  };
}

function applyLineTrim(
  text: string,
  opts: { head?: number; tail?: number; range?: string },
): TrimResult {
  const set = [opts.head !== undefined, opts.tail !== undefined, !!opts.range].filter(
    Boolean,
  ).length;
  if (set > 1) {
    throw new Error(
      "head, tail, and range are mutually exclusive — pass at most one line-based trim",
    );
  }
  if (opts.range) return trimByRange(text, opts.range);
  if (opts.head !== undefined) return trimByHead(text, opts.head);
  if (opts.tail !== undefined) return trimByTail(text, opts.tail);
  return { content: text, truncated: false };
}

/**
 * Apply head / tail / range / max_bytes trimming to UTF-8 text. The line-based
 * trims (head, tail, range) are mutually exclusive — at most one may be set;
 * max_bytes composes on top of any of them as a final hard cap.
 */
function applyContentTrim(
  text: string,
  opts: { head?: number; tail?: number; range?: string; max_bytes?: number },
): { content: string; truncated: boolean; truncation_note?: string } {
  const totalLines = text.split("\n").length;
  const lineTrim = applyLineTrim(text, opts);
  const notes: string[] = [];
  if (lineTrim.note) notes.push(lineTrim.note);

  let content = lineTrim.content;
  let truncated = lineTrim.truncated;

  if (opts.max_bytes !== undefined) {
    const byteTrim = trimByMaxBytes(content, opts.max_bytes);
    content = byteTrim.content;
    if (byteTrim.note) notes.push(byteTrim.note);
    truncated = truncated || byteTrim.truncated;
  }

  // Always include totalLines hint when truncating, so callers can re-request
  // a different range without re-fetching the file just to count lines.
  if (truncated) notes.push(`File has ${totalLines} total lines`);

  return {
    content,
    truncated,
    truncation_note: truncated ? notes.join(". ") : undefined,
  };
}

/**
 * Detect whether decoded content is "binary enough" that text-based trimming
 * would mangle it. Heuristic: any null byte in the first 8 KB. Simple, cheap,
 * and matches what `git`, `grep`, and `file(1)` use as their text/binary cut.
 */
function looksBinary(text: string): boolean {
  const sample = text.length > 8192 ? text.slice(0, 8192) : text;
  return sample.indexOf("\0") !== -1;
}

type GitLabFileResponse = {
  content?: string;
  encoding?: string;
  size?: number;
  [k: string]: unknown;
};

type TrimOpts = { head?: number; tail?: number; range?: string; max_bytes?: number };

/**
 * Apply trim params to a GitLab file response. Returns the original (unchanged)
 * response if no trim params are set, the file is binary, or the encoding is
 * something other than what we know how to decode.
 */
function trimFileResponse(file: GitLabFileResponse, opts: TrimOpts): GitLabFileResponse {
  const wantsTrim =
    opts.max_bytes !== undefined ||
    opts.head !== undefined ||
    opts.tail !== undefined ||
    opts.range !== undefined;
  if (!wantsTrim) return file;

  // Decode base64 content for trimming. GitLab returns base64 by default.
  let decoded: string;
  if (file.encoding === "base64" && typeof file.content === "string") {
    decoded = Buffer.from(file.content, "base64").toString("utf8");
  } else if (typeof file.content === "string") {
    // Already plain text (rare — happens with `?raw=true` flow we don't use).
    decoded = file.content;
  } else {
    // No content field at all (directory listing or unexpected response).
    return file;
  }

  if (looksBinary(decoded)) {
    return {
      ...file,
      truncated: false,
      truncation_note:
        "File appears to be binary (null byte detected); trim parameters ignored. Re-fetch without head/tail/range/max_bytes to get the full base64 payload.",
    };
  }

  const trimmed = applyContentTrim(decoded, opts);
  return {
    ...file,
    content: trimmed.content,
    encoding: "text",
    truncated: trimmed.truncated,
    ...(trimmed.truncation_note ? { truncation_note: trimmed.truncation_note } : {}),
  };
}

const CreateRepositorySchema = z.object({
  name: z.string().describe("Name of the new project"),
  description: z.string().optional().describe("Project description"),
  visibility: z.enum(["private", "internal", "public"]).optional().describe("Project visibility"),
  initialize_with_readme: z.coerce.boolean().optional().describe("Initialize with README"),
  namespace_id: z.number().optional().describe("Namespace ID for the project"),
});

const ForkRepositorySchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path to fork"),
  namespace_id: z.number().optional().describe("Target namespace ID"),
  name: z.string().optional().describe("New project name"),
  path: z.string().optional().describe("New project path"),
});

const CreateBranchSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  branch: z.string().describe("Name of the new branch"),
  ref: z.string().describe("Source branch or commit SHA"),
});

const ListBranchesSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  search: z
    .string()
    .optional()
    .describe("Filter branches by name. Use '^prefix' for starts-with, 'suffix$' for ends-with"),
  regex: z.string().optional().describe("Filter branches by regex (premium / ultimate only)"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetBranchSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  branch: z.string().describe("Branch name"),
});

const GetRepositoryTreeSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  path: z.string().optional().describe("Path inside repository"),
  ref: z.string().optional().describe("Branch, tag, or commit SHA"),
  recursive: z.coerce.boolean().optional().describe("Get tree recursively"),
  page: z.number().optional().describe("Page number (offset pagination)"),
  per_page: z.number().optional().describe("Results per page"),
  pagination: z
    .enum(["keyset"])
    .optional()
    .describe("Set to 'keyset' for keyset pagination on large trees (recommended)"),
  page_token: z
    .string()
    .optional()
    .describe(
      "Continuation token for keyset pagination — pass the value surfaced in pagination_note from the previous page",
    ),
});

const CreateOrUpdateFileSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  file_path: z.string().describe("Path to the file"),
  branch: z.string().describe("Target branch"),
  content: z.string().describe("File content"),
  commit_message: z.string().describe("Commit message"),
  author_email: z.string().optional().describe("Author email"),
  author_name: z.string().optional().describe("Author name"),
});

const PushFilesSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  branch: z.string().describe("Target branch"),
  commit_message: z.string().describe("Commit message"),
  files: z
    .array(
      z.object({
        file_path: z.string(),
        content: z.string(),
        action: z.enum(["create", "update", "delete"]).optional(),
      }),
    )
    .describe("Files to push"),
  start_branch: z.string().optional().describe("Source branch if creating new branch"),
});

const GetBranchDiffsSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  from: z.string().describe("Source branch or commit"),
  to: z.string().describe("Target branch or commit"),
  straight: z.coerce.boolean().optional().describe("Use straight comparison"),
});

export function registerRepositoryTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering repository tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef = server.registerTool(
    "search_repositories",
    {
      title: "Search Repositories",
      description: "Search for GitLab projects",
      inputSchema: {
        search: z.string().optional().describe("Search query"),
        query: z.string().optional().describe("Search query (alias for search)"),
        page: z.number().optional().describe("Page number for pagination"),
        per_page: z.number().optional().describe("Number of results per page"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = SearchRepositoriesSchema.parse(params);
      const searchTerm = args.search || args.query || "";
      const query = buildQueryString({
        search: searchTerm,
        page: args.page,
        per_page: args.per_page,
      });

      const projects = await defaultClient.get(`/projects${query}`);
      return {
        content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
      };
    },
  );
  toolRef.disable();
  tools.set("search_repositories", toolRef);

  const toolRef2 = server.registerTool(
    "get_file_contents",
    {
      title: "Get File Contents",
      description:
        "Get the contents of a file from a GitLab project. Supports server-side trimming via head / tail / range (line-based, mutually exclusive) and max_bytes (final byte cap, composes with any line trim) to fit large files within a context budget.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        file_path: z.string().describe("Path to the file in the repository"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA"),
        max_bytes: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Hard byte cap on the returned (decoded) content. Applied after any head/tail/range.",
          ),
        head: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .describe("Return only the first N lines (mutually exclusive with tail and range)"),
        tail: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .describe("Return only the last N lines (mutually exclusive with head and range)"),
        range: z
          .string()
          .regex(/^\d+-\d+$/, "range must be 'start-end' (e.g. '10-50')")
          .optional()
          .describe(
            "Line range, 1-indexed and inclusive (e.g. '10-50'). Mutually exclusive with head and tail.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = GetFileContentsSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const filePath = encodeURIComponent(args.file_path);

      // Auto-default ref to the project's default branch when the caller
      // omits it. GitLab's /repository/files endpoint requires a ref and
      // would otherwise 400 "ref is missing", forcing every caller to
      // know the project's default branch up front.
      let ref = args.ref;
      if (!ref) {
        const project = (await defaultClient.get(`/projects/${projectId}`)) as {
          default_branch?: string | null;
        } | null;
        if (project?.default_branch) ref = project.default_branch;
      }

      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const file = (await defaultClient.get(
        `/projects/${projectId}/repository/files/${filePath}${query}`,
      )) as GitLabFileResponse;

      const response = trimFileResponse(file, {
        head: args.head,
        tail: args.tail,
        range: args.range,
        max_bytes: args.max_bytes,
      });

      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    },
  );
  toolRef2.disable();
  tools.set("get_file_contents", toolRef2);

  const toolRef3 = server.registerTool(
    "create_repository",
    {
      title: "Create Repository",
      description: "Create a new GitLab project",
      inputSchema: {
        name: z.string().describe("Name of the new project"),
        description: z.string().optional().describe("Project description"),
        visibility: z
          .enum(["private", "internal", "public"])
          .optional()
          .describe("Project visibility"),
        initialize_with_readme: z.coerce.boolean().optional().describe("Initialize with README"),
        namespace_id: z.number().optional().describe("Namespace ID for the project"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = CreateRepositorySchema.parse(params);
      const project = await defaultClient.post("/projects", args);
      return {
        content: [{ type: "text", text: JSON.stringify(project, null, 2) }],
      };
    },
  );
  toolRef3.disable();
  tools.set("create_repository", toolRef3);

  const toolRef4 = server.registerTool(
    "fork_repository",
    {
      title: "Fork Repository",
      description: "Fork a GitLab project to your account or specified namespace",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path to fork"),
        namespace_id: z.number().optional().describe("Target namespace ID"),
        name: z.string().optional().describe("New project name"),
        path: z.string().optional().describe("New project path"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = ForkRepositorySchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...body } = args;

      const fork = await defaultClient.post(`/projects/${projectId}/fork`, body);
      return {
        content: [{ type: "text", text: JSON.stringify(fork, null, 2) }],
      };
    },
  );
  toolRef4.disable();
  tools.set("fork_repository", toolRef4);

  const toolRef5 = server.registerTool(
    "create_branch",
    {
      title: "Create Branch",
      description: "Create a new branch in a GitLab project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        branch: z.string().describe("Name of the new branch"),
        ref: z.string().describe("Source branch or commit SHA"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = CreateBranchSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);

      const branch = await defaultClient.post(`/projects/${projectId}/repository/branches`, {
        branch: args.branch,
        ref: args.ref,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(branch, null, 2) }],
      };
    },
  );
  toolRef5.disable();
  tools.set("create_branch", toolRef5);

  const toolRef6 = server.registerTool(
    "get_repository_tree",
    {
      title: "Get Repository Tree",
      description:
        "Get the repository tree for a GitLab project (list files and directories). Returns {items, pagination_note}. Pass pagination=keyset for keyset pagination on large trees.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        path: z.string().optional().describe("Path inside repository"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA"),
        recursive: z.coerce.boolean().optional().describe("Get tree recursively"),
        page: z.number().optional().describe("Page number (offset pagination)"),
        per_page: z.number().optional().describe("Results per page"),
        pagination: z
          .enum(["keyset"])
          .optional()
          .describe("Set to 'keyset' for keyset pagination on large trees (recommended)"),
        page_token: z
          .string()
          .optional()
          .describe(
            "Continuation token for keyset pagination — pass the value surfaced in pagination_note from the previous page",
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = GetRepositoryTreeSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      // Use rawFetch so we can read the keyset cursor from response headers.
      // Wrapping the response in {items, pagination_note} gives callers a
      // consistent shape regardless of pagination mode and surfaces the
      // next-page token visibly.
      const response = await defaultClient.rawFetch(
        `/projects/${projectId}/repository/tree${query}`,
      );
      const responseText = await response.text();
      const rawItems = responseText ? JSON.parse(responseText) : [];
      const items = parseGitLabResponse(
        GitLabTreeListSchema,
        rawItems,
        "get_repository_tree",
        logger,
      );
      // GitLab emits the keyset cursor under `X-Next-Page-Token` on newer
      // versions. On older versions (and some configurations) the cursor is
      // reused under the `X-Next-Page` header that was originally an offset
      // page number. Fall back to that in keyset mode so pagination doesn't
      // silently stop on instances that haven't adopted the new header name.
      // Ref: upstream/41f92e6 (zereight/gitlab-mcp).
      const nextToken =
        response.headers.get("X-Next-Page-Token") ??
        (args.pagination === "keyset" ? response.headers.get("X-Next-Page") : null);

      let paginationNote: string;
      if (args.pagination === "keyset") {
        paginationNote = nextToken
          ? `Next page available — call again with pagination=keyset&page_token=${nextToken}`
          : "No more pages.";
      } else {
        paginationNote = nextToken
          ? `Next page available — call again with pagination=keyset&page_token=${nextToken} (or use offset page=N)`
          : "Using offset pagination (page/per_page). For large trees, pass pagination=keyset for token-based pagination.";
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ items, pagination_note: paginationNote }, null, 2),
          },
        ],
      };
    },
  );
  toolRef6.disable();
  tools.set("get_repository_tree", toolRef6);

  const toolRef7 = server.registerTool(
    "create_or_update_file",
    {
      title: "Create or Update File",
      description: "Create or update a single file in a GitLab project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        file_path: z.string().describe("Path to the file"),
        branch: z.string().describe("Target branch"),
        content: z.string().describe("File content"),
        commit_message: z.string().describe("Commit message"),
        author_email: z.string().optional().describe("Author email"),
        author_name: z.string().optional().describe("Author name"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = CreateOrUpdateFileSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const filePath = encodeURIComponent(args.file_path);

      const body = {
        branch: args.branch,
        content: Buffer.from(args.content).toString("base64"),
        commit_message: args.commit_message,
        encoding: "base64",
        author_email: args.author_email,
        author_name: args.author_name,
      };

      // Check if file exists to determine POST (create) vs PUT (update)
      let fileExists = false;
      try {
        const ref = args.branch ? `?ref=${encodeURIComponent(args.branch)}` : "";
        await defaultClient.get(`/projects/${projectId}/repository/files/${filePath}${ref}`);
        fileExists = true;
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
        // File doesn't exist, will create
      }

      const endpoint = `/projects/${projectId}/repository/files/${filePath}`;
      const result = fileExists
        ? await defaultClient.put(endpoint, body)
        : await defaultClient.post(endpoint, body);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
  toolRef7.disable();
  tools.set("create_or_update_file", toolRef7);

  const toolRef8 = server.registerTool(
    "push_files",
    {
      title: "Push Files",
      description: "Push multiple files to a GitLab project in a single commit",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        branch: z.string().describe("Target branch"),
        commit_message: z.string().describe("Commit message"),
        files: z
          .array(
            z.object({
              file_path: z.string(),
              content: z.string(),
              action: z.enum(["create", "update", "delete"]).optional(),
            }),
          )
          .describe("Files to push"),
        start_branch: z.string().optional().describe("Source branch if creating new branch"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = PushFilesSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);

      const actions = args.files.map((file) => ({
        action: file.action ?? "create",
        file_path: file.file_path,
        content: file.content,
      }));

      const result = await defaultClient.post(`/projects/${projectId}/repository/commits`, {
        branch: args.branch,
        commit_message: args.commit_message,
        actions,
        start_branch: args.start_branch,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
  toolRef8.disable();
  tools.set("push_files", toolRef8);

  const toolRef9 = server.registerTool(
    "get_branch_diffs",
    {
      title: "Get Branch Diffs",
      description: "Get the changes/diffs between two branches or commits in a GitLab project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        from: z.string().describe("Source branch or commit"),
        to: z.string().describe("Target branch or commit"),
        straight: z.coerce.boolean().optional().describe("Use straight comparison"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = GetBranchDiffsSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const query = buildQueryString({
        from: args.from,
        to: args.to,
        straight: args.straight,
      });

      const diffs = await defaultClient.get(`/projects/${projectId}/repository/compare${query}`);
      return {
        content: [{ type: "text", text: JSON.stringify(diffs, null, 2) }],
      };
    },
  );
  toolRef9.disable();
  tools.set("get_branch_diffs", toolRef9);

  const toolRef10 = server.registerTool(
    "list_branches",
    {
      title: "List Branches",
      description: "List branches of a GitLab project repository",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        search: z
          .string()
          .optional()
          .describe(
            "Filter branches by name. Prefix with ^ for starts-with, append $ for ends-with",
          ),
        regex: z.string().optional().describe("Filter branches by regex (premium / ultimate only)"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = ListBranchesSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const branches = await defaultClient.get(
        `/projects/${projectId}/repository/branches${query}`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(branches, null, 2) }],
      };
    },
  );
  toolRef10.disable();
  tools.set("list_branches", toolRef10);

  const toolRef11 = server.registerTool(
    "get_branch",
    {
      title: "Get Branch",
      description: "Get details of a single branch (commit SHA, default flag, protection state)",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        branch: z.string().describe("Branch name"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = GetBranchSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const branchName = encodeURIComponent(args.branch);

      const branch = await defaultClient.get(
        `/projects/${projectId}/repository/branches/${branchName}`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(branch, null, 2) }],
      };
    },
  );
  toolRef11.disable();
  tools.set("get_branch", toolRef11);

  logger.debug("Repository tools registered", { count: tools.size });
  return tools;
}

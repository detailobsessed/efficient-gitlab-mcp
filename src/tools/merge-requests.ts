import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQueryString, defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const MAX_PATTERN_LENGTH = 200;
const NESTED_QUANTIFIER_RE = /(\+|\*|\{)\s*(\+|\*|\{)/;

function safeCompilePatterns(patterns: string[]): RegExp[] {
  return patterns
    .map((p) => {
      if (p.length > MAX_PATTERN_LENGTH || NESTED_QUANTIFIER_RE.test(p)) return null;
      try {
        return new RegExp(p);
      } catch {
        return null;
      }
    })
    .filter((re): re is RegExp => re !== null);
}

function filterDiffsByPatterns<T extends { new_path: string; old_path?: string }>(
  diffs: T[],
  patterns: string[] | undefined,
): T[] {
  if (!patterns?.length) return diffs;
  const regexes = safeCompilePatterns(patterns);
  if (regexes.length === 0) return diffs;
  return diffs.filter(
    (d) => !regexes.some((re) => re.test(d.new_path) || (d.old_path ? re.test(d.old_path) : false)),
  );
}

const GetMergeRequestSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().optional().describe("Merge request IID"),
  branch_name: z.string().optional().describe("Branch name to find MR"),
});

const ListMergeRequestsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  state: z.enum(["opened", "closed", "merged", "all"]).optional().describe("MR state filter"),
  scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional().describe("Scope filter"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
  author_id: z
    .number()
    .optional()
    .describe("Author user ID (mutually exclusive with author_username)"),
  author_username: z
    .string()
    .optional()
    .describe("Author username (mutually exclusive with author_id)"),
  assignee_id: z
    .number()
    .optional()
    .describe("Assignee user ID (mutually exclusive with assignee_username)"),
  assignee_username: z
    .string()
    .optional()
    .describe("Assignee username (mutually exclusive with assignee_id)"),
  reviewer_id: z
    .number()
    .optional()
    .describe("Reviewer user ID (mutually exclusive with reviewer_username)"),
  reviewer_username: z
    .string()
    .optional()
    .describe("Reviewer username (mutually exclusive with reviewer_id)"),
});

const CreateMergeRequestSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  source_branch: z.string().describe("Source branch"),
  target_branch: z.string().describe("Target branch"),
  title: z.string().describe("MR title"),
  description: z.string().optional().describe("MR description"),
  assignee_id: z.number().optional().describe("Assignee user ID"),
  reviewer_ids: z.array(z.number()).optional().describe("Reviewer user IDs"),
  labels: z.string().optional().describe("Comma-separated labels"),
  milestone_id: z.number().optional().describe("Milestone ID"),
  remove_source_branch: z.boolean().optional().describe("Remove source branch after merge"),
  squash: z.boolean().optional().describe("Squash commits on merge"),
  draft: z.boolean().optional().describe("Create as draft MR"),
});

const UpdateMergeRequestSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  title: z.string().optional().describe("New title"),
  description: z.string().optional().describe("New description"),
  state_event: z.enum(["close", "reopen"]).optional().describe("State change"),
  assignee_id: z.number().optional().describe("Assignee user ID"),
  reviewer_ids: z.array(z.number()).optional().describe("Reviewer user IDs"),
  labels: z.string().optional().describe("Comma-separated labels"),
  milestone_id: z.number().optional().describe("Milestone ID"),
  target_branch: z.string().optional().describe("Target branch"),
  remove_source_branch: z.boolean().optional().describe("Remove source branch after merge"),
  squash: z.boolean().optional().describe("Squash commits on merge"),
});

const MergeMergeRequestSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  merge_commit_message: z.string().optional().describe("Custom merge commit message"),
  squash_commit_message: z.string().optional().describe("Custom squash commit message"),
  squash: z.boolean().optional().describe("Squash commits"),
  should_remove_source_branch: z.boolean().optional().describe("Remove source branch"),
  merge_when_pipeline_succeeds: z.boolean().optional().describe("Merge when pipeline succeeds"),
  sha: z.string().optional().describe("Expected HEAD SHA"),
});

const GetMergeRequestDiffsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
  excluded_file_patterns: z
    .array(z.string())
    .optional()
    .describe('Array of regex patterns to exclude files. Examples: ["^vendor/", "\\.pb\\.go$"]'),
});

const ListMergeRequestDiscussionsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const CreateMergeRequestThreadSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  body: z.string().describe("Thread body"),
  position: z
    .object({
      base_sha: z.string(),
      start_sha: z.string(),
      head_sha: z.string(),
      position_type: z.enum(["text", "image"]),
      new_path: z.string().optional(),
      old_path: z.string().optional(),
      new_line: z.number().optional(),
      old_line: z.number().optional(),
    })
    .optional()
    .describe("Position for diff comment"),
});

const ResolveMergeRequestThreadSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  discussion_id: z.string().describe("Discussion ID"),
  resolved: z.boolean().describe("Resolve or unresolve"),
});

const CreateMergeRequestNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  body: z.string().describe("Note body"),
});

const UpdateMergeRequestNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  note_id: z.number().describe("Note ID"),
  body: z.string().describe("New note body"),
});

const DeleteMergeRequestNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  note_id: z.number().describe("Note ID"),
});

const GetMergeRequestNotesSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const ApproveMergeRequestSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of the merge request to approve"),
  sha: z
    .string()
    .optional()
    .describe(
      "The HEAD of the merge request. Optional, but used to ensure the merge request hasn't changed since you last reviewed it",
    ),
  approval_password: z
    .string()
    .optional()
    .describe(
      "Current user's password. Required if 'Require user re-authentication to approve' is enabled in the project settings",
    ),
});

const UnapproveMergeRequestSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of the merge request to unapprove"),
});

const GetMergeRequestApprovalStateSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of the merge request"),
});

const GetMergeRequestConflictsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of the merge request"),
});

const ListMergeRequestChangedFilesSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  excluded_file_patterns: z
    .array(z.string())
    .optional()
    .describe('Array of regex patterns to exclude files. Examples: ["^vendor/", "\\.pb\\.go$"]'),
});

const ListMergeRequestDiffsApiSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  page: z.number().optional().describe("Page number for pagination (default: 1)"),
  per_page: z.number().optional().describe("Number of items per page (max: 100, default: 20)"),
  unidiff: z
    .boolean()
    .optional()
    .describe(
      "Present diffs in the unified diff format. Default is false. Introduced in GitLab 16.5.",
    ),
});

const GetMergeRequestFileDiffSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  file_paths: z
    .array(z.string())
    .describe(
      "List of file paths to retrieve diffs for (e.g. ['src/api/users.ts', 'src/repo/user.go']). " +
        "Call list_merge_request_changed_files first to get the full list of changed paths.",
    ),
  unidiff: z
    .boolean()
    .optional()
    .describe("Present diff in the unified diff format. Default is false."),
});

const ListMergeRequestVersionsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The internal ID of the merge request"),
});

const GetMergeRequestVersionSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The internal ID of the merge request"),
  version_id: z.number().describe("The ID of the merge request diff version"),
  unidiff: z
    .boolean()
    .optional()
    .describe(
      "Present diffs in the unified diff format. Default is false. Introduced in GitLab 16.5.",
    ),
});

const GetMergeRequestNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
  note_id: z.number().describe("The ID of a thread note"),
});

const DeleteMergeRequestDiscussionNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
  discussion_id: z.string().describe("The ID of a thread"),
  note_id: z.number().describe("The ID of a thread note"),
});

const UpdateMergeRequestDiscussionNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
  discussion_id: z.string().describe("The ID of a thread"),
  note_id: z.number().describe("The ID of a thread note"),
  body: z.string().optional().describe("The content of the note or reply"),
  resolved: z.boolean().optional().describe("Resolve or unresolve the note"),
});

const CreateMergeRequestDiscussionNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
  discussion_id: z.string().describe("The ID of a thread"),
  body: z.string().describe("The content of the note or reply"),
  created_at: z.string().optional().describe("Date the note was created at (ISO 8601 format)"),
});

const GetDraftNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
  draft_note_id: z.number().describe("The ID of the draft note"),
});

const ListDraftNotesSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
});

const CreateDraftNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
  body: z.string().describe("The content of the draft note"),
  in_reply_to_discussion_id: z
    .string()
    .optional()
    .describe("The ID of a discussion the draft note replies to"),
  resolve_discussion: z
    .boolean()
    .optional()
    .describe("Whether to resolve the discussion when publishing"),
});

const UpdateDraftNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
  draft_note_id: z.number().describe("The ID of the draft note"),
  body: z.string().optional().describe("The content of the draft note"),
  resolve_discussion: z
    .boolean()
    .optional()
    .describe("Whether to resolve the discussion when publishing"),
});

const DeleteDraftNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
  draft_note_id: z.number().describe("The ID of the draft note"),
});

const PublishDraftNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
  draft_note_id: z.number().describe("The ID of the draft note"),
});

const BulkPublishDraftNotesSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("The IID of a merge request"),
});

export function registerMergeRequestTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering merge request tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef = server.registerTool(
    "get_merge_request",
    {
      title: "Get Merge Request",
      description: "Get details of a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().optional().describe("Merge request IID"),
        branch_name: z.string().optional().describe("Branch name to find MR"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      if (args.merge_request_iid) {
        const mr = await defaultClient.get(
          `/projects/${projectId}/merge_requests/${args.merge_request_iid}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(mr, null, 2) }] };
      }

      if (args.branch_name) {
        const query = buildQueryString({ source_branch: args.branch_name, state: "opened" });
        const mrs = await defaultClient.get<unknown[]>(
          `/projects/${projectId}/merge_requests${query}`,
        );
        if (mrs.length === 0) {
          return { content: [{ type: "text", text: "No merge request found for this branch" }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(mrs[0], null, 2) }] };
      }

      throw new Error("Either merge_request_iid or branch_name must be provided");
    },
  );
  toolRef.disable();
  tools.set("get_merge_request", toolRef);

  const toolRef2 = server.registerTool(
    "list_merge_requests",
    {
      title: "List Merge Requests",
      description: "List merge requests in a GitLab project with filtering options",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        state: z.enum(["opened", "closed", "merged", "all"]).optional().describe("MR state filter"),
        scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional().describe("Scope"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
        author_id: z
          .number()
          .optional()
          .describe("Author user ID (mutually exclusive with author_username)"),
        author_username: z
          .string()
          .optional()
          .describe("Author username (mutually exclusive with author_id)"),
        assignee_id: z
          .number()
          .optional()
          .describe("Assignee user ID (mutually exclusive with assignee_username)"),
        assignee_username: z
          .string()
          .optional()
          .describe("Assignee username (mutually exclusive with assignee_id)"),
        reviewer_id: z
          .number()
          .optional()
          .describe("Reviewer user ID (mutually exclusive with reviewer_username)"),
        reviewer_username: z
          .string()
          .optional()
          .describe("Reviewer username (mutually exclusive with reviewer_id)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListMergeRequestsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;

      // Prefer username over id when both provided (mutually exclusive in GitLab API)
      // Use !== undefined (not truthiness) because id=0 is valid ("no assignee/reviewer")
      if (queryParams.author_id !== undefined && queryParams.author_username) {
        delete queryParams.author_id;
      }
      if (queryParams.assignee_id !== undefined && queryParams.assignee_username) {
        delete queryParams.assignee_id;
      }
      if (queryParams.reviewer_id !== undefined && queryParams.reviewer_username) {
        delete queryParams.reviewer_id;
      }

      const query = buildQueryString(queryParams);

      const mrs = await defaultClient.get(`/projects/${projectId}/merge_requests${query}`);
      return { content: [{ type: "text", text: JSON.stringify(mrs, null, 2) }] };
    },
  );
  toolRef2.disable();
  tools.set("list_merge_requests", toolRef2);

  const toolRef3 = server.registerTool(
    "create_merge_request",
    {
      title: "Create Merge Request",
      description: "Create a new merge request in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        source_branch: z.string().describe("Source branch"),
        target_branch: z.string().describe("Target branch"),
        title: z.string().describe("MR title"),
        description: z.string().optional().describe("MR description"),
        assignee_id: z.number().optional().describe("Assignee user ID"),
        reviewer_ids: z.array(z.number()).optional().describe("Reviewer user IDs"),
        labels: z.string().optional().describe("Comma-separated labels"),
        remove_source_branch: z.boolean().optional().describe("Remove source branch after merge"),
        squash: z.boolean().optional().describe("Squash commits on merge"),
        draft: z.boolean().optional().describe("Create as draft MR"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateMergeRequestSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...body } = args;

      const mr = await defaultClient.post(`/projects/${projectId}/merge_requests`, body);
      return { content: [{ type: "text", text: JSON.stringify(mr, null, 2) }] };
    },
  );
  toolRef3.disable();
  tools.set("create_merge_request", toolRef3);

  const toolRef4 = server.registerTool(
    "update_merge_request",
    {
      title: "Update Merge Request",
      description: "Update a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        state_event: z.enum(["close", "reopen"]).optional().describe("State change"),
        assignee_id: z.number().optional().describe("Assignee user ID"),
        labels: z.string().optional().describe("Comma-separated labels"),
        target_branch: z.string().optional().describe("Target branch"),
        remove_source_branch: z.boolean().optional().describe("Remove source branch after merge"),
        squash: z.boolean().optional().describe("Squash commits on merge"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = UpdateMergeRequestSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, merge_request_iid, ...body } = args;

      const mr = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${merge_request_iid}`,
        body,
      );
      return { content: [{ type: "text", text: JSON.stringify(mr, null, 2) }] };
    },
  );
  toolRef4.disable();
  tools.set("update_merge_request", toolRef4);

  const toolRef5 = server.registerTool(
    "merge_merge_request",
    {
      title: "Merge Merge Request",
      description: "Merge a merge request in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        merge_commit_message: z.string().optional().describe("Custom merge commit message"),
        squash_commit_message: z.string().optional().describe("Custom squash commit message"),
        squash: z.boolean().optional().describe("Squash commits"),
        should_remove_source_branch: z.boolean().optional().describe("Remove source branch"),
        merge_when_pipeline_succeeds: z
          .boolean()
          .optional()
          .describe("Merge when pipeline succeeds"),
        sha: z.string().optional().describe("Expected HEAD SHA"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = MergeMergeRequestSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, merge_request_iid, ...body } = args;

      const mr = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${merge_request_iid}/merge`,
        body,
      );
      return { content: [{ type: "text", text: JSON.stringify(mr, null, 2) }] };
    },
  );
  toolRef5.disable();
  tools.set("merge_merge_request", toolRef5);

  const toolRef6 = server.registerTool(
    "get_merge_request_diffs",
    {
      title: "Get Merge Request Diffs",
      description:
        "Get the changes/diffs of a merge request. Supports excluded_file_patterns filtering using regex.",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
        excluded_file_patterns: z
          .array(z.string())
          .optional()
          .describe(
            'Array of regex patterns to exclude files. Examples: ["^vendor/", "\\.pb\\.go$"]',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestDiffsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const mr = await defaultClient.get<{
        changes?: Array<{ new_path: string; old_path: string; diff: string }>;
      }>(`/projects/${projectId}/merge_requests/${args.merge_request_iid}/changes${query}`);

      const changes = filterDiffsByPatterns(mr.changes ?? [], args.excluded_file_patterns);
      return {
        content: [{ type: "text", text: JSON.stringify({ ...mr, changes }, null, 2) }],
      };
    },
  );
  toolRef6.disable();
  tools.set("get_merge_request_diffs", toolRef6);

  const toolRef7 = server.registerTool(
    "mr_discussions",
    {
      title: "List MR Discussions",
      description: "List discussion items for a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListMergeRequestDiscussionsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const discussions = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/discussions${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(discussions, null, 2) }] };
    },
  );
  toolRef7.disable();
  tools.set("mr_discussions", toolRef7);

  const toolRef8 = server.registerTool(
    "create_merge_request_thread",
    {
      title: "Create MR Thread",
      description: "Create a new thread on a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        body: z.string().describe("Thread body"),
        position: z
          .object({
            base_sha: z.string(),
            start_sha: z.string(),
            head_sha: z.string(),
            position_type: z.enum(["text", "image"]),
            new_path: z.string().optional(),
            old_path: z.string().optional(),
            new_line: z.number().optional(),
            old_line: z.number().optional(),
          })
          .optional()
          .describe("Position for diff comment"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateMergeRequestThreadSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const thread = await defaultClient.post(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/discussions`,
        { body: args.body, position: args.position },
      );
      return { content: [{ type: "text", text: JSON.stringify(thread, null, 2) }] };
    },
  );
  toolRef8.disable();
  tools.set("create_merge_request_thread", toolRef8);

  const toolRef9 = server.registerTool(
    "resolve_merge_request_thread",
    {
      title: "Resolve MR Thread",
      description: "Resolve a thread on a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        discussion_id: z.string().describe("Discussion ID"),
        resolved: z.boolean().describe("Resolve or unresolve"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = ResolveMergeRequestThreadSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const thread = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/discussions/${args.discussion_id}`,
        { resolved: args.resolved },
      );
      return { content: [{ type: "text", text: JSON.stringify(thread, null, 2) }] };
    },
  );
  toolRef9.disable();
  tools.set("resolve_merge_request_thread", toolRef9);

  const toolRef10 = server.registerTool(
    "create_merge_request_note",
    {
      title: "Create MR Note",
      description: "Add a new note to a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        body: z.string().describe("Note body"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateMergeRequestNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const note = await defaultClient.post(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/notes`,
        { body: args.body },
      );
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    },
  );
  toolRef10.disable();
  tools.set("create_merge_request_note", toolRef10);

  const toolRef11 = server.registerTool(
    "update_merge_request_note",
    {
      title: "Update MR Note",
      description: "Modify an existing merge request note",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        note_id: z.number().describe("Note ID"),
        body: z.string().describe("New note body"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = UpdateMergeRequestNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const note = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/notes/${args.note_id}`,
        { body: args.body },
      );
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    },
  );
  toolRef11.disable();
  tools.set("update_merge_request_note", toolRef11);

  const toolRef12 = server.registerTool(
    "delete_merge_request_note",
    {
      title: "Delete MR Note",
      description: "Delete an existing merge request note",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        note_id: z.number().describe("Note ID"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = DeleteMergeRequestNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      await defaultClient.delete(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/notes/${args.note_id}`,
      );
      return { content: [{ type: "text", text: "Note deleted successfully" }] };
    },
  );
  toolRef12.disable();
  tools.set("delete_merge_request_note", toolRef12);

  const toolRef13 = server.registerTool(
    "get_merge_request_notes",
    {
      title: "Get MR Notes",
      description: "List notes for a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestNotesSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const notes = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/notes${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(notes, null, 2) }] };
    },
  );
  toolRef13.disable();
  tools.set("get_merge_request_notes", toolRef13);

  // --- Approvals ---

  const toolRef14 = server.registerTool(
    "approve_merge_request",
    {
      title: "Approve Merge Request",
      description: "Approve a merge request. Requires appropriate permissions.",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of the merge request to approve"),
        sha: z
          .string()
          .optional()
          .describe(
            "The HEAD of the merge request. Optional, but used to ensure the merge request hasn't changed since you last reviewed it",
          ),
        approval_password: z
          .string()
          .optional()
          .describe(
            "Current user's password. Required if 'Require user re-authentication to approve' is enabled in the project settings",
          ),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = ApproveMergeRequestSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const body: Record<string, unknown> = {};
      if (args.sha) body.sha = args.sha;
      if (args.approval_password) body.approval_password = args.approval_password;

      const result = await defaultClient.post(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/approve`,
        body,
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
  toolRef14.disable();
  tools.set("approve_merge_request", toolRef14);

  const toolRef15 = server.registerTool(
    "unapprove_merge_request",
    {
      title: "Unapprove Merge Request",
      description:
        "Unapprove a previously approved merge request. Requires appropriate permissions.",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of the merge request to unapprove"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = UnapproveMergeRequestSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const result = await defaultClient.post(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/unapprove`,
        {},
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
  toolRef15.disable();
  tools.set("unapprove_merge_request", toolRef15);

  const toolRef16 = server.registerTool(
    "get_merge_request_approval_state",
    {
      title: "Get MR Approval State",
      description:
        "Get merge request approval details including approvers (uses approval_state when available, falls back to approvals endpoint)",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of the merge request"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestApprovalStateSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const result = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/approval_state`,
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
  toolRef16.disable();
  tools.set("get_merge_request_approval_state", toolRef16);

  const toolRef17 = server.registerTool(
    "get_merge_request_conflicts",
    {
      title: "Get MR Conflicts",
      description: "Get the conflicts of a merge request in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of the merge request"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestConflictsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const result = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/conflicts`,
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
  toolRef17.disable();
  tools.set("get_merge_request_conflicts", toolRef17);

  // --- File diffs & versions ---

  const toolRef18 = server.registerTool(
    "list_merge_request_changed_files",
    {
      title: "List MR Changed Files",
      description:
        "STEP 1 of code review workflow. " +
        "Returns ONLY the list of changed file paths in a merge request — WITHOUT diff content. " +
        "Call this first to get file paths, then call get_merge_request_file_diff with multiple files in a single batched call (recommended 3-5 files per call). " +
        "Supports excluded_file_patterns filtering using regex.",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        excluded_file_patterns: z
          .array(z.string())
          .optional()
          .describe(
            'Array of regex patterns to exclude files. Examples: ["^vendor/", "\\.pb\\.go$"]',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListMergeRequestChangedFilesSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const mr = await defaultClient.get<{
        changes?: Array<{
          old_path: string;
          new_path: string;
          new_file: boolean;
          renamed_file: boolean;
          deleted_file: boolean;
        }>;
      }>(`/projects/${projectId}/merge_requests/${args.merge_request_iid}/changes`);

      let files = (mr.changes ?? []).map((c) => ({
        old_path: c.old_path,
        new_path: c.new_path,
        new_file: c.new_file,
        renamed_file: c.renamed_file,
        deleted_file: c.deleted_file,
      }));

      files = filterDiffsByPatterns(files, args.excluded_file_patterns);

      return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
    },
  );
  toolRef18.disable();
  tools.set("list_merge_request_changed_files", toolRef18);

  const toolRef19 = server.registerTool(
    "list_merge_request_diffs",
    {
      title: "List MR Diffs",
      description: "List merge request diffs with pagination support (uses the /diffs endpoint)",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        page: z.number().optional().describe("Page number for pagination (default: 1)"),
        per_page: z
          .number()
          .optional()
          .describe("Number of items per page (max: 100, default: 20)"),
        unidiff: z
          .boolean()
          .optional()
          .describe(
            "Present diffs in the unified diff format. Default is false. Introduced in GitLab 16.5.",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListMergeRequestDiffsApiSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({
        page: args.page,
        per_page: args.per_page,
        unidiff: args.unidiff,
      });

      const diffs = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/diffs${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(diffs, null, 2) }] };
    },
  );
  toolRef19.disable();
  tools.set("list_merge_request_diffs", toolRef19);

  const toolRef20 = server.registerTool(
    "get_merge_request_file_diff",
    {
      title: "Get MR File Diff",
      description:
        "STEP 2 of code review workflow. " +
        "Get diffs for one or more files from a merge request. " +
        "Call list_merge_request_changed_files first to get file paths, then pass them as an array to fetch their diffs efficiently. " +
        "Batching multiple files (recommended 3-5) is supported and preferred over individual requests. " +
        "Returns an array of results - one per requested file path.",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        file_paths: z
          .array(z.string())
          .describe(
            "List of file paths to retrieve diffs for (e.g. ['src/api/users.ts', 'src/repo/user.go']). " +
              "Call list_merge_request_changed_files first to get the full list of changed paths.",
          ),
        unidiff: z
          .boolean()
          .optional()
          .describe("Present diff in the unified diff format. Default is false."),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestFileDiffSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      // Fetch all diffs for the MR using pagination, then filter by requested file paths
      const allDiffs: Array<{
        old_path: string;
        new_path: string;
        diff: string;
        [key: string]: unknown;
      }> = [];
      let page = 1;
      const perPage = 100;
      while (true) {
        const pageQuery = buildQueryString({ unidiff: args.unidiff, page, per_page: perPage });
        const pageDiffs = await defaultClient.get<
          Array<{ old_path: string; new_path: string; diff: string; [key: string]: unknown }>
        >(`/projects/${projectId}/merge_requests/${args.merge_request_iid}/diffs${pageQuery}`);
        if (!Array.isArray(pageDiffs) || pageDiffs.length === 0) break;
        allDiffs.push(...pageDiffs);
        if (pageDiffs.length < perPage) break;
        page++;
      }

      const results = args.file_paths.map((filePath) => {
        const found = allDiffs.find((d) => d.new_path === filePath || d.old_path === filePath);
        if (found) {
          return found;
        }
        return { file_path: filePath, error: `File not found in merge request diffs: ${filePath}` };
      });

      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
  toolRef20.disable();
  tools.set("get_merge_request_file_diff", toolRef20);

  const toolRef21 = server.registerTool(
    "list_merge_request_versions",
    {
      title: "List MR Versions",
      description: "List all versions of a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The internal ID of the merge request"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListMergeRequestVersionsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const versions = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/versions`,
      );
      return { content: [{ type: "text", text: JSON.stringify(versions, null, 2) }] };
    },
  );
  toolRef21.disable();
  tools.set("list_merge_request_versions", toolRef21);

  const toolRef22 = server.registerTool(
    "get_merge_request_version",
    {
      title: "Get MR Version",
      description: "Get a specific version of a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The internal ID of the merge request"),
        version_id: z.number().describe("The ID of the merge request diff version"),
        unidiff: z
          .boolean()
          .optional()
          .describe(
            "Present diffs in the unified diff format. Default is false. Introduced in GitLab 16.5.",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestVersionSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({ unidiff: args.unidiff });

      const version = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/versions/${args.version_id}${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(version, null, 2) }] };
    },
  );
  toolRef22.disable();
  tools.set("get_merge_request_version", toolRef22);

  // --- Notes (additional) ---

  const toolRef23 = server.registerTool(
    "get_merge_request_note",
    {
      title: "Get MR Note",
      description: "Get a specific note for a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
        note_id: z.number().describe("The ID of a thread note"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const note = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/notes/${args.note_id}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    },
  );
  toolRef23.disable();
  tools.set("get_merge_request_note", toolRef23);

  const toolRef24 = server.registerTool(
    "delete_merge_request_discussion_note",
    {
      title: "Delete MR Discussion Note",
      description: "Delete a discussion note on a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
        discussion_id: z.string().describe("The ID of a thread"),
        note_id: z.number().describe("The ID of a thread note"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = DeleteMergeRequestDiscussionNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      await defaultClient.delete(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/discussions/${args.discussion_id}/notes/${args.note_id}`,
      );
      return {
        content: [{ type: "text", text: "Merge request discussion note deleted successfully" }],
      };
    },
  );
  toolRef24.disable();
  tools.set("delete_merge_request_discussion_note", toolRef24);

  const toolRef25 = server.registerTool(
    "update_merge_request_discussion_note",
    {
      title: "Update MR Discussion Note",
      description: "Update a discussion note on a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
        discussion_id: z.string().describe("The ID of a thread"),
        note_id: z.number().describe("The ID of a thread note"),
        body: z.string().optional().describe("The content of the note or reply"),
        resolved: z.boolean().optional().describe("Resolve or unresolve the note"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = UpdateMergeRequestDiscussionNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const body: Record<string, unknown> = {};
      if (args.body !== undefined) body.body = args.body;
      if (args.resolved !== undefined) body.resolved = args.resolved;

      const note = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/discussions/${args.discussion_id}/notes/${args.note_id}`,
        body,
      );
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    },
  );
  toolRef25.disable();
  tools.set("update_merge_request_discussion_note", toolRef25);

  const toolRef26 = server.registerTool(
    "create_merge_request_discussion_note",
    {
      title: "Create MR Discussion Note",
      description: "Add a new discussion note to an existing merge request thread",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
        discussion_id: z.string().describe("The ID of a thread"),
        body: z.string().describe("The content of the note or reply"),
        created_at: z
          .string()
          .optional()
          .describe("Date the note was created at (ISO 8601 format)"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateMergeRequestDiscussionNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const body: Record<string, unknown> = { body: args.body };
      if (args.created_at) body.created_at = args.created_at;

      const note = await defaultClient.post(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/discussions/${args.discussion_id}/notes`,
        body,
      );
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    },
  );
  toolRef26.disable();
  tools.set("create_merge_request_discussion_note", toolRef26);

  // --- Draft notes ---

  const toolRef27 = server.registerTool(
    "get_draft_note",
    {
      title: "Get Draft Note",
      description: "Get a single draft note from a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
        draft_note_id: z.number().describe("The ID of the draft note"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetDraftNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const draftNote = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/draft_notes/${args.draft_note_id}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(draftNote, null, 2) }] };
    },
  );
  toolRef27.disable();
  tools.set("get_draft_note", toolRef27);

  const toolRef28 = server.registerTool(
    "list_draft_notes",
    {
      title: "List Draft Notes",
      description: "List draft notes for a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListDraftNotesSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const draftNotes = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/draft_notes`,
      );
      return { content: [{ type: "text", text: JSON.stringify(draftNotes, null, 2) }] };
    },
  );
  toolRef28.disable();
  tools.set("list_draft_notes", toolRef28);

  const toolRef29 = server.registerTool(
    "create_draft_note",
    {
      title: "Create Draft Note",
      description: "Create a draft note for a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
        body: z.string().describe("The content of the draft note"),
        in_reply_to_discussion_id: z
          .string()
          .optional()
          .describe("The ID of a discussion the draft note replies to"),
        resolve_discussion: z
          .boolean()
          .optional()
          .describe("Whether to resolve the discussion when publishing"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateDraftNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const body: Record<string, unknown> = { note: args.body };
      if (args.in_reply_to_discussion_id)
        body.in_reply_to_discussion_id = args.in_reply_to_discussion_id;
      if (args.resolve_discussion !== undefined) body.resolve_discussion = args.resolve_discussion;

      const draftNote = await defaultClient.post(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/draft_notes`,
        body,
      );
      return { content: [{ type: "text", text: JSON.stringify(draftNote, null, 2) }] };
    },
  );
  toolRef29.disable();
  tools.set("create_draft_note", toolRef29);

  const toolRef30 = server.registerTool(
    "update_draft_note",
    {
      title: "Update Draft Note",
      description: "Update an existing draft note",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
        draft_note_id: z.number().describe("The ID of the draft note"),
        body: z.string().optional().describe("The content of the draft note"),
        resolve_discussion: z
          .boolean()
          .optional()
          .describe("Whether to resolve the discussion when publishing"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = UpdateDraftNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const body: Record<string, unknown> = {};
      if (args.body !== undefined) body.note = args.body;
      if (args.resolve_discussion !== undefined) body.resolve_discussion = args.resolve_discussion;

      const draftNote = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/draft_notes/${args.draft_note_id}`,
        body,
      );
      return { content: [{ type: "text", text: JSON.stringify(draftNote, null, 2) }] };
    },
  );
  toolRef30.disable();
  tools.set("update_draft_note", toolRef30);

  const toolRef31 = server.registerTool(
    "delete_draft_note",
    {
      title: "Delete Draft Note",
      description: "Delete a draft note",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
        draft_note_id: z.number().describe("The ID of the draft note"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = DeleteDraftNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      await defaultClient.delete(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/draft_notes/${args.draft_note_id}`,
      );
      return { content: [{ type: "text", text: "Draft note deleted successfully" }] };
    },
  );
  toolRef31.disable();
  tools.set("delete_draft_note", toolRef31);

  const toolRef32 = server.registerTool(
    "publish_draft_note",
    {
      title: "Publish Draft Note",
      description: "Publish a single draft note",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
        draft_note_id: z.number().describe("The ID of the draft note"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = PublishDraftNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const result = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/draft_notes/${args.draft_note_id}/publish`,
        {},
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
  toolRef32.disable();
  tools.set("publish_draft_note", toolRef32);

  const toolRef33 = server.registerTool(
    "bulk_publish_draft_notes",
    {
      title: "Bulk Publish Draft Notes",
      description: "Publish all draft notes for a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("The IID of a merge request"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = BulkPublishDraftNotesSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const result = await defaultClient.post(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/draft_notes/bulk_publish`,
        {},
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
  toolRef33.disable();
  tools.set("bulk_publish_draft_notes", toolRef33);

  logger.debug("Merge request tools registered", { count: tools.size });
  return tools;
}

import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQueryString, defaultClient, resolveProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";
import { projectFields } from "../utils/projection.js";
import { fieldsParam } from "../utils/schema-helpers.js";

// Compact set of commit fields. Identifies the commit, its parent chain,
// who made it, and the message. Drops `last_pipeline` (rarely needed in a
// list context) and trailers; keeps `parent_ids` (relevant for graph
// reasoning) and `web_url` (consistent with other list endpoints' compact
// defaults).
const LIST_COMMITS_DEFAULT_FIELDS = [
  "id",
  "short_id",
  "title",
  "message",
  "author_name",
  "author_email",
  "authored_date",
  "committed_date",
  "parent_ids",
  "web_url",
] as const;

const ListCommitsSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  ref_name: z.string().optional().describe("Branch or tag name"),
  since: z.string().optional().describe("Only commits after this date (ISO 8601)"),
  until: z.string().optional().describe("Only commits before this date (ISO 8601)"),
  path: z.string().optional().describe("File path to filter commits"),
  author: z.string().optional().describe("Filter by author email or name"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
  fields: fieldsParam("commit").optional(),
});

const GetCommitSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  sha: z.string().describe("Commit SHA"),
});

const GetCommitDiffSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  sha: z.string().describe("Commit SHA"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

export function registerCommitTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering commit tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef = server.registerTool(
    "list_commits",
    {
      title: "List Commits",
      description:
        "List repository commits with filtering options. Returns a compact set of fields per commit by default; pass `fields: 'all'` for the raw GitLab response or `fields: [...]` to pick your own.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        ref_name: z.string().optional().describe("Branch or tag name"),
        since: z.string().optional().describe("Only commits after this date (ISO 8601)"),
        until: z.string().optional().describe("Only commits before this date (ISO 8601)"),
        path: z.string().optional().describe("File path to filter commits"),
        author: z.string().optional().describe("Filter by author email or name"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
        fields: fieldsParam("commit").optional(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = ListCommitsSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, fields, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const commits = (await defaultClient.get(
        `/projects/${projectId}/repository/commits${query}`,
      )) as Record<string, unknown>[];
      const projected = projectFields(commits, LIST_COMMITS_DEFAULT_FIELDS, fields);
      return { content: [{ type: "text", text: JSON.stringify(projected, null, 2) }] };
    },
  );
  toolRef.disable();
  tools.set("list_commits", toolRef);

  const toolRef2 = server.registerTool(
    "get_commit",
    {
      title: "Get Commit",
      description: "Get details of a specific commit",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        sha: z.string().describe("Commit SHA"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = GetCommitSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);

      const commit = await defaultClient.get(
        `/projects/${projectId}/repository/commits/${args.sha}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(commit, null, 2) }] };
    },
  );
  toolRef2.disable();
  tools.set("get_commit", toolRef2);

  const toolRef3 = server.registerTool(
    "get_commit_diff",
    {
      title: "Get Commit Diff",
      description: "Get changes/diffs of a specific commit",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        sha: z.string().describe("Commit SHA"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = GetCommitDiffSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const diff = await defaultClient.get(
        `/projects/${projectId}/repository/commits/${args.sha}/diff${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(diff, null, 2) }] };
    },
  );
  toolRef3.disable();
  tools.set("get_commit_diff", toolRef3);

  logger.debug("Commit tools registered", { count: tools.size });
  return tools;
}

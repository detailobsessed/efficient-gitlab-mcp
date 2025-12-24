import { z } from "zod";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { buildQueryString, defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const ListCommitsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  ref_name: z.string().optional().describe("Branch or tag name"),
  since: z.string().optional().describe("Only commits after this date (ISO 8601)"),
  until: z.string().optional().describe("Only commits before this date (ISO 8601)"),
  path: z.string().optional().describe("File path to filter commits"),
  author: z.string().optional().describe("Filter by author email or name"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetCommitSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  sha: z.string().describe("Commit SHA"),
});

const GetCommitDiffSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  sha: z.string().describe("Commit SHA"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

export function registerCommitTools(target: ToolRegistrationTarget, logger: Logger): void {
  logger.debug("Registering commit tools");

  target.registerTool(
    "list_commits",
    {
      title: "List Commits",
      description: "List repository commits with filtering options",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        ref_name: z.string().optional().describe("Branch or tag name"),
        since: z.string().optional().describe("Only commits after this date (ISO 8601)"),
        until: z.string().optional().describe("Only commits before this date (ISO 8601)"),
        path: z.string().optional().describe("File path to filter commits"),
        author: z.string().optional().describe("Filter by author email or name"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListCommitsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const commits = await defaultClient.get(`/projects/${projectId}/repository/commits${query}`);
      return { content: [{ type: "text", text: JSON.stringify(commits, null, 2) }] };
    },
  );

  target.registerTool(
    "get_commit",
    {
      title: "Get Commit",
      description: "Get details of a specific commit",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        sha: z.string().describe("Commit SHA"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetCommitSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const commit = await defaultClient.get(
        `/projects/${projectId}/repository/commits/${args.sha}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(commit, null, 2) }] };
    },
  );

  target.registerTool(
    "get_commit_diff",
    {
      title: "Get Commit Diff",
      description: "Get changes/diffs of a specific commit",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        sha: z.string().describe("Commit SHA"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetCommitDiffSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const diff = await defaultClient.get(
        `/projects/${projectId}/repository/commits/${args.sha}/diff${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(diff, null, 2) }] };
    },
  );

  logger.debug("Commit tools registered", { count: 3 });
}

import { z } from "zod";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { buildQueryString, defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const SearchScopeEnum = z.enum([
  "projects",
  "issues",
  "merge_requests",
  "milestones",
  "snippet_titles",
  "users",
  "wiki_blobs",
  "commits",
  "blobs",
  "notes",
]);

const GlobalSearchSchema = z.object({
  scope: SearchScopeEnum.describe(
    "Search scope: projects, issues, merge_requests, milestones, snippet_titles, users. Premium/Ultimate: wiki_blobs, commits, blobs, notes",
  ),
  search: z.string().describe("Search query term"),
  state: z
    .enum(["opened", "closed", "merged", "all"])
    .optional()
    .describe("Filter by state (issues and merge_requests only)"),
  confidential: z.boolean().optional().describe("Filter by confidentiality (issues only)"),
  order_by: z.literal("created_at").optional().describe("Order by created_at"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
});

const ProjectSearchSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  scope: SearchScopeEnum.describe(
    "Search scope: issues, merge_requests, milestones, users. Premium/Ultimate: wiki_blobs, commits, blobs, notes",
  ),
  search: z.string().describe("Search query term"),
  ref: z.string().optional().describe("Branch/tag name for blobs and commits scope"),
  state: z
    .enum(["opened", "closed", "merged", "all"])
    .optional()
    .describe("Filter by state (issues and merge_requests only)"),
  confidential: z.boolean().optional().describe("Filter by confidentiality (issues only)"),
  order_by: z.literal("created_at").optional().describe("Order by created_at"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
});

const GroupSearchSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  scope: SearchScopeEnum.describe(
    "Search scope: projects, issues, merge_requests, milestones, users. Premium/Ultimate: wiki_blobs, commits, blobs, notes",
  ),
  search: z.string().describe("Search query term"),
  state: z
    .enum(["opened", "closed", "merged", "all"])
    .optional()
    .describe("Filter by state (issues and merge_requests only)"),
  confidential: z.boolean().optional().describe("Filter by confidentiality (issues only)"),
  order_by: z.literal("created_at").optional().describe("Order by created_at"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
});

export function registerSearchTools(target: ToolRegistrationTarget, logger: Logger): void {
  logger.debug("Registering search tools");

  target.registerTool(
    "global_search",
    {
      title: "Global Search",
      description:
        "Search across the entire GitLab instance. Scopes: projects, issues, merge_requests, milestones, snippet_titles, users. Premium/Ultimate adds: wiki_blobs, commits, blobs (code), notes.",
      inputSchema: {
        scope: SearchScopeEnum.describe(
          "Search scope: projects, issues, merge_requests, milestones, snippet_titles, users. Premium/Ultimate: wiki_blobs, commits, blobs, notes",
        ),
        search: z.string().describe("Search query term"),
        state: z
          .enum(["opened", "closed", "merged", "all"])
          .optional()
          .describe("Filter by state (issues and merge_requests only)"),
        confidential: z.boolean().optional().describe("Filter by confidentiality (issues only)"),
        order_by: z.literal("created_at").optional().describe("Order by created_at"),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page (max 100)"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      const args = GlobalSearchSchema.parse(params);
      const query = buildQueryString(args);

      const results = await defaultClient.get(`/search${query}`);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  target.registerTool(
    "project_search",
    {
      title: "Project Search",
      description:
        "Search within a specific project. Scopes: issues, merge_requests, milestones, users. Premium/Ultimate adds: wiki_blobs, commits, blobs (code), notes.",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        scope: SearchScopeEnum.describe(
          "Search scope: issues, merge_requests, milestones, users. Premium/Ultimate: wiki_blobs, commits, blobs, notes",
        ),
        search: z.string().describe("Search query term"),
        ref: z.string().optional().describe("Branch/tag name for blobs and commits scope"),
        state: z
          .enum(["opened", "closed", "merged", "all"])
          .optional()
          .describe("Filter by state (issues and merge_requests only)"),
        confidential: z.boolean().optional().describe("Filter by confidentiality (issues only)"),
        order_by: z.literal("created_at").optional().describe("Order by created_at"),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page (max 100)"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      const args = ProjectSearchSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const results = await defaultClient.get(`/projects/${projectId}/search${query}`);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  target.registerTool(
    "group_search",
    {
      title: "Group Search",
      description:
        "Search within a specific group. Scopes: projects, issues, merge_requests, milestones, users. Premium/Ultimate adds: wiki_blobs, commits, blobs (code), notes.",
      inputSchema: {
        group_id: z.string().describe("Group ID or URL-encoded path"),
        scope: SearchScopeEnum.describe(
          "Search scope: projects, issues, merge_requests, milestones, users. Premium/Ultimate: wiki_blobs, commits, blobs, notes",
        ),
        search: z.string().describe("Search query term"),
        state: z
          .enum(["opened", "closed", "merged", "all"])
          .optional()
          .describe("Filter by state (issues and merge_requests only)"),
        confidential: z.boolean().optional().describe("Filter by confidentiality (issues only)"),
        order_by: z.literal("created_at").optional().describe("Order by created_at"),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page (max 100)"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      const args = GroupSearchSchema.parse(params);
      const groupId = encodeProjectId(args.group_id);
      const { group_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const results = await defaultClient.get(`/groups/${groupId}/search${query}`);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  logger.debug("Search tools registered", { count: 3 });
}

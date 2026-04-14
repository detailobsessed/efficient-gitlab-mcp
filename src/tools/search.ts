import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildQueryString,
  defaultClient,
  encodeProjectId,
  resolveProjectId,
} from "../utils/gitlab-client.js";
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
  confidential: z.coerce.boolean().optional().describe("Filter by confidentiality (issues only)"),
  order_by: z.literal("created_at").optional().describe("Order by created_at"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
});

const ProjectSearchSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  scope: SearchScopeEnum.describe(
    "Search scope: issues, merge_requests, milestones, users. Premium/Ultimate: wiki_blobs, commits, blobs, notes",
  ),
  search: z.string().describe("Search query term"),
  ref: z.string().optional().describe("Branch/tag name for blobs and commits scope"),
  state: z
    .enum(["opened", "closed", "merged", "all"])
    .optional()
    .describe("Filter by state (issues and merge_requests only)"),
  confidential: z.coerce.boolean().optional().describe("Filter by confidentiality (issues only)"),
  order_by: z.literal("created_at").optional().describe("Order by created_at"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
});

const SearchCodeSchema = z.object({
  search: z
    .string()
    .describe(
      'Code search query string. Supports rich inline syntax on instances with exact code search (Zoekt): "class foo" (exact match), foo file:\\.js$ (file pattern), foo lang:ruby (language), sym:foo (symbol search), foo -bar (negation), case:yes (case-sensitive).',
    ),
  filename: z.string().optional().describe("Filter by filename (supports * wildcard, e.g. '*.ts')"),
  path: z
    .string()
    .optional()
    .describe("Filter by file path (supports * wildcard, e.g. 'src/utils/*')"),
  extension: z
    .string()
    .optional()
    .describe("Filter by file extension without dot (e.g. 'py', 'ts')"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
});

const SearchProjectCodeSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  search: z
    .string()
    .describe(
      "Code search query string. Supports rich inline syntax on instances with exact code search (Zoekt).",
    ),
  ref: z.string().optional().describe("Branch or tag to search in (defaults to default branch)"),
  filename: z.string().optional().describe("Filter by filename (supports * wildcard, e.g. '*.ts')"),
  path: z
    .string()
    .optional()
    .describe("Filter by file path (supports * wildcard, e.g. 'src/utils/*')"),
  extension: z
    .string()
    .optional()
    .describe("Filter by file extension without dot (e.g. 'py', 'ts')"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
});

const SearchGroupCodeSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  search: z
    .string()
    .describe(
      "Code search query string. Supports rich inline syntax on instances with exact code search (Zoekt).",
    ),
  filename: z.string().optional().describe("Filter by filename (supports * wildcard, e.g. '*.ts')"),
  path: z
    .string()
    .optional()
    .describe("Filter by file path (supports * wildcard, e.g. 'src/utils/*')"),
  extension: z
    .string()
    .optional()
    .describe("Filter by file extension without dot (e.g. 'py', 'ts')"),
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
  confidential: z.coerce.boolean().optional().describe("Filter by confidentiality (issues only)"),
  order_by: z.literal("created_at").optional().describe("Order by created_at"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
});

export function registerSearchTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering search tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef = server.registerTool(
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
        confidential: z.coerce
          .boolean()
          .optional()
          .describe("Filter by confidentiality (issues only)"),
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
  toolRef.disable();
  tools.set("global_search", toolRef);

  const toolRef2 = server.registerTool(
    "project_search",
    {
      title: "Project Search",
      description:
        "Search within a specific project. Scopes: issues, merge_requests, milestones, users. Premium/Ultimate adds: wiki_blobs, commits, blobs (code), notes.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        scope: SearchScopeEnum.describe(
          "Search scope: issues, merge_requests, milestones, users. Premium/Ultimate: wiki_blobs, commits, blobs, notes",
        ),
        search: z.string().describe("Search query term"),
        ref: z.string().optional().describe("Branch/tag name for blobs and commits scope"),
        state: z
          .enum(["opened", "closed", "merged", "all"])
          .optional()
          .describe("Filter by state (issues and merge_requests only)"),
        confidential: z.coerce
          .boolean()
          .optional()
          .describe("Filter by confidentiality (issues only)"),
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
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const results = await defaultClient.get(`/projects/${projectId}/search${query}`);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );
  toolRef2.disable();
  tools.set("project_search", toolRef2);

  const toolRef3 = server.registerTool(
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
        confidential: z.coerce
          .boolean()
          .optional()
          .describe("Filter by confidentiality (issues only)"),
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
  toolRef3.disable();
  tools.set("group_search", toolRef3);

  const toolRef4 = server.registerTool(
    "search_code",
    {
      title: "Search Code",
      description:
        "Search for code across the entire GitLab instance using scope=blobs. Returns matching file content with line numbers. Supports Zoekt advanced syntax on compatible instances.",
      inputSchema: {
        search: z
          .string()
          .describe(
            'Code search query string. Supports rich inline syntax: "class foo" (exact match), foo file:\\.js$ (file pattern), foo lang:ruby (language), sym:foo (symbol search).',
          ),
        filename: z.string().optional().describe("Filter by filename (supports * wildcard)"),
        path: z.string().optional().describe("Filter by file path (supports * wildcard)"),
        extension: z
          .string()
          .optional()
          .describe("Filter by file extension without dot (e.g. 'py', 'ts')"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page (max 100)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = SearchCodeSchema.parse(params);
      const query = buildQueryString({ ...args, scope: "blobs" });

      const results = await defaultClient.get(`/search${query}`);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
  toolRef4.disable();
  tools.set("search_code", toolRef4);

  const toolRef5 = server.registerTool(
    "search_project_code",
    {
      title: "Search Project Code",
      description:
        "Search for code within a specific project using scope=blobs. Returns matching file content with line numbers.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        search: z.string().describe("Code search query string."),
        ref: z
          .string()
          .optional()
          .describe("Branch or tag to search in (defaults to default branch)"),
        filename: z.string().optional().describe("Filter by filename (supports * wildcard)"),
        path: z.string().optional().describe("Filter by file path (supports * wildcard)"),
        extension: z
          .string()
          .optional()
          .describe("Filter by file extension without dot (e.g. 'py', 'ts')"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page (max 100)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = SearchProjectCodeSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString({ ...queryParams, scope: "blobs" });

      const results = await defaultClient.get(`/projects/${projectId}/search${query}`);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
  toolRef5.disable();
  tools.set("search_project_code", toolRef5);

  const toolRef6 = server.registerTool(
    "search_group_code",
    {
      title: "Search Group Code",
      description:
        "Search for code within a specific group using scope=blobs. Returns matching file content with line numbers.",
      inputSchema: {
        group_id: z.string().describe("Group ID or URL-encoded path"),
        search: z.string().describe("Code search query string."),
        filename: z.string().optional().describe("Filter by filename (supports * wildcard)"),
        path: z.string().optional().describe("Filter by file path (supports * wildcard)"),
        extension: z
          .string()
          .optional()
          .describe("Filter by file extension without dot (e.g. 'py', 'ts')"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page (max 100)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = SearchGroupCodeSchema.parse(params);
      const groupId = encodeProjectId(args.group_id);
      const { group_id: _, ...queryParams } = args;
      const query = buildQueryString({ ...queryParams, scope: "blobs" });

      const results = await defaultClient.get(`/groups/${groupId}/search${query}`);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
  toolRef6.disable();
  tools.set("search_group_code", toolRef6);

  logger.debug("Search tools registered", { count: tools.size });
  return tools;
}

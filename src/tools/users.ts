import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQueryString, defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const GetUsersSchema = z.object({
  usernames: z.array(z.string()).describe("List of usernames to look up"),
});

const GetUserSchema = z.object({
  user_id: z.number().describe("User ID"),
});

const SearchUsersSchema = z.object({
  search: z.string().describe("Search query"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const ListEventsSchema = z.object({
  action: z
    .string()
    .optional()
    .describe("If defined, returns events with the specified action type"),
  target_type: z
    .enum(["epic", "issue", "merge_request", "milestone", "note", "project", "snippet", "user"])
    .optional()
    .describe("If defined, returns events with the specified target type"),
  before: z
    .string()
    .optional()
    .describe(
      "Returns events created before the specified date (YYYY-MM-DD format). To include events on 2025-08-29, use before=2025-08-30",
    ),
  after: z
    .string()
    .optional()
    .describe(
      "Returns events created after the specified date (YYYY-MM-DD format). To include events on 2025-08-29, use after=2025-08-28",
    ),
  scope: z.string().optional().describe("Include all events across a user's projects"),
  sort: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Direction to sort the results by creation date. Default: desc"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetProjectEventsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  action: z
    .string()
    .optional()
    .describe("If defined, returns events with the specified action type"),
  target_type: z
    .enum(["epic", "issue", "merge_request", "milestone", "note", "project", "snippet", "user"])
    .optional()
    .describe("If defined, returns events with the specified target type"),
  before: z
    .string()
    .optional()
    .describe(
      "Returns events created before the specified date (YYYY-MM-DD format). To include events on 2025-08-29, use before=2025-08-30",
    ),
  after: z
    .string()
    .optional()
    .describe(
      "Returns events created after the specified date (YYYY-MM-DD format). To include events on 2025-08-29, use after=2025-08-28",
    ),
  sort: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Direction to sort the results by creation date. Default: desc"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const UploadMarkdownSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path of the project"),
  file_path: z.string().describe("Path to the file to upload"),
});

const DownloadAttachmentSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path of the project"),
  secret: z.string().describe("The 32-character secret of the upload"),
  filename: z.string().describe("The filename of the upload"),
  local_path: z
    .string()
    .optional()
    .describe("Local path to save the file (optional, defaults to current directory)"),
});

export function registerUserTools(server: McpServer, logger: Logger): Map<string, RegisteredTool> {
  logger.debug("Registering user tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef = server.registerTool(
    "get_users",
    {
      title: "Get Users",
      description: "Get GitLab user details by usernames",
      inputSchema: {
        usernames: z.array(z.string()).describe("List of usernames to look up"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetUsersSchema.parse(params);
      const results: Record<string, unknown> = {};

      for (const username of args.usernames) {
        const query = buildQueryString({ username });
        const users = await defaultClient.get<unknown[]>(`/users${query}`);
        if (users.length > 0) {
          results[username] = users[0];
        }
      }

      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
  toolRef.disable();
  tools.set("get_users", toolRef);

  const toolRef2 = server.registerTool(
    "get_user",
    {
      title: "Get User",
      description: "Get details of a specific user by ID",
      inputSchema: {
        user_id: z.number().describe("User ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetUserSchema.parse(params);
      const user = await defaultClient.get(`/users/${args.user_id}`);
      return { content: [{ type: "text", text: JSON.stringify(user, null, 2) }] };
    },
  );
  toolRef2.disable();
  tools.set("get_user", toolRef2);

  const toolRef3 = server.registerTool(
    "search_users",
    {
      title: "Search Users",
      description: "Search for GitLab users",
      inputSchema: {
        search: z.string().describe("Search query"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = SearchUsersSchema.parse(params);
      const query = buildQueryString(args);

      const users = await defaultClient.get(`/users${query}`);
      return { content: [{ type: "text", text: JSON.stringify(users, null, 2) }] };
    },
  );
  toolRef3.disable();
  tools.set("search_users", toolRef3);

  const toolRef4 = server.registerTool(
    "list_events",
    {
      title: "List Events",
      description:
        "List all events for the currently authenticated user. Note: before/after parameters accept date format YYYY-MM-DD only",
      inputSchema: {
        action: z
          .string()
          .optional()
          .describe("If defined, returns events with the specified action type"),
        target_type: z
          .enum([
            "epic",
            "issue",
            "merge_request",
            "milestone",
            "note",
            "project",
            "snippet",
            "user",
          ])
          .optional()
          .describe("If defined, returns events with the specified target type"),
        before: z
          .string()
          .optional()
          .describe("Returns events created before the specified date (YYYY-MM-DD format)"),
        after: z
          .string()
          .optional()
          .describe("Returns events created after the specified date (YYYY-MM-DD format)"),
        scope: z.string().optional().describe("Include all events across a user's projects"),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort direction. Default: desc"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListEventsSchema.parse(params);
      const query = buildQueryString(args);

      const events = await defaultClient.get(`/events${query}`);
      return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
    },
  );
  toolRef4.disable();
  tools.set("list_events", toolRef4);

  const toolRef5 = server.registerTool(
    "get_project_events",
    {
      title: "Get Project Events",
      description:
        "List all visible events for a specified project. Note: before/after parameters accept date format YYYY-MM-DD only",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        action: z
          .string()
          .optional()
          .describe("If defined, returns events with the specified action type"),
        target_type: z
          .enum([
            "epic",
            "issue",
            "merge_request",
            "milestone",
            "note",
            "project",
            "snippet",
            "user",
          ])
          .optional()
          .describe("If defined, returns events with the specified target type"),
        before: z
          .string()
          .optional()
          .describe("Returns events created before the specified date (YYYY-MM-DD format)"),
        after: z
          .string()
          .optional()
          .describe("Returns events created after the specified date (YYYY-MM-DD format)"),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort direction. Default: desc"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetProjectEventsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const events = await defaultClient.get(`/projects/${projectId}/events${query}`);
      return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
    },
  );
  toolRef5.disable();
  tools.set("get_project_events", toolRef5);

  const toolRef6 = server.registerTool(
    "upload_markdown",
    {
      title: "Upload Markdown",
      description: "Upload a file to a GitLab project for use in markdown content",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path of the project"),
        file_path: z.string().describe("Path to the file to upload"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = UploadMarkdownSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const upload = await defaultClient.post(`/projects/${projectId}/uploads`, {
        file: args.file_path,
      });
      return { content: [{ type: "text", text: JSON.stringify(upload, null, 2) }] };
    },
  );
  toolRef6.disable();
  tools.set("upload_markdown", toolRef6);

  const toolRef7 = server.registerTool(
    "download_attachment",
    {
      title: "Download Attachment",
      description:
        "Download an uploaded file from a GitLab project by secret and filename. Returns the file content or saves to disk.",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path of the project"),
        secret: z.string().describe("The 32-character secret of the upload"),
        filename: z.string().describe("The filename of the upload"),
        local_path: z.string().optional().describe("Local path to save the file (optional)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = DownloadAttachmentSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const response = await fetch(
        `${defaultClient.getApiUrl()}/projects/${projectId}/uploads/${args.secret}/${args.filename}`,
        {
          headers: {
            "PRIVATE-TOKEN": process.env.GITLAB_PERSONAL_ACCESS_TOKEN ?? "",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to download attachment: ${response.status}`);
      }

      const text = await response.text();
      return { content: [{ type: "text", text }] };
    },
  );
  toolRef7.disable();
  tools.set("download_attachment", toolRef7);

  logger.debug("User tools registered", { count: tools.size });
  return tools;
}

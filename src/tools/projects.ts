import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQueryString, defaultClient, resolveProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

// GitLab project responses include `runners_token` for projects the caller
// can administer. That field is a CI-runner registration secret — leaking it
// into LLM transcripts (or any logging pipeline) is a real risk. We redact it
// by default and only retain when the caller explicitly passes
// `include_secrets: true`.
function redactProjectSecrets(value: unknown, includeSecrets: boolean): unknown {
  if (includeSecrets) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactProjectSecrets(item, false));
  }
  if (value && typeof value === "object") {
    const { runners_token: _redacted, ...rest } = value as Record<string, unknown>;
    return rest;
  }
  return value;
}

const GetProjectSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  license: z.coerce.boolean().optional().describe("Include license info"),
  statistics: z.coerce.boolean().optional().describe("Include project statistics"),
  with_custom_attributes: z.coerce.boolean().optional().describe("Include custom attributes"),
  include_secrets: z.coerce
    .boolean()
    .optional()
    .describe("Include sensitive fields like runners_token (default: false)"),
});

const ListProjectsSchema = z.object({
  search: z.string().optional().describe("Search query"),
  visibility: z.enum(["public", "internal", "private"]).optional().describe("Visibility filter"),
  owned: z.coerce.boolean().optional().describe("Only owned projects"),
  membership: z.coerce.boolean().optional().describe("Only member projects"),
  starred: z.coerce.boolean().optional().describe("Only starred projects"),
  archived: z.coerce.boolean().optional().describe("Include archived projects"),
  order_by: z
    .enum(["id", "name", "path", "created_at", "updated_at", "last_activity_at"])
    .optional(),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
  include_secrets: z.coerce
    .boolean()
    .optional()
    .describe("Include sensitive fields like runners_token (default: false)"),
});

const ListProjectMembersSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  query: z.string().optional().describe("Search query"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const ListLabelsSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  search: z.string().optional().describe("Search query"),
  with_counts: z.coerce
    .boolean()
    .optional()
    .describe("Include open_issues_count / closed_issues_count per label"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetLabelSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
});

const CreateLabelSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  name: z.string().describe("Label name"),
  color: z.string().describe("Label color (hex format)"),
  description: z.string().optional().describe("Label description"),
  priority: z.number().optional().describe("Label priority"),
});

const UpdateLabelSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
  new_name: z.string().optional().describe("New label name"),
  color: z.string().optional().describe("New label color"),
  description: z.string().optional().describe("New description"),
  priority: z.number().optional().describe("New priority"),
});

const DeleteLabelSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
});

const ListGroupIterationsSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  state: z
    .enum(["opened", "upcoming", "current", "closed", "all"])
    .optional()
    .describe("Return opened, upcoming, current, closed, or all iterations."),
  search: z
    .string()
    .optional()
    .describe("Return only iterations with a title matching the provided string."),
  search_in: z
    .array(z.enum(["title", "cadence_title"]))
    .optional()
    .describe("Fields in which fuzzy search should be performed. Default is [title]."),
  include_ancestors: z
    .boolean()
    .optional()
    .describe("Include iterations for group and its ancestors. Defaults to true."),
  include_descendants: z
    .boolean()
    .optional()
    .describe("Include iterations for group and its descendants. Defaults to false."),
  updated_before: z
    .string()
    .optional()
    .describe("Return only iterations updated before the given datetime (ISO 8601 format)."),
  updated_after: z
    .string()
    .optional()
    .describe("Return only iterations updated after the given datetime (ISO 8601 format)."),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const ListGroupProjectsSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  search: z.string().optional().describe("Search query"),
  visibility: z.enum(["public", "internal", "private"]).optional().describe("Visibility filter"),
  archived: z.coerce.boolean().optional().describe("Include archived projects"),
  order_by: z
    .enum(["id", "name", "path", "created_at", "updated_at", "last_activity_at"])
    .optional(),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
  include_secrets: z.coerce
    .boolean()
    .optional()
    .describe("Include sensitive fields like runners_token (default: false)"),
});

export function registerProjectTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering project tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef = server.registerTool(
    "get_project",
    {
      title: "Get Project",
      description: "Get details of a specific project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        license: z.coerce.boolean().optional().describe("Include license info"),
        statistics: z.coerce.boolean().optional().describe("Include project statistics"),
        with_custom_attributes: z.coerce.boolean().optional().describe("Include custom attributes"),
        include_secrets: z.coerce
          .boolean()
          .optional()
          .describe("Include sensitive fields like runners_token (default: false)"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = GetProjectSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const query = buildQueryString({
        license: args.license,
        statistics: args.statistics,
        with_custom_attributes: args.with_custom_attributes,
      });

      const project = await defaultClient.get(`/projects/${projectId}${query}`);
      const redacted = redactProjectSecrets(project, args.include_secrets ?? false);
      return { content: [{ type: "text", text: JSON.stringify(redacted, null, 2) }] };
    },
  );
  toolRef.disable();
  tools.set("get_project", toolRef);

  const toolRef2 = server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description: "List projects accessible by the current user",
      inputSchema: {
        search: z.string().optional().describe("Search query"),
        visibility: z.enum(["public", "internal", "private"]).optional().describe("Visibility"),
        owned: z.coerce.boolean().optional().describe("Only owned projects"),
        membership: z.coerce.boolean().optional().describe("Only member projects"),
        starred: z.coerce.boolean().optional().describe("Only starred projects"),
        archived: z.coerce.boolean().optional().describe("Include archived projects"),
        order_by: z
          .enum(["id", "name", "path", "created_at", "updated_at", "last_activity_at"])
          .optional(),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
        include_secrets: z.coerce
          .boolean()
          .optional()
          .describe("Include sensitive fields like runners_token (default: false)"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = ListProjectsSchema.parse(params);
      const { include_secrets, ...queryArgs } = args;
      const query = buildQueryString(queryArgs);

      const projects = await defaultClient.get(`/projects${query}`);
      const redacted = redactProjectSecrets(projects, include_secrets ?? false);
      return { content: [{ type: "text", text: JSON.stringify(redacted, null, 2) }] };
    },
  );
  toolRef2.disable();
  tools.set("list_projects", toolRef2);

  const toolRef3 = server.registerTool(
    "list_project_members",
    {
      title: "List Project Members",
      description: "List members of a GitLab project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        query: z.string().optional().describe("Search query"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = ListProjectMembersSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const query = buildQueryString({
        query: args.query,
        page: args.page,
        per_page: args.per_page,
      });

      const members = await defaultClient.get(`/projects/${projectId}/members${query}`);
      return { content: [{ type: "text", text: JSON.stringify(members, null, 2) }] };
    },
  );
  toolRef3.disable();
  tools.set("list_project_members", toolRef3);

  const toolRef4 = server.registerTool(
    "list_labels",
    {
      title: "List Labels",
      description: "List labels for a project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        search: z.string().optional().describe("Search query"),
        with_counts: z.coerce
          .boolean()
          .optional()
          .describe("Include open_issues_count / closed_issues_count per label"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = ListLabelsSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const query = buildQueryString({
        search: args.search,
        with_counts: args.with_counts,
        page: args.page,
        per_page: args.per_page,
      });

      const labels = await defaultClient.get(`/projects/${projectId}/labels${query}`);
      return { content: [{ type: "text", text: JSON.stringify(labels, null, 2) }] };
    },
  );
  toolRef4.disable();
  tools.set("list_labels", toolRef4);

  const toolRef5 = server.registerTool(
    "get_label",
    {
      title: "Get Label",
      description: "Get a single label from a project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = GetLabelSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const labelId = encodeURIComponent(String(args.label_id));

      const label = await defaultClient.get(`/projects/${projectId}/labels/${labelId}`);
      return { content: [{ type: "text", text: JSON.stringify(label, null, 2) }] };
    },
  );
  toolRef5.disable();
  tools.set("get_label", toolRef5);

  const toolRef6 = server.registerTool(
    "create_label",
    {
      title: "Create Label",
      description: "Create a new label in a project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        name: z.string().describe("Label name"),
        color: z.string().describe("Label color (hex format)"),
        description: z.string().optional().describe("Label description"),
        priority: z.number().optional().describe("Label priority"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = CreateLabelSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...body } = args;

      const label = await defaultClient.post(`/projects/${projectId}/labels`, body);
      return { content: [{ type: "text", text: JSON.stringify(label, null, 2) }] };
    },
  );
  toolRef6.disable();
  tools.set("create_label", toolRef6);

  const toolRef7 = server.registerTool(
    "update_label",
    {
      title: "Update Label",
      description: "Update an existing label in a project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
        new_name: z.string().optional().describe("New label name"),
        color: z.string().optional().describe("New label color"),
        description: z.string().optional().describe("New description"),
        priority: z.number().optional().describe("New priority"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = UpdateLabelSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const labelId = encodeURIComponent(String(args.label_id));
      const { project_id: _, label_id: __, ...body } = args;

      const label = await defaultClient.put(`/projects/${projectId}/labels/${labelId}`, body);
      return { content: [{ type: "text", text: JSON.stringify(label, null, 2) }] };
    },
  );
  toolRef7.disable();
  tools.set("update_label", toolRef7);

  const toolRef8 = server.registerTool(
    "delete_label",
    {
      title: "Delete Label",
      description: "Delete a label from a project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = DeleteLabelSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const labelId = encodeURIComponent(String(args.label_id));

      await defaultClient.delete(`/projects/${projectId}/labels/${labelId}`);
      return { content: [{ type: "text", text: "Label deleted successfully" }] };
    },
  );
  toolRef8.disable();
  tools.set("delete_label", toolRef8);

  const toolRef9 = server.registerTool(
    "list_group_projects",
    {
      title: "List Group Projects",
      description: "List projects in a GitLab group with filtering options",
      inputSchema: {
        group_id: z.string().describe("Group ID or URL-encoded path"),
        search: z.string().optional().describe("Search query"),
        visibility: z.enum(["public", "internal", "private"]).optional().describe("Visibility"),
        archived: z.coerce.boolean().optional().describe("Include archived projects"),
        order_by: z
          .enum(["id", "name", "path", "created_at", "updated_at", "last_activity_at"])
          .optional(),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
        include_secrets: z.coerce
          .boolean()
          .optional()
          .describe("Include sensitive fields like runners_token (default: false)"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = ListGroupProjectsSchema.parse(params);
      const groupId = encodeURIComponent(args.group_id);
      const { group_id: _, include_secrets, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const projects = await defaultClient.get(`/groups/${groupId}/projects${query}`);
      const redacted = redactProjectSecrets(projects, include_secrets ?? false);
      return { content: [{ type: "text", text: JSON.stringify(redacted, null, 2) }] };
    },
  );
  toolRef9.disable();
  tools.set("list_group_projects", toolRef9);

  const toolRef10 = server.registerTool(
    "list_group_iterations",
    {
      title: "List Group Iterations",
      description: "List group iterations with filtering options",
      inputSchema: {
        group_id: z.string().describe("Group ID or URL-encoded path"),
        state: z
          .enum(["opened", "upcoming", "current", "closed", "all"])
          .optional()
          .describe("Return opened, upcoming, current, closed, or all iterations."),
        search: z
          .string()
          .optional()
          .describe("Return only iterations with a title matching the provided string."),
        search_in: z
          .array(z.enum(["title", "cadence_title"]))
          .optional()
          .describe("Fields in which fuzzy search should be performed. Default is [title]."),
        include_ancestors: z
          .boolean()
          .optional()
          .describe("Include iterations for group and its ancestors. Defaults to true."),
        include_descendants: z
          .boolean()
          .optional()
          .describe("Include iterations for group and its descendants. Defaults to false."),
        updated_before: z
          .string()
          .optional()
          .describe("Return only iterations updated before the given datetime (ISO 8601 format)."),
        updated_after: z
          .string()
          .optional()
          .describe("Return only iterations updated after the given datetime (ISO 8601 format)."),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = ListGroupIterationsSchema.parse(params);
      const groupId = encodeURIComponent(args.group_id);
      const { group_id: _, search_in: searchIn, ...queryParams } = args;
      const query = buildQueryString({
        ...queryParams,
        in: searchIn?.join(","),
      });

      const iterations = await defaultClient.get(`/groups/${groupId}/iterations${query}`);
      return { content: [{ type: "text", text: JSON.stringify(iterations, null, 2) }] };
    },
  );
  toolRef10.disable();
  tools.set("list_group_iterations", toolRef10);

  logger.debug("Project tools registered", { count: tools.size });
  return tools;
}

import { z } from "zod";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { buildQueryString, defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const GetProjectSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  license: z.boolean().optional().describe("Include license info"),
  statistics: z.boolean().optional().describe("Include project statistics"),
  with_custom_attributes: z.boolean().optional().describe("Include custom attributes"),
});

const ListProjectsSchema = z.object({
  search: z.string().optional().describe("Search query"),
  visibility: z.enum(["public", "internal", "private"]).optional().describe("Visibility filter"),
  owned: z.boolean().optional().describe("Only owned projects"),
  membership: z.boolean().optional().describe("Only member projects"),
  starred: z.boolean().optional().describe("Only starred projects"),
  archived: z.boolean().optional().describe("Include archived projects"),
  order_by: z
    .enum(["id", "name", "path", "created_at", "updated_at", "last_activity_at"])
    .optional(),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const ListProjectMembersSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  query: z.string().optional().describe("Search query"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const ListLabelsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  search: z.string().optional().describe("Search query"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetLabelSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
});

const CreateLabelSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  name: z.string().describe("Label name"),
  color: z.string().describe("Label color (hex format)"),
  description: z.string().optional().describe("Label description"),
  priority: z.number().optional().describe("Label priority"),
});

const UpdateLabelSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
  new_name: z.string().optional().describe("New label name"),
  color: z.string().optional().describe("New label color"),
  description: z.string().optional().describe("New description"),
  priority: z.number().optional().describe("New priority"),
});

const DeleteLabelSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
});

const ListGroupProjectsSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  search: z.string().optional().describe("Search query"),
  visibility: z.enum(["public", "internal", "private"]).optional().describe("Visibility filter"),
  archived: z.boolean().optional().describe("Include archived projects"),
  order_by: z
    .enum(["id", "name", "path", "created_at", "updated_at", "last_activity_at"])
    .optional(),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

export function registerProjectTools(target: ToolRegistrationTarget, logger: Logger): void {
  logger.debug("Registering project tools");

  target.registerTool(
    "get_project",
    {
      title: "Get Project",
      description: "Get details of a specific project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        license: z.boolean().optional().describe("Include license info"),
        statistics: z.boolean().optional().describe("Include project statistics"),
        with_custom_attributes: z.boolean().optional().describe("Include custom attributes"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetProjectSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({
        license: args.license,
        statistics: args.statistics,
        with_custom_attributes: args.with_custom_attributes,
      });

      const project = await defaultClient.get(`/projects/${projectId}${query}`);
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  target.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description: "List projects accessible by the current user",
      inputSchema: {
        search: z.string().optional().describe("Search query"),
        visibility: z.enum(["public", "internal", "private"]).optional().describe("Visibility"),
        owned: z.boolean().optional().describe("Only owned projects"),
        membership: z.boolean().optional().describe("Only member projects"),
        starred: z.boolean().optional().describe("Only starred projects"),
        archived: z.boolean().optional().describe("Include archived projects"),
        order_by: z
          .enum(["id", "name", "path", "created_at", "updated_at", "last_activity_at"])
          .optional(),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListProjectsSchema.parse(params);
      const query = buildQueryString(args);

      const projects = await defaultClient.get(`/projects${query}`);
      return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
    },
  );

  target.registerTool(
    "list_project_members",
    {
      title: "List Project Members",
      description: "List members of a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        query: z.string().optional().describe("Search query"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListProjectMembersSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({
        query: args.query,
        page: args.page,
        per_page: args.per_page,
      });

      const members = await defaultClient.get(`/projects/${projectId}/members${query}`);
      return { content: [{ type: "text", text: JSON.stringify(members, null, 2) }] };
    },
  );

  target.registerTool(
    "list_labels",
    {
      title: "List Labels",
      description: "List labels for a project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        search: z.string().optional().describe("Search query"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListLabelsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({
        search: args.search,
        page: args.page,
        per_page: args.per_page,
      });

      const labels = await defaultClient.get(`/projects/${projectId}/labels${query}`);
      return { content: [{ type: "text", text: JSON.stringify(labels, null, 2) }] };
    },
  );

  target.registerTool(
    "get_label",
    {
      title: "Get Label",
      description: "Get a single label from a project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetLabelSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const labelId = encodeURIComponent(String(args.label_id));

      const label = await defaultClient.get(`/projects/${projectId}/labels/${labelId}`);
      return { content: [{ type: "text", text: JSON.stringify(label, null, 2) }] };
    },
  );

  target.registerTool(
    "create_label",
    {
      title: "Create Label",
      description: "Create a new label in a project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        name: z.string().describe("Label name"),
        color: z.string().describe("Label color (hex format)"),
        description: z.string().optional().describe("Label description"),
        priority: z.number().optional().describe("Label priority"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateLabelSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...body } = args;

      const label = await defaultClient.post(`/projects/${projectId}/labels`, body);
      return { content: [{ type: "text", text: JSON.stringify(label, null, 2) }] };
    },
  );

  target.registerTool(
    "update_label",
    {
      title: "Update Label",
      description: "Update an existing label in a project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
        new_name: z.string().optional().describe("New label name"),
        color: z.string().optional().describe("New label color"),
        description: z.string().optional().describe("New description"),
        priority: z.number().optional().describe("New priority"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = UpdateLabelSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const labelId = encodeURIComponent(String(args.label_id));
      const { project_id: _, label_id: __, ...body } = args;

      const label = await defaultClient.put(`/projects/${projectId}/labels/${labelId}`, body);
      return { content: [{ type: "text", text: JSON.stringify(label, null, 2) }] };
    },
  );

  target.registerTool(
    "delete_label",
    {
      title: "Delete Label",
      description: "Delete a label from a project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        label_id: z.union([z.string(), z.number()]).describe("Label ID or name"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = DeleteLabelSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const labelId = encodeURIComponent(String(args.label_id));

      await defaultClient.delete(`/projects/${projectId}/labels/${labelId}`);
      return { content: [{ type: "text", text: "Label deleted successfully" }] };
    },
  );

  target.registerTool(
    "list_group_projects",
    {
      title: "List Group Projects",
      description: "List projects in a GitLab group with filtering options",
      inputSchema: {
        group_id: z.string().describe("Group ID or URL-encoded path"),
        search: z.string().optional().describe("Search query"),
        visibility: z.enum(["public", "internal", "private"]).optional().describe("Visibility"),
        archived: z.boolean().optional().describe("Include archived projects"),
        order_by: z
          .enum(["id", "name", "path", "created_at", "updated_at", "last_activity_at"])
          .optional(),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListGroupProjectsSchema.parse(params);
      const groupId = encodeURIComponent(args.group_id);
      const { group_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const projects = await defaultClient.get(`/groups/${groupId}/projects${query}`);
      return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
    },
  );

  logger.debug("Project tools registered", { count: 9 });
}

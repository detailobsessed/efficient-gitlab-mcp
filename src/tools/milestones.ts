import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQueryString, defaultClient, resolveProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const ListMilestonesSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  iids: z.array(z.number()).optional().describe("Return only the milestones having the given iid"),
  state: z
    .enum(["active", "closed"])
    .optional()
    .describe("Return only active or closed milestones"),
  title: z
    .string()
    .optional()
    .describe("Return only milestones with a title matching the provided string"),
  search: z
    .string()
    .optional()
    .describe("Return only milestones with a title or description matching the provided string"),
  include_ancestors: z.coerce.boolean().optional().describe("Include ancestor groups"),
  updated_before: z
    .string()
    .optional()
    .describe("Return milestones updated before the specified date (ISO 8601 format)"),
  updated_after: z
    .string()
    .optional()
    .describe("Return milestones updated after the specified date (ISO 8601 format)"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetMilestoneSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  milestone_id: z.string().describe("The ID of a project milestone"),
});

const CreateMilestoneSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  title: z.string().describe("The title of the milestone"),
  description: z.string().optional().describe("The description of the milestone"),
  due_date: z.string().optional().describe("The due date of the milestone (YYYY-MM-DD)"),
  start_date: z.string().optional().describe("The start date of the milestone (YYYY-MM-DD)"),
});

const EditMilestoneSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  milestone_id: z.string().describe("The ID of a project milestone"),
  title: z.string().optional().describe("The title of the milestone"),
  description: z.string().optional().describe("The description of the milestone"),
  due_date: z.string().optional().describe("The due date of the milestone (YYYY-MM-DD)"),
  start_date: z.string().optional().describe("The start date of the milestone (YYYY-MM-DD)"),
  state_event: z
    .enum(["close", "activate"])
    .optional()
    .describe("The state event of the milestone"),
});

const DeleteMilestoneSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  milestone_id: z.string().describe("The ID of a project milestone"),
});

const GetMilestoneIssuesSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  milestone_id: z.string().describe("The ID of a project milestone"),
});

const GetMilestoneMergeRequestsSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  milestone_id: z.string().describe("The ID of a project milestone"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const PromoteMilestoneSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  milestone_id: z.string().describe("The ID of a project milestone"),
});

const GetMilestoneBurndownEventsSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  milestone_id: z.string().describe("The ID of a project milestone"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

export function registerMilestoneTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering milestone tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef1 = server.registerTool(
    "list_milestones",
    {
      title: "List Milestones",
      description: "List project milestones with filtering options",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        iids: z
          .array(z.number())
          .optional()
          .describe("Return only the milestones having the given iid"),
        state: z
          .enum(["active", "closed"])
          .optional()
          .describe("Return only active or closed milestones"),
        title: z
          .string()
          .optional()
          .describe("Return only milestones with a title matching the provided string"),
        search: z
          .string()
          .optional()
          .describe(
            "Return only milestones with a title or description matching the provided string",
          ),
        include_ancestors: z.coerce.boolean().optional().describe("Include ancestor groups"),
        updated_before: z
          .string()
          .optional()
          .describe("Return milestones updated before the specified date (ISO 8601 format)"),
        updated_after: z
          .string()
          .optional()
          .describe("Return milestones updated after the specified date (ISO 8601 format)"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListMilestonesSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const milestones = await defaultClient.get(`/projects/${projectId}/milestones${query}`);
      return { content: [{ type: "text", text: JSON.stringify(milestones, null, 2) }] };
    },
  );
  toolRef1.disable();
  tools.set("list_milestones", toolRef1);

  const toolRef2 = server.registerTool(
    "get_milestone",
    {
      title: "Get Milestone",
      description: "Get a single project milestone",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        milestone_id: z.string().describe("The ID of a project milestone"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMilestoneSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);

      const milestone = await defaultClient.get(
        `/projects/${projectId}/milestones/${args.milestone_id}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(milestone, null, 2) }] };
    },
  );
  toolRef2.disable();
  tools.set("get_milestone", toolRef2);

  const toolRef3 = server.registerTool(
    "create_milestone",
    {
      title: "Create Milestone",
      description: "Create a new project milestone",
      annotations: { destructiveHint: false },
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        title: z.string().describe("The title of the milestone"),
        description: z.string().optional().describe("The description of the milestone"),
        due_date: z.string().optional().describe("The due date of the milestone (YYYY-MM-DD)"),
        start_date: z.string().optional().describe("The start date of the milestone (YYYY-MM-DD)"),
      },
    },
    async (params) => {
      const args = CreateMilestoneSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...body } = args;

      const milestone = await defaultClient.post(`/projects/${projectId}/milestones`, body);
      return { content: [{ type: "text", text: JSON.stringify(milestone, null, 2) }] };
    },
  );
  toolRef3.disable();
  tools.set("create_milestone", toolRef3);

  const toolRef4 = server.registerTool(
    "edit_milestone",
    {
      title: "Edit Milestone",
      description: "Edit an existing project milestone",
      annotations: { destructiveHint: true },
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        milestone_id: z.string().describe("The ID of a project milestone"),
        title: z.string().optional().describe("The title of the milestone"),
        description: z.string().optional().describe("The description of the milestone"),
        due_date: z.string().optional().describe("The due date of the milestone (YYYY-MM-DD)"),
        start_date: z.string().optional().describe("The start date of the milestone (YYYY-MM-DD)"),
        state_event: z
          .enum(["close", "activate"])
          .optional()
          .describe("The state event of the milestone"),
      },
    },
    async (params) => {
      const args = EditMilestoneSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, milestone_id, ...body } = args;

      const milestone = await defaultClient.put(
        `/projects/${projectId}/milestones/${milestone_id}`,
        body,
      );
      return { content: [{ type: "text", text: JSON.stringify(milestone, null, 2) }] };
    },
  );
  toolRef4.disable();
  tools.set("edit_milestone", toolRef4);

  const toolRef5 = server.registerTool(
    "delete_milestone",
    {
      title: "Delete Milestone",
      description: "Delete a project milestone",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        milestone_id: z.string().describe("The ID of a project milestone"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = DeleteMilestoneSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);

      await defaultClient.delete(`/projects/${projectId}/milestones/${args.milestone_id}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { status: "success", message: "Milestone deleted successfully" },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
  toolRef5.disable();
  tools.set("delete_milestone", toolRef5);

  const toolRef6 = server.registerTool(
    "get_milestone_issue",
    {
      title: "Get Milestone Issues",
      description: "Get issues assigned to a project milestone",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        milestone_id: z.string().describe("The ID of a project milestone"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMilestoneIssuesSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);

      const issues = await defaultClient.get(
        `/projects/${projectId}/milestones/${args.milestone_id}/issues`,
      );
      return { content: [{ type: "text", text: JSON.stringify(issues, null, 2) }] };
    },
  );
  toolRef6.disable();
  tools.set("get_milestone_issue", toolRef6);

  const toolRef7 = server.registerTool(
    "get_milestone_merge_requests",
    {
      title: "Get Milestone Merge Requests",
      description: "Get merge requests assigned to a project milestone",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        milestone_id: z.string().describe("The ID of a project milestone"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMilestoneMergeRequestsSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const mergeRequests = await defaultClient.get(
        `/projects/${projectId}/milestones/${args.milestone_id}/merge_requests${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(mergeRequests, null, 2) }] };
    },
  );
  toolRef7.disable();
  tools.set("get_milestone_merge_requests", toolRef7);

  const toolRef8 = server.registerTool(
    "promote_milestone",
    {
      title: "Promote Milestone",
      description: "Promote a project milestone to a group milestone",
      annotations: { destructiveHint: true },
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        milestone_id: z.string().describe("The ID of a project milestone"),
      },
    },
    async (params) => {
      const args = PromoteMilestoneSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);

      const milestone = await defaultClient.post(
        `/projects/${projectId}/milestones/${args.milestone_id}/promote`,
      );
      return { content: [{ type: "text", text: JSON.stringify(milestone, null, 2) }] };
    },
  );
  toolRef8.disable();
  tools.set("promote_milestone", toolRef8);

  const toolRef9 = server.registerTool(
    "get_milestone_burndown_events",
    {
      title: "Get Milestone Burndown Events",
      description: "Get burndown chart events for a project milestone",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        milestone_id: z.string().describe("The ID of a project milestone"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMilestoneBurndownEventsSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const events = await defaultClient.get(
        `/projects/${projectId}/milestones/${args.milestone_id}/burndown_events${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
    },
  );
  toolRef9.disable();
  tools.set("get_milestone_burndown_events", toolRef9);

  logger.debug("Milestone tools registered", { count: tools.size });
  return tools;
}

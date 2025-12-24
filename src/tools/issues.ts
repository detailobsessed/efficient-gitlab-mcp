import { z } from "zod";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { buildQueryString, defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const CreateIssueSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  title: z.string().describe("Issue title"),
  description: z.string().optional().describe("Issue description"),
  assignee_ids: z.array(z.number()).optional().describe("Assignee user IDs"),
  labels: z.string().optional().describe("Comma-separated labels"),
  milestone_id: z.number().optional().describe("Milestone ID"),
  due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
  confidential: z.boolean().optional().describe("Mark as confidential"),
});

const ListIssuesSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  state: z.enum(["opened", "closed", "all"]).optional().describe("Issue state filter"),
  scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional().describe("Scope filter"),
  labels: z.string().optional().describe("Comma-separated labels filter"),
  milestone: z.string().optional().describe("Milestone title"),
  search: z.string().optional().describe("Search in title and description"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const MyIssuesSchema = z.object({
  state: z.enum(["opened", "closed", "all"]).optional().describe("Issue state filter"),
  scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional().describe("Scope filter"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetIssueSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  issue_iid: z.number().describe("Issue IID"),
});

const UpdateIssueSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  issue_iid: z.number().describe("Issue IID"),
  title: z.string().optional().describe("New title"),
  description: z.string().optional().describe("New description"),
  assignee_ids: z.array(z.number()).optional().describe("Assignee user IDs"),
  labels: z.string().optional().describe("Comma-separated labels"),
  milestone_id: z.number().optional().describe("Milestone ID"),
  state_event: z.enum(["close", "reopen"]).optional().describe("State change"),
  due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
  confidential: z.boolean().optional().describe("Mark as confidential"),
});

const DeleteIssueSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  issue_iid: z.number().describe("Issue IID"),
});

const ListIssueLinksSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  issue_iid: z.number().describe("Issue IID"),
});

const CreateIssueLinkSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  issue_iid: z.number().describe("Source issue IID"),
  target_project_id: z.string().describe("Target project ID"),
  target_issue_iid: z.number().describe("Target issue IID"),
  link_type: z.enum(["relates_to", "blocks", "is_blocked_by"]).optional().describe("Link type"),
});

const DeleteIssueLinkSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  issue_iid: z.number().describe("Issue IID"),
  issue_link_id: z.number().describe("Issue link ID"),
});

const ListIssueDiscussionsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  issue_iid: z.number().describe("Issue IID"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const CreateIssueNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  issue_iid: z.number().describe("Issue IID"),
  body: z.string().describe("Note body"),
});

const UpdateIssueNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  issue_iid: z.number().describe("Issue IID"),
  note_id: z.number().describe("Note ID"),
  body: z.string().describe("New note body"),
});

export function registerIssueTools(target: ToolRegistrationTarget, logger: Logger): void {
  logger.debug("Registering issue tools");

  target.registerTool(
    "create_issue",
    {
      title: "Create Issue",
      description: "Create a new issue in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        title: z.string().describe("Issue title"),
        description: z.string().optional().describe("Issue description"),
        assignee_ids: z.array(z.number()).optional().describe("Assignee user IDs"),
        labels: z.string().optional().describe("Comma-separated labels"),
        milestone_id: z.number().optional().describe("Milestone ID"),
        due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
        confidential: z.boolean().optional().describe("Mark as confidential"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateIssueSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...body } = args;

      const issue = await defaultClient.post(`/projects/${projectId}/issues`, body);
      return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
    },
  );

  target.registerTool(
    "list_issues",
    {
      title: "List Issues",
      description: "List issues in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        state: z.enum(["opened", "closed", "all"]).optional().describe("Issue state filter"),
        scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional().describe("Scope"),
        labels: z.string().optional().describe("Comma-separated labels filter"),
        milestone: z.string().optional().describe("Milestone title"),
        search: z.string().optional().describe("Search in title and description"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListIssuesSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const issues = await defaultClient.get(`/projects/${projectId}/issues${query}`);
      return { content: [{ type: "text", text: JSON.stringify(issues, null, 2) }] };
    },
  );

  target.registerTool(
    "my_issues",
    {
      title: "My Issues",
      description: "List issues assigned to the authenticated user",
      inputSchema: {
        state: z.enum(["opened", "closed", "all"]).optional().describe("Issue state filter"),
        scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional().describe("Scope"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = MyIssuesSchema.parse(params);
      const query = buildQueryString(args);

      const issues = await defaultClient.get(`/issues${query}`);
      return { content: [{ type: "text", text: JSON.stringify(issues, null, 2) }] };
    },
  );

  target.registerTool(
    "get_issue",
    {
      title: "Get Issue",
      description: "Get details of a specific issue in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        issue_iid: z.number().describe("Issue IID"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetIssueSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const issue = await defaultClient.get(`/projects/${projectId}/issues/${args.issue_iid}`);
      return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
    },
  );

  target.registerTool(
    "update_issue",
    {
      title: "Update Issue",
      description: "Update an issue in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        issue_iid: z.number().describe("Issue IID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        assignee_ids: z.array(z.number()).optional().describe("Assignee user IDs"),
        labels: z.string().optional().describe("Comma-separated labels"),
        state_event: z.enum(["close", "reopen"]).optional().describe("State change"),
        due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = UpdateIssueSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, issue_iid, ...body } = args;

      const issue = await defaultClient.put(`/projects/${projectId}/issues/${issue_iid}`, body);
      return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
    },
  );

  target.registerTool(
    "delete_issue",
    {
      title: "Delete Issue",
      description: "Delete an issue from a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        issue_iid: z.number().describe("Issue IID"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = DeleteIssueSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      await defaultClient.delete(`/projects/${projectId}/issues/${args.issue_iid}`);
      return { content: [{ type: "text", text: "Issue deleted successfully" }] };
    },
  );

  target.registerTool(
    "list_issue_links",
    {
      title: "List Issue Links",
      description: "List all issue links for a specific issue",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        issue_iid: z.number().describe("Issue IID"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListIssueLinksSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const links = await defaultClient.get(
        `/projects/${projectId}/issues/${args.issue_iid}/links`,
      );
      return { content: [{ type: "text", text: JSON.stringify(links, null, 2) }] };
    },
  );

  target.registerTool(
    "create_issue_link",
    {
      title: "Create Issue Link",
      description: "Create an issue link between two issues",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        issue_iid: z.number().describe("Source issue IID"),
        target_project_id: z.string().describe("Target project ID"),
        target_issue_iid: z.number().describe("Target issue IID"),
        link_type: z
          .enum(["relates_to", "blocks", "is_blocked_by"])
          .optional()
          .describe("Link type"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateIssueLinkSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const link = await defaultClient.post(
        `/projects/${projectId}/issues/${args.issue_iid}/links`,
        {
          target_project_id: args.target_project_id,
          target_issue_iid: args.target_issue_iid,
          link_type: args.link_type,
        },
      );
      return { content: [{ type: "text", text: JSON.stringify(link, null, 2) }] };
    },
  );

  target.registerTool(
    "delete_issue_link",
    {
      title: "Delete Issue Link",
      description: "Delete an issue link",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        issue_iid: z.number().describe("Issue IID"),
        issue_link_id: z.number().describe("Issue link ID"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = DeleteIssueLinkSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      await defaultClient.delete(
        `/projects/${projectId}/issues/${args.issue_iid}/links/${args.issue_link_id}`,
      );
      return { content: [{ type: "text", text: "Issue link deleted successfully" }] };
    },
  );

  target.registerTool(
    "list_issue_discussions",
    {
      title: "List Issue Discussions",
      description: "List discussions for an issue in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        issue_iid: z.number().describe("Issue IID"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListIssueDiscussionsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const discussions = await defaultClient.get(
        `/projects/${projectId}/issues/${args.issue_iid}/discussions${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(discussions, null, 2) }] };
    },
  );

  target.registerTool(
    "create_issue_note",
    {
      title: "Create Issue Note",
      description: "Add a new note to an existing issue",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        issue_iid: z.number().describe("Issue IID"),
        body: z.string().describe("Note body"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateIssueNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const note = await defaultClient.post(
        `/projects/${projectId}/issues/${args.issue_iid}/notes`,
        { body: args.body },
      );
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    },
  );

  target.registerTool(
    "update_issue_note",
    {
      title: "Update Issue Note",
      description: "Modify an existing issue note",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        issue_iid: z.number().describe("Issue IID"),
        note_id: z.number().describe("Note ID"),
        body: z.string().describe("New note body"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = UpdateIssueNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const note = await defaultClient.put(
        `/projects/${projectId}/issues/${args.issue_iid}/notes/${args.note_id}`,
        { body: args.body },
      );
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    },
  );

  logger.debug("Issue tools registered", { count: 12 });
}

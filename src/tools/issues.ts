import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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

const GetIssueLinkSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  issue_iid: z.number().describe("Issue IID"),
  issue_link_id: z.number().describe("ID of the issue relationship"),
});

const CreateNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  notable_type: z
    .enum(["issue", "merge_request"])
    .describe("Type of notable (issue or merge_request)"),
  notable_iid: z.string().describe("IID of the issue or merge request"),
  body: z.string().describe("Note content"),
});

export function registerIssueTools(server: McpServer, logger: Logger): Map<string, RegisteredTool> {
  logger.debug("Registering issue tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef = server.registerTool(
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
  toolRef.disable();
  tools.set("create_issue", toolRef);

  const toolRef2 = server.registerTool(
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
  toolRef2.disable();
  tools.set("list_issues", toolRef2);

  const toolRef3 = server.registerTool(
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
  toolRef3.disable();
  tools.set("my_issues", toolRef3);

  const toolRef4 = server.registerTool(
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
  toolRef4.disable();
  tools.set("get_issue", toolRef4);

  const toolRef5 = server.registerTool(
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
  toolRef5.disable();
  tools.set("update_issue", toolRef5);

  const toolRef6 = server.registerTool(
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
  toolRef6.disable();
  tools.set("delete_issue", toolRef6);

  const toolRef7 = server.registerTool(
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
  toolRef7.disable();
  tools.set("list_issue_links", toolRef7);

  const toolRef8 = server.registerTool(
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
  toolRef8.disable();
  tools.set("create_issue_link", toolRef8);

  const toolRef9 = server.registerTool(
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
  toolRef9.disable();
  tools.set("delete_issue_link", toolRef9);

  const toolRef10 = server.registerTool(
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
  toolRef10.disable();
  tools.set("list_issue_discussions", toolRef10);

  const toolRef11 = server.registerTool(
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
  toolRef11.disable();
  tools.set("create_issue_note", toolRef11);

  const toolRef12 = server.registerTool(
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
  toolRef12.disable();
  tools.set("update_issue_note", toolRef12);

  const toolRef13 = server.registerTool(
    "get_issue_link",
    {
      title: "Get Issue Link",
      description: "Get a single issue link/relationship by ID",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        issue_iid: z.number().describe("Issue IID"),
        issue_link_id: z.number().describe("ID of the issue relationship"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetIssueLinkSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const link = await defaultClient.get(
        `/projects/${projectId}/issues/${args.issue_iid}/links/${args.issue_link_id}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(link, null, 2) }] };
    },
  );
  toolRef13.disable();
  tools.set("get_issue_link", toolRef13);

  const toolRef14 = server.registerTool(
    "create_note",
    {
      title: "Create Note",
      description:
        "Create a note/comment on an issue or merge request. Use notable_type to specify which.",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        notable_type: z
          .enum(["issue", "merge_request"])
          .describe("Type of notable (issue or merge_request)"),
        notable_iid: z.string().describe("IID of the issue or merge request"),
        body: z.string().describe("Note content"),
      },
    },
    async (params) => {
      const args = CreateNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const notablePlural = args.notable_type === "issue" ? "issues" : "merge_requests";
      const note = await defaultClient.post(
        `/projects/${projectId}/${notablePlural}/${args.notable_iid}/notes`,
        { body: args.body },
      );
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    },
  );
  toolRef14.disable();
  tools.set("create_note", toolRef14);

  logger.debug("Issue tools registered", { count: tools.size });
  return tools;
}

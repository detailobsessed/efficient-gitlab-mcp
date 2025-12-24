import { z } from "zod";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { buildQueryString, defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const GetMergeRequestSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().optional().describe("Merge request IID"),
  branch_name: z.string().optional().describe("Branch name to find MR"),
});

const ListMergeRequestsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  state: z.enum(["opened", "closed", "merged", "all"]).optional().describe("MR state filter"),
  scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional().describe("Scope filter"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const CreateMergeRequestSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  source_branch: z.string().describe("Source branch"),
  target_branch: z.string().describe("Target branch"),
  title: z.string().describe("MR title"),
  description: z.string().optional().describe("MR description"),
  assignee_id: z.number().optional().describe("Assignee user ID"),
  reviewer_ids: z.array(z.number()).optional().describe("Reviewer user IDs"),
  labels: z.string().optional().describe("Comma-separated labels"),
  milestone_id: z.number().optional().describe("Milestone ID"),
  remove_source_branch: z.boolean().optional().describe("Remove source branch after merge"),
  squash: z.boolean().optional().describe("Squash commits on merge"),
  draft: z.boolean().optional().describe("Create as draft MR"),
});

const UpdateMergeRequestSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  title: z.string().optional().describe("New title"),
  description: z.string().optional().describe("New description"),
  state_event: z.enum(["close", "reopen"]).optional().describe("State change"),
  assignee_id: z.number().optional().describe("Assignee user ID"),
  reviewer_ids: z.array(z.number()).optional().describe("Reviewer user IDs"),
  labels: z.string().optional().describe("Comma-separated labels"),
  milestone_id: z.number().optional().describe("Milestone ID"),
  target_branch: z.string().optional().describe("Target branch"),
  remove_source_branch: z.boolean().optional().describe("Remove source branch after merge"),
  squash: z.boolean().optional().describe("Squash commits on merge"),
});

const MergeMergeRequestSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  merge_commit_message: z.string().optional().describe("Custom merge commit message"),
  squash_commit_message: z.string().optional().describe("Custom squash commit message"),
  squash: z.boolean().optional().describe("Squash commits"),
  should_remove_source_branch: z.boolean().optional().describe("Remove source branch"),
  merge_when_pipeline_succeeds: z.boolean().optional().describe("Merge when pipeline succeeds"),
  sha: z.string().optional().describe("Expected HEAD SHA"),
});

const GetMergeRequestDiffsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const ListMergeRequestDiscussionsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const CreateMergeRequestThreadSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  body: z.string().describe("Thread body"),
  position: z
    .object({
      base_sha: z.string(),
      start_sha: z.string(),
      head_sha: z.string(),
      position_type: z.enum(["text", "image"]),
      new_path: z.string().optional(),
      old_path: z.string().optional(),
      new_line: z.number().optional(),
      old_line: z.number().optional(),
    })
    .optional()
    .describe("Position for diff comment"),
});

const ResolveMergeRequestThreadSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  discussion_id: z.string().describe("Discussion ID"),
  resolved: z.boolean().describe("Resolve or unresolve"),
});

const CreateMergeRequestNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  body: z.string().describe("Note body"),
});

const UpdateMergeRequestNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  note_id: z.number().describe("Note ID"),
  body: z.string().describe("New note body"),
});

const DeleteMergeRequestNoteSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  note_id: z.number().describe("Note ID"),
});

const GetMergeRequestNotesSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  merge_request_iid: z.number().describe("Merge request IID"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

export function registerMergeRequestTools(target: ToolRegistrationTarget, logger: Logger): void {
  logger.debug("Registering merge request tools");

  target.registerTool(
    "get_merge_request",
    {
      title: "Get Merge Request",
      description: "Get details of a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().optional().describe("Merge request IID"),
        branch_name: z.string().optional().describe("Branch name to find MR"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      if (args.merge_request_iid) {
        const mr = await defaultClient.get(
          `/projects/${projectId}/merge_requests/${args.merge_request_iid}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(mr, null, 2) }] };
      }

      if (args.branch_name) {
        const query = buildQueryString({ source_branch: args.branch_name, state: "opened" });
        const mrs = await defaultClient.get<unknown[]>(
          `/projects/${projectId}/merge_requests${query}`,
        );
        if (mrs.length === 0) {
          return { content: [{ type: "text", text: "No merge request found for this branch" }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(mrs[0], null, 2) }] };
      }

      throw new Error("Either merge_request_iid or branch_name must be provided");
    },
  );

  target.registerTool(
    "list_merge_requests",
    {
      title: "List Merge Requests",
      description: "List merge requests in a GitLab project with filtering options",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        state: z.enum(["opened", "closed", "merged", "all"]).optional().describe("MR state filter"),
        scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional().describe("Scope"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListMergeRequestsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const mrs = await defaultClient.get(`/projects/${projectId}/merge_requests${query}`);
      return { content: [{ type: "text", text: JSON.stringify(mrs, null, 2) }] };
    },
  );

  target.registerTool(
    "create_merge_request",
    {
      title: "Create Merge Request",
      description: "Create a new merge request in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        source_branch: z.string().describe("Source branch"),
        target_branch: z.string().describe("Target branch"),
        title: z.string().describe("MR title"),
        description: z.string().optional().describe("MR description"),
        assignee_id: z.number().optional().describe("Assignee user ID"),
        reviewer_ids: z.array(z.number()).optional().describe("Reviewer user IDs"),
        labels: z.string().optional().describe("Comma-separated labels"),
        remove_source_branch: z.boolean().optional().describe("Remove source branch after merge"),
        squash: z.boolean().optional().describe("Squash commits on merge"),
        draft: z.boolean().optional().describe("Create as draft MR"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateMergeRequestSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...body } = args;

      const mr = await defaultClient.post(`/projects/${projectId}/merge_requests`, body);
      return { content: [{ type: "text", text: JSON.stringify(mr, null, 2) }] };
    },
  );

  target.registerTool(
    "update_merge_request",
    {
      title: "Update Merge Request",
      description: "Update a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        state_event: z.enum(["close", "reopen"]).optional().describe("State change"),
        assignee_id: z.number().optional().describe("Assignee user ID"),
        labels: z.string().optional().describe("Comma-separated labels"),
        target_branch: z.string().optional().describe("Target branch"),
        remove_source_branch: z.boolean().optional().describe("Remove source branch after merge"),
        squash: z.boolean().optional().describe("Squash commits on merge"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = UpdateMergeRequestSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, merge_request_iid, ...body } = args;

      const mr = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${merge_request_iid}`,
        body,
      );
      return { content: [{ type: "text", text: JSON.stringify(mr, null, 2) }] };
    },
  );

  target.registerTool(
    "merge_merge_request",
    {
      title: "Merge Merge Request",
      description: "Merge a merge request in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        merge_commit_message: z.string().optional().describe("Custom merge commit message"),
        squash_commit_message: z.string().optional().describe("Custom squash commit message"),
        squash: z.boolean().optional().describe("Squash commits"),
        should_remove_source_branch: z.boolean().optional().describe("Remove source branch"),
        merge_when_pipeline_succeeds: z
          .boolean()
          .optional()
          .describe("Merge when pipeline succeeds"),
        sha: z.string().optional().describe("Expected HEAD SHA"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = MergeMergeRequestSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, merge_request_iid, ...body } = args;

      const mr = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${merge_request_iid}/merge`,
        body,
      );
      return { content: [{ type: "text", text: JSON.stringify(mr, null, 2) }] };
    },
  );

  target.registerTool(
    "get_merge_request_diffs",
    {
      title: "Get Merge Request Diffs",
      description: "Get the changes/diffs of a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestDiffsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const diffs = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/changes${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(diffs, null, 2) }] };
    },
  );

  target.registerTool(
    "mr_discussions",
    {
      title: "List MR Discussions",
      description: "List discussion items for a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListMergeRequestDiscussionsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const discussions = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/discussions${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(discussions, null, 2) }] };
    },
  );

  target.registerTool(
    "create_merge_request_thread",
    {
      title: "Create MR Thread",
      description: "Create a new thread on a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        body: z.string().describe("Thread body"),
        position: z
          .object({
            base_sha: z.string(),
            start_sha: z.string(),
            head_sha: z.string(),
            position_type: z.enum(["text", "image"]),
            new_path: z.string().optional(),
            old_path: z.string().optional(),
            new_line: z.number().optional(),
            old_line: z.number().optional(),
          })
          .optional()
          .describe("Position for diff comment"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateMergeRequestThreadSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const thread = await defaultClient.post(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/discussions`,
        { body: args.body, position: args.position },
      );
      return { content: [{ type: "text", text: JSON.stringify(thread, null, 2) }] };
    },
  );

  target.registerTool(
    "resolve_merge_request_thread",
    {
      title: "Resolve MR Thread",
      description: "Resolve a thread on a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        discussion_id: z.string().describe("Discussion ID"),
        resolved: z.boolean().describe("Resolve or unresolve"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = ResolveMergeRequestThreadSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const thread = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/discussions/${args.discussion_id}`,
        { resolved: args.resolved },
      );
      return { content: [{ type: "text", text: JSON.stringify(thread, null, 2) }] };
    },
  );

  target.registerTool(
    "create_merge_request_note",
    {
      title: "Create MR Note",
      description: "Add a new note to a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        body: z.string().describe("Note body"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreateMergeRequestNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const note = await defaultClient.post(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/notes`,
        { body: args.body },
      );
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    },
  );

  target.registerTool(
    "update_merge_request_note",
    {
      title: "Update MR Note",
      description: "Modify an existing merge request note",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        note_id: z.number().describe("Note ID"),
        body: z.string().describe("New note body"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = UpdateMergeRequestNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const note = await defaultClient.put(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/notes/${args.note_id}`,
        { body: args.body },
      );
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    },
  );

  target.registerTool(
    "delete_merge_request_note",
    {
      title: "Delete MR Note",
      description: "Delete an existing merge request note",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        note_id: z.number().describe("Note ID"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = DeleteMergeRequestNoteSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      await defaultClient.delete(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/notes/${args.note_id}`,
      );
      return { content: [{ type: "text", text: "Note deleted successfully" }] };
    },
  );

  target.registerTool(
    "get_merge_request_notes",
    {
      title: "Get MR Notes",
      description: "List notes for a merge request",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        merge_request_iid: z.number().describe("Merge request IID"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetMergeRequestNotesSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const notes = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/notes${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(notes, null, 2) }] };
    },
  );

  logger.debug("Merge request tools registered", { count: 13 });
}

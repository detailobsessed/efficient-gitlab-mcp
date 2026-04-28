/**
 * Emoji reaction tools — added on top of GitLab's `/award_emoji` REST family
 * (for MRs and issues) and the `awardEmoji*` GraphQL mutations (for work items).
 *
 * REST MR tools land in DOT-521.2 (this file). REST issue tools follow in
 * DOT-521.3 (same shapes, different resource). GraphQL work-item tools follow
 * in DOT-521.4.
 */

import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defaultClient, resolveProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";
import { resolveWorkItemGID } from "./work-items.js";

// Shared schema fragments — coerce strings/numbers to strings since GitLab's
// REST endpoints accept either. award_id is unconditionally a string in
// /award_emoji responses but agents tend to pass numeric literals.
const emojiNameField = z
  .string()
  .describe("Name of the emoji without colons (e.g. 'thumbsup', 'rocket', 'eyes')");
const awardIdField = z.coerce.string().describe("The ID of the emoji reaction to delete");
const noteDiscussionField = z.coerce
  .string()
  .optional()
  .describe(
    "The ID of a discussion thread. Required for notes that are discussion replies; omit for top-level notes.",
  );

// --- MR reaction schemas ---

const ListMergeRequestEmojiReactionsSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  merge_request_iid: z.coerce.number().describe("Merge request IID"),
});

const CreateMergeRequestEmojiReactionSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  merge_request_iid: z.coerce.number().describe("Merge request IID"),
  name: emojiNameField,
});

const DeleteMergeRequestEmojiReactionSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  merge_request_iid: z.coerce.number().describe("Merge request IID"),
  award_id: awardIdField,
});

const ListMergeRequestNoteEmojiReactionsSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  merge_request_iid: z.coerce.number().describe("Merge request IID"),
  note_id: z.coerce.number().describe("Note ID"),
  discussion_id: noteDiscussionField,
});

const CreateMergeRequestNoteEmojiReactionSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  merge_request_iid: z.coerce.number().describe("Merge request IID"),
  note_id: z.coerce.number().describe("Note ID"),
  discussion_id: noteDiscussionField,
  name: emojiNameField,
});

const DeleteMergeRequestNoteEmojiReactionSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  merge_request_iid: z.coerce.number().describe("Merge request IID"),
  note_id: z.coerce.number().describe("Note ID"),
  discussion_id: noteDiscussionField,
  award_id: awardIdField,
});

/**
 * Build the URL fragment for a note's reactions, picking between the
 * top-level `/notes/:id/` shape and the discussion-scoped
 * `/discussions/:did/notes/:id/` shape based on whether a discussion_id
 * was supplied.
 */
function buildNoteReactionUrl(
  projectId: string,
  resource: "merge_requests" | "issues",
  resourceIid: number,
  noteId: number,
  discussionId: string | undefined,
  suffix = "",
): string {
  const base = `/projects/${projectId}/${resource}/${resourceIid}`;
  const path = discussionId
    ? `${base}/discussions/${encodeURIComponent(discussionId)}/notes/${noteId}/award_emoji`
    : `${base}/notes/${noteId}/award_emoji`;
  return suffix ? `${path}/${suffix}` : path;
}

const READ_ONLY_HINT = { readOnlyHint: true, openWorldHint: true } as const;
const CREATE_HINT = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;
const DELETE_HINT = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerReactionTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering emoji-reaction tools");
  const tools = new Map<string, RegisteredTool>();

  // ---------- MR-level reactions ----------

  const t1 = server.registerTool(
    "list_merge_request_emoji_reactions",
    {
      title: "List Merge Request Emoji Reactions",
      description: "List all emoji reactions on a merge request",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        merge_request_iid: z.coerce.number().describe("Merge request IID"),
      },
      annotations: READ_ONLY_HINT,
    },
    async (params) => {
      const args = ListMergeRequestEmojiReactionsSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const data = await defaultClient.get(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/award_emoji`,
      );
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
  t1.disable();
  tools.set("list_merge_request_emoji_reactions", t1);

  const t2 = server.registerTool(
    "create_merge_request_emoji_reaction",
    {
      title: "Create Merge Request Emoji Reaction",
      description: "Add an emoji reaction to a merge request (e.g. thumbsup, rocket, eyes)",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        merge_request_iid: z.coerce.number().describe("Merge request IID"),
        name: emojiNameField,
      },
      annotations: CREATE_HINT,
    },
    async (params) => {
      const args = CreateMergeRequestEmojiReactionSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const data = await defaultClient.post(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/award_emoji`,
        { name: args.name },
      );
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
  t2.disable();
  tools.set("create_merge_request_emoji_reaction", t2);

  const t3 = server.registerTool(
    "delete_merge_request_emoji_reaction",
    {
      title: "Delete Merge Request Emoji Reaction",
      description: "Remove an emoji reaction from a merge request",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        merge_request_iid: z.coerce.number().describe("Merge request IID"),
        award_id: awardIdField,
      },
      annotations: DELETE_HINT,
    },
    async (params) => {
      const args = DeleteMergeRequestEmojiReactionSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      await defaultClient.delete(
        `/projects/${projectId}/merge_requests/${args.merge_request_iid}/award_emoji/${encodeURIComponent(args.award_id)}`,
      );
      return { content: [{ type: "text", text: "Reaction removed" }] };
    },
  );
  t3.disable();
  tools.set("delete_merge_request_emoji_reaction", t3);

  // ---------- MR-note-level reactions ----------

  const t4 = server.registerTool(
    "list_merge_request_note_emoji_reactions",
    {
      title: "List Merge Request Note Emoji Reactions",
      description:
        "List all emoji reactions on a merge request note. Pass discussion_id for replies inside a discussion thread.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        merge_request_iid: z.coerce.number().describe("Merge request IID"),
        note_id: z.coerce.number().describe("Note ID"),
        discussion_id: noteDiscussionField,
      },
      annotations: READ_ONLY_HINT,
    },
    async (params) => {
      const args = ListMergeRequestNoteEmojiReactionsSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const url = buildNoteReactionUrl(
        projectId,
        "merge_requests",
        args.merge_request_iid,
        args.note_id,
        args.discussion_id,
      );
      const data = await defaultClient.get(url);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
  t4.disable();
  tools.set("list_merge_request_note_emoji_reactions", t4);

  const t5 = server.registerTool(
    "create_merge_request_note_emoji_reaction",
    {
      title: "Create Merge Request Note Emoji Reaction",
      description:
        "Add an emoji reaction to a merge request note. Pass discussion_id for replies inside a discussion thread.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        merge_request_iid: z.coerce.number().describe("Merge request IID"),
        note_id: z.coerce.number().describe("Note ID"),
        discussion_id: noteDiscussionField,
        name: emojiNameField,
      },
      annotations: CREATE_HINT,
    },
    async (params) => {
      const args = CreateMergeRequestNoteEmojiReactionSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const url = buildNoteReactionUrl(
        projectId,
        "merge_requests",
        args.merge_request_iid,
        args.note_id,
        args.discussion_id,
      );
      const data = await defaultClient.post(url, { name: args.name });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
  t5.disable();
  tools.set("create_merge_request_note_emoji_reaction", t5);

  const t6 = server.registerTool(
    "delete_merge_request_note_emoji_reaction",
    {
      title: "Delete Merge Request Note Emoji Reaction",
      description:
        "Remove an emoji reaction from a merge request note. Pass discussion_id for replies inside a discussion thread.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        merge_request_iid: z.coerce.number().describe("Merge request IID"),
        note_id: z.coerce.number().describe("Note ID"),
        discussion_id: noteDiscussionField,
        award_id: awardIdField,
      },
      annotations: DELETE_HINT,
    },
    async (params) => {
      const args = DeleteMergeRequestNoteEmojiReactionSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const url = buildNoteReactionUrl(
        projectId,
        "merge_requests",
        args.merge_request_iid,
        args.note_id,
        args.discussion_id,
        encodeURIComponent(args.award_id),
      );
      await defaultClient.delete(url);
      return { content: [{ type: "text", text: "Reaction removed" }] };
    },
  );
  t6.disable();
  tools.set("delete_merge_request_note_emoji_reaction", t6);

  // ---------- Issue-level reactions ----------

  const t7 = server.registerTool(
    "list_issue_emoji_reactions",
    {
      title: "List Issue Emoji Reactions",
      description: "List all emoji reactions on an issue",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        issue_iid: z.coerce.number().describe("Issue IID"),
      },
      annotations: READ_ONLY_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.string().optional(),
          issue_iid: z.coerce.number(),
        })
        .parse(params);
      const projectId = resolveProjectId(args.project_id);
      const data = await defaultClient.get(
        `/projects/${projectId}/issues/${args.issue_iid}/award_emoji`,
      );
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
  t7.disable();
  tools.set("list_issue_emoji_reactions", t7);

  const t8 = server.registerTool(
    "create_issue_emoji_reaction",
    {
      title: "Create Issue Emoji Reaction",
      description: "Add an emoji reaction to an issue (e.g. thumbsup, rocket, eyes)",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        issue_iid: z.coerce.number().describe("Issue IID"),
        name: emojiNameField,
      },
      annotations: CREATE_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.string().optional(),
          issue_iid: z.coerce.number(),
          name: z.string(),
        })
        .parse(params);
      const projectId = resolveProjectId(args.project_id);
      const data = await defaultClient.post(
        `/projects/${projectId}/issues/${args.issue_iid}/award_emoji`,
        { name: args.name },
      );
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
  t8.disable();
  tools.set("create_issue_emoji_reaction", t8);

  const t9 = server.registerTool(
    "delete_issue_emoji_reaction",
    {
      title: "Delete Issue Emoji Reaction",
      description: "Remove an emoji reaction from an issue",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        issue_iid: z.coerce.number().describe("Issue IID"),
        award_id: awardIdField,
      },
      annotations: DELETE_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.string().optional(),
          issue_iid: z.coerce.number(),
          award_id: z.coerce.string(),
        })
        .parse(params);
      const projectId = resolveProjectId(args.project_id);
      await defaultClient.delete(
        `/projects/${projectId}/issues/${args.issue_iid}/award_emoji/${encodeURIComponent(args.award_id)}`,
      );
      return { content: [{ type: "text", text: "Reaction removed" }] };
    },
  );
  t9.disable();
  tools.set("delete_issue_emoji_reaction", t9);

  // ---------- Issue-note-level reactions ----------

  const t10 = server.registerTool(
    "list_issue_note_emoji_reactions",
    {
      title: "List Issue Note Emoji Reactions",
      description:
        "List all emoji reactions on an issue note. Pass discussion_id for replies inside a discussion thread.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        issue_iid: z.coerce.number().describe("Issue IID"),
        note_id: z.coerce.number().describe("Note ID"),
        discussion_id: noteDiscussionField,
      },
      annotations: READ_ONLY_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.string().optional(),
          issue_iid: z.coerce.number(),
          note_id: z.coerce.number(),
          discussion_id: z.coerce.string().optional(),
        })
        .parse(params);
      const projectId = resolveProjectId(args.project_id);
      const url = buildNoteReactionUrl(
        projectId,
        "issues",
        args.issue_iid,
        args.note_id,
        args.discussion_id,
      );
      const data = await defaultClient.get(url);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
  t10.disable();
  tools.set("list_issue_note_emoji_reactions", t10);

  const t11 = server.registerTool(
    "create_issue_note_emoji_reaction",
    {
      title: "Create Issue Note Emoji Reaction",
      description:
        "Add an emoji reaction to an issue note. Pass discussion_id for replies inside a discussion thread.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        issue_iid: z.coerce.number().describe("Issue IID"),
        note_id: z.coerce.number().describe("Note ID"),
        discussion_id: noteDiscussionField,
        name: emojiNameField,
      },
      annotations: CREATE_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.string().optional(),
          issue_iid: z.coerce.number(),
          note_id: z.coerce.number(),
          discussion_id: z.coerce.string().optional(),
          name: z.string(),
        })
        .parse(params);
      const projectId = resolveProjectId(args.project_id);
      const url = buildNoteReactionUrl(
        projectId,
        "issues",
        args.issue_iid,
        args.note_id,
        args.discussion_id,
      );
      const data = await defaultClient.post(url, { name: args.name });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
  t11.disable();
  tools.set("create_issue_note_emoji_reaction", t11);

  const t12 = server.registerTool(
    "delete_issue_note_emoji_reaction",
    {
      title: "Delete Issue Note Emoji Reaction",
      description:
        "Remove an emoji reaction from an issue note. Pass discussion_id for replies inside a discussion thread.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        issue_iid: z.coerce.number().describe("Issue IID"),
        note_id: z.coerce.number().describe("Note ID"),
        discussion_id: noteDiscussionField,
        award_id: awardIdField,
      },
      annotations: DELETE_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.string().optional(),
          issue_iid: z.coerce.number(),
          note_id: z.coerce.number(),
          discussion_id: z.coerce.string().optional(),
          award_id: z.coerce.string(),
        })
        .parse(params);
      const projectId = resolveProjectId(args.project_id);
      const url = buildNoteReactionUrl(
        projectId,
        "issues",
        args.issue_iid,
        args.note_id,
        args.discussion_id,
        encodeURIComponent(args.award_id),
      );
      await defaultClient.delete(url);
      return { content: [{ type: "text", text: "Reaction removed" }] };
    },
  );
  t12.disable();
  tools.set("delete_issue_note_emoji_reaction", t12);

  // ---------- Work-item reactions (GraphQL) ----------
  //
  // REST /award_emoji doesn't cover work items — only the GraphQL awardEmoji
  // mutations do. These tools resolve (project_id, iid) to a work-item GID
  // via the existing resolveWorkItemGID helper (from work-items.ts) and
  // issue awardEmojiAdd / awardEmojiRemove mutations against the GID.
  //
  // Note: GraphQL deletes by name, NOT by award_id like REST.

  const t13 = server.registerTool(
    "list_work_item_emoji_reactions",
    {
      title: "List Work Item Emoji Reactions",
      description: "List all emoji reactions on a work item",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID (IID) of the work item"),
      },
      annotations: READ_ONLY_HINT,
    },
    async (params) => {
      const args = z
        .object({ project_id: z.coerce.string(), iid: z.coerce.number() })
        .parse(params);
      const { workItemGID } = await resolveWorkItemGID(args.project_id, args.iid);
      const data = await defaultClient.graphql<{
        awardEmojis: { nodes: Array<Record<string, unknown>> };
      }>(
        `query($awardableId: AwardableID!) {
          awardEmojis(awardableId: $awardableId) {
            nodes { name user { id username name } }
          }
        }`,
        { awardableId: workItemGID },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data.awardEmojis?.nodes ?? [], null, 2) }],
      };
    },
  );
  t13.disable();
  tools.set("list_work_item_emoji_reactions", t13);

  const t14 = server.registerTool(
    "create_work_item_emoji_reaction",
    {
      title: "Create Work Item Emoji Reaction",
      description: "Add an emoji reaction to a work item (e.g. thumbsup, rocket, eyes)",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID (IID) of the work item"),
        name: emojiNameField,
      },
      annotations: CREATE_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.coerce.string(),
          iid: z.coerce.number(),
          name: z.string(),
        })
        .parse(params);
      const { workItemGID } = await resolveWorkItemGID(args.project_id, args.iid);
      const data = await defaultClient.graphql<{
        awardEmojiAdd: { awardEmoji: Record<string, unknown>; errors: string[] };
      }>(
        `mutation($awardableId: AwardableID!, $name: String!) {
          awardEmojiAdd(input: { awardableId: $awardableId, name: $name }) {
            awardEmoji { name user { id username } }
            errors
          }
        }`,
        { awardableId: workItemGID, name: args.name },
      );
      if (data.awardEmojiAdd?.errors?.length) {
        throw new Error(`awardEmojiAdd: ${data.awardEmojiAdd.errors.join(", ")}`);
      }
      return { content: [{ type: "text", text: JSON.stringify(data.awardEmojiAdd, null, 2) }] };
    },
  );
  t14.disable();
  tools.set("create_work_item_emoji_reaction", t14);

  const t15 = server.registerTool(
    "delete_work_item_emoji_reaction",
    {
      title: "Delete Work Item Emoji Reaction",
      description:
        "Remove an emoji reaction from a work item by name (GraphQL deletes by name, not by award_id).",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID (IID) of the work item"),
        name: emojiNameField,
      },
      annotations: DELETE_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.coerce.string(),
          iid: z.coerce.number(),
          name: z.string(),
        })
        .parse(params);
      const { workItemGID } = await resolveWorkItemGID(args.project_id, args.iid);
      const data = await defaultClient.graphql<{
        awardEmojiRemove: { errors: string[] };
      }>(
        `mutation($awardableId: AwardableID!, $name: String!) {
          awardEmojiRemove(input: { awardableId: $awardableId, name: $name }) {
            errors
          }
        }`,
        { awardableId: workItemGID, name: args.name },
      );
      if (data.awardEmojiRemove?.errors?.length) {
        throw new Error(`awardEmojiRemove: ${data.awardEmojiRemove.errors.join(", ")}`);
      }
      return { content: [{ type: "text", text: "Reaction removed" }] };
    },
  );
  t15.disable();
  tools.set("delete_work_item_emoji_reaction", t15);

  const t16 = server.registerTool(
    "list_work_item_note_emoji_reactions",
    {
      title: "List Work Item Note Emoji Reactions",
      description:
        "List all emoji reactions on a work item note. note_id is the GraphQL GID (e.g. 'gid://gitlab/Note/123' from list_work_item_notes).",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID of the work item"),
        note_id: z
          .string()
          .describe("GraphQL note GID (e.g. 'gid://gitlab/Note/123' from list_work_item_notes)"),
      },
      annotations: READ_ONLY_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.coerce.string(),
          iid: z.coerce.number(),
          note_id: z.string(),
        })
        .parse(params);
      // Resolve work-item GID to validate the iid even though the query
      // operates on the note GID directly — surfaces "not found" errors
      // with a friendlier message than GraphQL's raw "node not found".
      await resolveWorkItemGID(args.project_id, args.iid);
      const data = await defaultClient.graphql<{
        awardEmojis: { nodes: Array<Record<string, unknown>> };
      }>(
        `query($awardableId: AwardableID!) {
          awardEmojis(awardableId: $awardableId) {
            nodes { name user { id username name } }
          }
        }`,
        { awardableId: args.note_id },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data.awardEmojis?.nodes ?? [], null, 2) }],
      };
    },
  );
  t16.disable();
  tools.set("list_work_item_note_emoji_reactions", t16);

  const t17 = server.registerTool(
    "create_work_item_note_emoji_reaction",
    {
      title: "Create Work Item Note Emoji Reaction",
      description:
        "Add an emoji reaction to a work item note. note_id is the GraphQL GID from list_work_item_notes.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID of the work item"),
        note_id: z.string().describe("GraphQL note GID (e.g. 'gid://gitlab/Note/123')"),
        name: emojiNameField,
      },
      annotations: CREATE_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.coerce.string(),
          iid: z.coerce.number(),
          note_id: z.string(),
          name: z.string(),
        })
        .parse(params);
      await resolveWorkItemGID(args.project_id, args.iid);
      const data = await defaultClient.graphql<{
        awardEmojiAdd: { awardEmoji: Record<string, unknown>; errors: string[] };
      }>(
        `mutation($awardableId: AwardableID!, $name: String!) {
          awardEmojiAdd(input: { awardableId: $awardableId, name: $name }) {
            awardEmoji { name user { id username } }
            errors
          }
        }`,
        { awardableId: args.note_id, name: args.name },
      );
      if (data.awardEmojiAdd?.errors?.length) {
        throw new Error(`awardEmojiAdd: ${data.awardEmojiAdd.errors.join(", ")}`);
      }
      return { content: [{ type: "text", text: JSON.stringify(data.awardEmojiAdd, null, 2) }] };
    },
  );
  t17.disable();
  tools.set("create_work_item_note_emoji_reaction", t17);

  const t18 = server.registerTool(
    "delete_work_item_note_emoji_reaction",
    {
      title: "Delete Work Item Note Emoji Reaction",
      description:
        "Remove an emoji reaction from a work item note by name (GraphQL deletes by name, not by award_id).",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID of the work item"),
        note_id: z.string().describe("GraphQL note GID (e.g. 'gid://gitlab/Note/123')"),
        name: emojiNameField,
      },
      annotations: DELETE_HINT,
    },
    async (params) => {
      const args = z
        .object({
          project_id: z.coerce.string(),
          iid: z.coerce.number(),
          note_id: z.string(),
          name: z.string(),
        })
        .parse(params);
      await resolveWorkItemGID(args.project_id, args.iid);
      const data = await defaultClient.graphql<{
        awardEmojiRemove: { errors: string[] };
      }>(
        `mutation($awardableId: AwardableID!, $name: String!) {
          awardEmojiRemove(input: { awardableId: $awardableId, name: $name }) {
            errors
          }
        }`,
        { awardableId: args.note_id, name: args.name },
      );
      if (data.awardEmojiRemove?.errors?.length) {
        throw new Error(`awardEmojiRemove: ${data.awardEmojiRemove.errors.join(", ")}`);
      }
      return { content: [{ type: "text", text: "Reaction removed" }] };
    },
  );
  t18.disable();
  tools.set("delete_work_item_note_emoji_reaction", t18);

  return tools;
}

import { z } from "zod";
import { GitLabMilestoneRefSchema, GitLabUserRefSchema } from "./shared.js";

/**
 * Response schema for GitLab merge request resources. Covers the fields
 * picked by `MergeRequestSlimShape` (below) plus a handful of
 * universally-present fields. `.passthrough()` preserves unknown fields so
 * Phase 1 doesn't drop anything the LLM might be relying on when callers
 * opt into the full payload via `fields: "all"`.
 */
export const GitLabMergeRequestSchema = z
  .object({
    id: z.number(),
    iid: z.number(),
    project_id: z.number(),
    title: z.string(),
    description: z.string().nullable().optional(),
    state: z.string(),
    draft: z.boolean().optional(),
    work_in_progress: z.boolean().optional(),
    labels: z.array(z.string()).optional(),
    source_branch: z.string(),
    target_branch: z.string(),
    author: GitLabUserRefSchema.nullable().optional(),
    assignees: z.array(GitLabUserRefSchema).optional(),
    assignee: GitLabUserRefSchema.nullable().optional(),
    reviewers: z.array(GitLabUserRefSchema).optional(),
    milestone: GitLabMilestoneRefSchema.nullable().optional(),
    web_url: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    merged_at: z.string().nullable().optional(),
    closed_at: z.string().nullable().optional(),
    merge_status: z.string().nullable().optional(),
    detailed_merge_status: z.string().nullable().optional(),
    sha: z.string().nullable().optional(),
    merge_commit_sha: z.string().nullable().optional(),
    squash_commit_sha: z.string().nullable().optional(),
    user_notes_count: z.number().optional(),
    upvotes: z.number().optional(),
    downvotes: z.number().optional(),
  })
  .passthrough();

export const GitLabMergeRequestListSchema = z.array(GitLabMergeRequestSchema);

export type GitLabMergeRequest = z.infer<typeof GitLabMergeRequestSchema>;

/**
 * Slim shape: the fields an LLM almost always wants from a merge request.
 * Single source of truth for both the typed `.pick()` view
 * (`GitLabMergeRequestSlimSchema`) and the field-name allow-list consumed by
 * `projectField` / `projectFields` (`MERGE_REQUEST_SLIM_FIELDS`).
 *
 * Phase 2 (DOT-557): schemas drive slim defaults; the user-facing surface is
 * the existing `fields` parameter on tool inputs (`"all"` opts back into the
 * full GitLab response, `["iid", "title", ...]` picks a custom subset).
 */
export const MergeRequestSlimShape = {
  id: true,
  iid: true,
  title: true,
  state: true,
  draft: true,
  labels: true,
  source_branch: true,
  target_branch: true,
  author: true,
  assignees: true,
  reviewers: true,
  milestone: true,
  web_url: true,
  created_at: true,
  updated_at: true,
  merge_status: true,
  detailed_merge_status: true,
} as const;

export const GitLabMergeRequestSlimSchema = GitLabMergeRequestSchema.pick(MergeRequestSlimShape);
export type GitLabMergeRequestSlim = z.infer<typeof GitLabMergeRequestSlimSchema>;

export const MERGE_REQUEST_SLIM_FIELDS = Object.keys(MergeRequestSlimShape) as ReadonlyArray<
  keyof typeof MergeRequestSlimShape
>;

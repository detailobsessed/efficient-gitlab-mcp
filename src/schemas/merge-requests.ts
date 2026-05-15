import { z } from "zod";
import { GitLabMilestoneRefSchema, GitLabUserRefSchema } from "./shared.js";

/**
 * Response schema for GitLab merge request resources. Covers the fields in
 * LIST_MERGE_REQUESTS_DEFAULT_FIELDS (see `src/tools/merge-requests.ts`)
 * plus a handful of universally-present fields. `.passthrough()` preserves
 * unknown fields so Phase 1 doesn't drop anything the LLM might be relying
 * on; Phase 2 (DOT-557) will introduce explicit `.pick()` slimming.
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

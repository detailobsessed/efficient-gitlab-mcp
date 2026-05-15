import { z } from "zod";
import { GitLabMilestoneRefSchema, GitLabUserRefSchema } from "./shared.js";

/**
 * Response schema for GitLab issue resources. Covers LIST_ISSUES_DEFAULT_FIELDS
 * (see `src/tools/issues.ts`) plus a handful of universally-present fields.
 * `.passthrough()` preserves unknown fields for Phase 1 compatibility.
 */
export const GitLabIssueSchema = z
  .object({
    id: z.number(),
    iid: z.number(),
    project_id: z.number(),
    title: z.string(),
    description: z.string().nullable().optional(),
    state: z.string(),
    labels: z.array(z.string()).optional(),
    author: GitLabUserRefSchema.nullable().optional(),
    assignee: GitLabUserRefSchema.nullable().optional(),
    assignees: z.array(GitLabUserRefSchema).optional(),
    milestone: GitLabMilestoneRefSchema.nullable().optional(),
    due_date: z.string().nullable().optional(),
    web_url: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    closed_at: z.string().nullable().optional(),
    closed_by: GitLabUserRefSchema.nullable().optional(),
    confidential: z.boolean().optional(),
    user_notes_count: z.number().optional(),
    upvotes: z.number().optional(),
    downvotes: z.number().optional(),
    issue_type: z.string().optional(),
  })
  .passthrough();

export const GitLabIssueListSchema = z.array(GitLabIssueSchema);

export type GitLabIssue = z.infer<typeof GitLabIssueSchema>;

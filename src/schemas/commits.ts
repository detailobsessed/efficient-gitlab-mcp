import { z } from "zod";

/**
 * Response schema for GitLab commit resources. Covers
 * LIST_COMMITS_DEFAULT_FIELDS plus stats and trailer fields commonly
 * returned by `GET /projects/:id/repository/commits`.
 */
export const GitLabCommitSchema = z
  .object({
    id: z.string(),
    short_id: z.string(),
    title: z.string(),
    message: z.string(),
    author_name: z.string(),
    author_email: z.string(),
    authored_date: z.string(),
    committer_name: z.string().optional(),
    committer_email: z.string().optional(),
    committed_date: z.string(),
    parent_ids: z.array(z.string()).optional(),
    web_url: z.string().optional(),
    created_at: z.string().optional(),
    trailers: z.record(z.string(), z.string()).optional(),
    extended_trailers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
    stats: z
      .object({
        additions: z.number(),
        deletions: z.number(),
        total: z.number(),
      })
      .passthrough()
      .optional(),
    last_pipeline: z
      .object({
        id: z.number(),
        status: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const GitLabCommitListSchema = z.array(GitLabCommitSchema);

export type GitLabCommit = z.infer<typeof GitLabCommitSchema>;

/**
 * Slim shape (Phase 3 / DOT-558): the fields an LLM almost always wants from
 * a commit. Single source of truth for both the typed `.pick()` view
 * (`GitLabCommitSlimSchema`) and the field-name allow-list consumed by
 * `projectField` / `projectFields` (`COMMIT_SLIM_FIELDS`). Mirrors the
 * compact defaults the codebase already used for `list_commits`.
 */
export const CommitSlimShape = {
  id: true,
  short_id: true,
  title: true,
  message: true,
  author_name: true,
  author_email: true,
  authored_date: true,
  committed_date: true,
  parent_ids: true,
  web_url: true,
} as const;

export const GitLabCommitSlimSchema = GitLabCommitSchema.pick(CommitSlimShape);
export type GitLabCommitSlim = z.infer<typeof GitLabCommitSlimSchema>;

export const COMMIT_SLIM_FIELDS = Object.keys(CommitSlimShape) as ReadonlyArray<
  keyof typeof CommitSlimShape
>;

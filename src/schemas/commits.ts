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

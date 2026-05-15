import { z } from "zod";
import { GitLabUserRefSchema } from "./shared.js";

/**
 * Response schema for GitLab pipeline resources. Covers
 * LIST_PIPELINES_DEFAULT_FIELDS plus user/timing fields commonly returned.
 */
export const GitLabPipelineSchema = z
  .object({
    id: z.number(),
    iid: z.number().nullable().optional(),
    project_id: z.number(),
    sha: z.string(),
    ref: z.string().nullable().optional(),
    status: z.string(),
    source: z.string().nullable().optional(),
    web_url: z.string().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    started_at: z.string().nullable().optional(),
    finished_at: z.string().nullable().optional(),
    committed_at: z.string().nullable().optional(),
    duration: z.number().nullable().optional(),
    queued_duration: z.number().nullable().optional(),
    user: GitLabUserRefSchema.nullable().optional(),
    before_sha: z.string().nullable().optional(),
  })
  .passthrough();

export const GitLabPipelineListSchema = z.array(GitLabPipelineSchema);

export type GitLabPipeline = z.infer<typeof GitLabPipelineSchema>;

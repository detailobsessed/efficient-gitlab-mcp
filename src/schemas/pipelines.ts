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

/**
 * Slim shape (Phase 3 / DOT-558): the fields an LLM almost always wants from
 * a pipeline. Mirrors the compact defaults the codebase already used for
 * `list_pipelines`. Drops timing details (started_at, finished_at, duration,
 * queued_duration), before_sha, and user — pass `fields: "all"` to get them.
 */
export const PipelineSlimShape = {
  id: true,
  iid: true,
  project_id: true,
  sha: true,
  ref: true,
  status: true,
  source: true,
  web_url: true,
  created_at: true,
  updated_at: true,
} as const;

export const GitLabPipelineSlimSchema = GitLabPipelineSchema.pick(PipelineSlimShape);
export type GitLabPipelineSlim = z.infer<typeof GitLabPipelineSlimSchema>;

export const PIPELINE_SLIM_FIELDS = Object.keys(PipelineSlimShape) as ReadonlyArray<
  keyof typeof PipelineSlimShape
>;

import { z } from "zod";
import { GitLabUserRefSchema } from "./shared.js";

/**
 * Response schema for GitLab project resources. Covers
 * ProjectSlimShape plus a handful of commonly-used fields.
 * `.passthrough()` keeps unknown fields for Phase 1 compatibility.
 *
 * Note: `runners_token` is intentionally included as nullable here so the
 * schema accepts both redacted-by-default and `include_secrets: true`
 * responses. The redaction itself is handled in the handler, not the schema.
 */
export const GitLabProjectSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    name_with_namespace: z.string().optional(),
    path: z.string().optional(),
    path_with_namespace: z.string().optional(),
    description: z.string().nullable().optional(),
    default_branch: z.string().nullable().optional(),
    visibility: z.string().optional(),
    web_url: z.string().optional(),
    ssh_url_to_repo: z.string().optional(),
    http_url_to_repo: z.string().optional(),
    last_activity_at: z.string().nullable().optional(),
    archived: z.boolean().optional(),
    topics: z.array(z.string()).optional(),
    owner: GitLabUserRefSchema.nullable().optional(),
    creator_id: z.number().optional(),
    namespace: z
      .object({
        id: z.number(),
        name: z.string().optional(),
        path: z.string().optional(),
        kind: z.string().optional(),
        full_path: z.string().optional(),
      })
      .passthrough()
      .optional(),
    star_count: z.number().optional(),
    forks_count: z.number().optional(),
    open_issues_count: z.number().optional(),
    runners_token: z.string().nullable().optional(),
  })
  .passthrough();

export const GitLabProjectListSchema = z.array(GitLabProjectSchema);

export type GitLabProject = z.infer<typeof GitLabProjectSchema>;

/**
 * Slim shape (Phase 3 / DOT-558): the fields an LLM almost always wants from
 * a project. Mirrors the compact defaults the codebase already used for
 * `list_projects` / `list_group_projects`. Excludes `runners_token` (a
 * sensitive field gated by the `include_secrets` parameter; redaction
 * still runs before projection in the handlers).
 */
export const ProjectSlimShape = {
  id: true,
  name: true,
  name_with_namespace: true,
  path_with_namespace: true,
  description: true,
  default_branch: true,
  visibility: true,
  web_url: true,
  ssh_url_to_repo: true,
  http_url_to_repo: true,
  last_activity_at: true,
  archived: true,
  topics: true,
} as const;

export const GitLabProjectSlimSchema = GitLabProjectSchema.pick(ProjectSlimShape);
export type GitLabProjectSlim = z.infer<typeof GitLabProjectSlimSchema>;

export const PROJECT_SLIM_FIELDS = Object.keys(ProjectSlimShape) as ReadonlyArray<
  keyof typeof ProjectSlimShape
>;

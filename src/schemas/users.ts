import { z } from "zod";

/**
 * Response schema for GitLab user resources (`/user`, `/users/:id`).
 *
 * The `/user` (current user) and `/users/:id` (other users) endpoints share
 * a common shape — current-user responses additionally include identity
 * fields (email, two_factor_enabled, etc.) which are kept optional here.
 */
export const GitLabUserSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    username: z.string(),
    state: z.string(),
    avatar_url: z.string().nullable().optional(),
    web_url: z.string(),
    created_at: z.string().optional(),
    bio: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    public_email: z.string().nullable().optional(),
    organization: z.string().nullable().optional(),
    job_title: z.string().nullable().optional(),
    pronouns: z.string().nullable().optional(),
    bot: z.boolean().optional(),
    work_information: z.string().nullable().optional(),
    followers: z.number().optional(),
    following: z.number().optional(),
    // Current-user-only fields:
    email: z.string().nullable().optional(),
    last_sign_in_at: z.string().nullable().optional(),
    confirmed_at: z.string().nullable().optional(),
    last_activity_on: z.string().nullable().optional(),
    theme_id: z.number().nullable().optional(),
    color_scheme_id: z.number().nullable().optional(),
    projects_limit: z.number().optional(),
    current_sign_in_at: z.string().nullable().optional(),
    two_factor_enabled: z.boolean().optional(),
    external: z.boolean().optional(),
    private_profile: z.boolean().optional(),
    is_admin: z.boolean().optional(),
  })
  .passthrough();

export type GitLabUser = z.infer<typeof GitLabUserSchema>;

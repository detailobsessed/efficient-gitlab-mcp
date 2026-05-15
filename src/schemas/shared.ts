import { z } from "zod";

/**
 * Common subtypes that appear across multiple GitLab response shapes. Kept
 * permissive — most fields are nullable on the API and we don't want a
 * single missing avatar URL to trip schema validation.
 */

export const GitLabUserRefSchema = z
  .object({
    id: z.number(),
    name: z.string().nullable().optional(),
    username: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    avatar_url: z.string().nullable().optional(),
    web_url: z.string().nullable().optional(),
  })
  .passthrough();

export const GitLabMilestoneRefSchema = z
  .object({
    id: z.number(),
    iid: z.number().nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    web_url: z.string().nullable().optional(),
  })
  .passthrough();

export const GitLabReferencesSchema = z
  .object({
    short: z.string().nullable().optional(),
    relative: z.string().nullable().optional(),
    full: z.string().nullable().optional(),
  })
  .passthrough();

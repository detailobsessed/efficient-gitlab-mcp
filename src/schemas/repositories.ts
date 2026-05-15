import { z } from "zod";

/**
 * Response schema for entries returned by GitLab's
 * `GET /projects/:id/repository/tree` endpoint.
 */
export const GitLabTreeItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["tree", "blob", "commit"]),
    path: z.string(),
    mode: z.string().optional(),
  })
  .passthrough();

export const GitLabTreeListSchema = z.array(GitLabTreeItemSchema);

export type GitLabTreeItem = z.infer<typeof GitLabTreeItemSchema>;

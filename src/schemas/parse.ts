import type { ZodTypeAny, z } from "zod";
import type { Logger } from "../utils/logger.js";

/**
 * Run a GitLab API response through a Zod schema.
 *
 * Phase 1 of the response-schema initiative (DOT-555) intentionally **does
 * not** fail loudly on schema mismatch. Real GitLab responses change shape
 * over GitLab releases and we don't yet have CI coverage against a live
 * instance — strict parsing would risk breaking users if a schema is
 * incomplete. Instead we log a structured warning and pass the original
 * response through unchanged. Phase 4 (DOT-559) introduces the strict
 * weekly CI gate.
 *
 * For Phase 1 the value is:
 *   - establish the schema-per-endpoint convention,
 *   - get TypeScript types flowing from schemas into handlers,
 *   - surface drift visibly via logs (not silently).
 *
 * Phase 2 (DOT-557) layers field slimming on top: each domain schema
 * defines a `*SlimShape` consumed via `.pick()` plus a `*_SLIM_FIELDS`
 * allow-list passed to `projectFields` / `projectField`. The user-facing
 * surface is the existing `fields` parameter on tool inputs — `fields: "all"`
 * opts back into the full GitLab response, `fields: ["iid", "title", ...]`
 * picks a custom subset. That's where the token-efficiency win lands.
 */
export function parseGitLabResponse<S extends ZodTypeAny>(
  schema: S,
  response: unknown,
  ctx: string,
  logger?: Logger,
): z.infer<S> {
  const result = schema.safeParse(response);
  if (result.success) {
    return result.data;
  }
  logger?.warn("GitLab response failed schema validation; passing through unchanged", {
    ctx,
    issues: result.error.issues.map((i) => ({
      path: i.path.join("."),
      code: i.code,
      message: i.message,
    })),
  });
  return response as z.infer<S>;
}

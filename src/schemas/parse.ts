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
 * Phase 2 (DOT-557) will use `.pick()` on these schemas to slim responses
 * behind a `verbose: false` default — that's where the token-efficiency win
 * lands.
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

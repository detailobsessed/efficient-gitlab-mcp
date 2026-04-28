import { z } from "zod";

/**
 * Zod schema that accepts either a real string array or a JSON-stringified
 * array (e.g. '["a","b"]'). LLMs frequently serialize arrays as strings
 * when filling MCP tool parameters.
 */
export function coerceStringArray(description: string) {
  return z.preprocess((val) => {
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // not JSON, fall through to validation error
      }
    }
    return val;
  }, z.array(z.string()).describe(description));
}

/**
 * Zod schema for the `fields` parameter on list-endpoints (see DOT-516).
 * Accepts:
 * - the literal string `"all"` to opt into the raw GitLab response
 * - an array of field names to project down to
 * - a JSON-stringified field array (LLM tolerance, same idea as coerceStringArray)
 *
 * Returns either `"all"` or `string[]` after coercion, matching `projectFields`.
 */
export function fieldsParam(resourceDescription: string) {
  return z.preprocess(
    (val) => {
      if (val === "all") return "all";
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // not JSON, fall through to validation error
        }
      }
      return val;
    },
    z
      .union([z.literal("all"), z.array(z.string())])
      .describe(
        `Allow-list of fields to return on each ${resourceDescription} row. Defaults to a compact set. Pass "all" for the raw GitLab response.`,
      ),
  );
}

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

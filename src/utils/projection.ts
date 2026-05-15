/**
 * Field projection helpers for compacting verbose list-endpoint responses.
 *
 * GitLab list endpoints return objects with 100+ fields per row by default
 * (project rows, MR rows, etc.). For an LLM with a context budget, this is
 * extremely wasteful — the spike comparison measured a `list_projects` call
 * with 5 owned projects at ~32 KB, with the relevant signal living in maybe
 * 10 fields per row (~3 KB total).
 *
 * Allow-list approach (not deny-list):
 * - We pick a deterministic compact set of fields per resource.
 * - When GitLab adds new fields to its API, our compact output stays compact.
 * - Callers can request the full payload with `fields: "all"` or pick their
 *   own list with `fields: ["id", "name"]`.
 *
 * This module is intentionally tiny and dependency-free so any list handler
 * can drop a 1-line projection call into its response pipeline.
 */

type FieldsParam = "all" | string[] | undefined;

/**
 * Project a list of items down to either:
 * - `defaultFields` when the caller didn't ask for anything specific
 * - the caller's explicit `requested` list when they did
 * - the items unchanged when they explicitly asked for `"all"`
 *
 * Missing fields in source items don't show up as `undefined` in output —
 * only existing keys are copied. This keeps the projection idempotent and
 * avoids leaking the field names of fields that happened to be absent.
 */
export function projectFields<T extends Record<string, unknown>>(
  items: T[],
  defaultFields: readonly string[],
  requested: FieldsParam,
): Partial<T>[] {
  if (requested === "all") return items;
  const allow = requested && requested.length > 0 ? requested : defaultFields;
  const allowSet = new Set(allow);
  return items.map((item) => {
    const out: Record<string, unknown> = {};
    for (const k of allowSet) {
      if (k in item) out[k] = item[k];
    }
    return out as Partial<T>;
  });
}

/**
 * Singular sibling of {@link projectFields} for `get_*`-style endpoints that
 * return one resource rather than a list. Same allow-list semantics:
 * `"all"` returns the item unchanged, an array picks those keys explicitly,
 * `undefined` or `[]` falls back to `defaultFields`.
 */
export function projectField<T extends Record<string, unknown>>(
  item: T,
  defaultFields: readonly string[],
  requested: FieldsParam,
): Partial<T> {
  return projectFields([item], defaultFields, requested)[0];
}

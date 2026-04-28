import { describe, expect, it } from "bun:test";
import { projectFields } from "../src/utils/projection.js";

describe("projectFields", () => {
  const items = [
    { id: 1, name: "Alpha", description: "first", runners_token: "secret-1", visibility: "public" },
    {
      id: 2,
      name: "Beta",
      description: "second",
      runners_token: "secret-2",
      visibility: "private",
    },
  ];
  const defaults = ["id", "name", "visibility"] as const;

  it("applies defaultFields when requested is undefined", () => {
    const result = projectFields(items, defaults, undefined);
    expect(result).toEqual([
      { id: 1, name: "Alpha", visibility: "public" },
      { id: 2, name: "Beta", visibility: "private" },
    ]);
  });

  it("applies defaultFields when requested is an empty array", () => {
    // Empty list ≡ unset — fall back to defaults
    const result = projectFields(items, defaults, []);
    expect(result).toEqual([
      { id: 1, name: "Alpha", visibility: "public" },
      { id: 2, name: "Beta", visibility: "private" },
    ]);
  });

  it("returns the items unchanged when requested is 'all'", () => {
    const result = projectFields(items, defaults, "all");
    expect(result).toBe(items);
  });

  it("uses caller-supplied list when provided, ignoring defaults", () => {
    const result = projectFields(items, defaults, ["id", "description"]);
    expect(result).toEqual([
      { id: 1, description: "first" },
      { id: 2, description: "second" },
    ]);
  });

  it("does not surface missing fields as undefined", () => {
    // 'absent_field' isn't in any source item — it must not appear in output
    const result = projectFields(items, defaults, ["id", "absent_field"]);
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(Object.hasOwn(result[0], "absent_field")).toBe(false);
  });

  it("handles an empty list", () => {
    const result = projectFields([] as Array<{ id: number; name: string }>, defaults, undefined);
    expect(result).toEqual([]);
  });

  it("preserves field order from the allow-list, not the source object", () => {
    // Source has fields in id-name-description order; allow-list inverts.
    const result = projectFields(items, defaults, ["description", "id"]);
    // We don't depend on object key order in the output — but the keys should
    // be exactly the requested set, no more, no less.
    expect(Object.keys(result[0]).sort()).toEqual(["description", "id"]);
  });

  it("passing 'all' does not lose secret fields like runners_token", () => {
    // Important precondition for the redaction layer that sits before projection
    // (caller can chain redact -> project; 'all' bypasses both layers' compaction)
    const result = projectFields(items, defaults, "all");
    expect((result[0] as Record<string, unknown>).runners_token).toBe("secret-1");
  });
});

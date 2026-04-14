import { describe, expect, it } from "bun:test";
import { coerceStringArray } from "../src/utils/schema-helpers.js";

describe("coerceStringArray", () => {
  const schema = coerceStringArray("test field");

  it("passes through a real array unchanged", () => {
    const result = schema.parse(["a", "b"]);
    expect(result).toEqual(["a", "b"]);
  });

  it("parses a JSON-stringified array", () => {
    const result = schema.parse('["bug", "urgent"]');
    expect(result).toEqual(["bug", "urgent"]);
  });

  it("parses an empty JSON array string", () => {
    const result = schema.parse("[]");
    expect(result).toEqual([]);
  });

  it("rejects a non-array JSON string", () => {
    expect(() => schema.parse('"hello"')).toThrow();
  });

  it("rejects malformed JSON", () => {
    expect(() => schema.parse("not json")).toThrow();
  });

  it("rejects a number", () => {
    expect(() => schema.parse(42)).toThrow();
  });
});

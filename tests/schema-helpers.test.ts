import { describe, expect, it } from "bun:test";
import { coerceStringArray, fieldsParam } from "../src/utils/schema-helpers.js";

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

describe("fieldsParam", () => {
  const schema = fieldsParam("project");

  it('accepts the literal string "all" unchanged', () => {
    const result = schema.parse("all");
    expect(result).toBe("all");
  });

  it("passes through a real array of field names", () => {
    const result = schema.parse(["id", "name"]);
    expect(result).toEqual(["id", "name"]);
  });

  it("parses a JSON-stringified field array", () => {
    const result = schema.parse('["id", "name"]');
    expect(result).toEqual(["id", "name"]);
  });

  it("parses an empty JSON array string", () => {
    const result = schema.parse("[]");
    expect(result).toEqual([]);
  });

  it("rejects an arbitrary string that isn't 'all' or JSON", () => {
    expect(() => schema.parse("name,id")).toThrow();
  });

  it("rejects a number", () => {
    expect(() => schema.parse(42)).toThrow();
  });
});

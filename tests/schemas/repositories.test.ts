import { describe, expect, it } from "bun:test";
import { GitLabTreeItemSchema, GitLabTreeListSchema } from "../../src/schemas/repositories.js";
import treeFixture from "../fixtures/repositories/get_repository_tree.json";

describe("GitLabTreeItemSchema", () => {
  it("parses a real-shape repository_tree response", () => {
    const result = GitLabTreeListSchema.safeParse(treeFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      expect(result.data[0].type).toBe("tree");
      expect(result.data[1].type).toBe("blob");
      expect(result.data[2].type).toBe("commit");
    }
  });

  it("rejects items with unknown type values", () => {
    const result = GitLabTreeItemSchema.safeParse({
      id: "abc",
      name: "x",
      type: "submodule",
      path: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects items missing required fields", () => {
    const result = GitLabTreeItemSchema.safeParse({ name: "incomplete" });
    expect(result.success).toBe(false);
  });
});

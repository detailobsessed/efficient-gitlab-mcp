import { describe, expect, it } from "bun:test";
import { GitLabProjectListSchema, GitLabProjectSchema } from "../../src/schemas/projects.js";
import listProjectsFixture from "../fixtures/projects/list_projects.json";

describe("GitLabProjectSchema", () => {
  it("parses a real-shape list_projects response", () => {
    const result = GitLabProjectListSchema.safeParse(listProjectsFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe("Alpha");
      expect(result.data[0].path_with_namespace).toBe("my-group/alpha");
    }
  });

  it("preserves unknown bloat fields via .passthrough()", () => {
    const result = GitLabProjectListSchema.safeParse(listProjectsFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data[0] as Record<string, unknown>).shared_runners_enabled).toBe(true);
    }
  });

  it("rejects malformed input (missing required fields)", () => {
    const result = GitLabProjectSchema.safeParse({ visibility: "public" });
    expect(result.success).toBe(false);
  });
});

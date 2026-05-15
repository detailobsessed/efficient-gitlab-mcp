import { describe, expect, it } from "bun:test";
import { GitLabIssueListSchema, GitLabIssueSchema } from "../../src/schemas/issues.js";
import getIssueFixture from "../fixtures/issues/get_issue.json";

describe("GitLabIssueSchema", () => {
  it("parses a real-shape get_issue response", () => {
    const result = GitLabIssueSchema.safeParse(getIssueFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.iid).toBe(10);
      expect(result.data.state).toBe("opened");
      expect(result.data.author?.username).toBe("admin");
    }
  });

  it("preserves unknown fields via .passthrough()", () => {
    const result = GitLabIssueSchema.safeParse(getIssueFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).weight).toBeNull();
    }
  });

  it("rejects malformed input (missing required fields)", () => {
    const result = GitLabIssueSchema.safeParse({ title: "no id, iid, etc" });
    expect(result.success).toBe(false);
  });

  it("parses an array of issues via GitLabIssueListSchema", () => {
    const result = GitLabIssueListSchema.safeParse([getIssueFixture]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
    }
  });
});

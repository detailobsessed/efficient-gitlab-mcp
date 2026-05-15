import { describe, expect, it } from "bun:test";
import { GitLabCommitListSchema, GitLabCommitSchema } from "../../src/schemas/commits.js";
import listCommitsFixture from "../fixtures/commits/list_commits.json";

describe("GitLabCommitSchema", () => {
  it("parses a real-shape list_commits response", () => {
    const result = GitLabCommitListSchema.safeParse(listCommitsFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].short_id).toBe("abc123de");
      expect(result.data[0].stats?.total).toBe(1);
    }
  });

  it("rejects malformed input (missing required fields)", () => {
    const result = GitLabCommitSchema.safeParse({ short_id: "abc" });
    expect(result.success).toBe(false);
  });
});

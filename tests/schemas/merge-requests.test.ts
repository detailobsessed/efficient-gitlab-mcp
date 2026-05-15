import { describe, expect, it } from "bun:test";
import {
  GitLabMergeRequestListSchema,
  GitLabMergeRequestSchema,
} from "../../src/schemas/merge-requests.js";
import getMergeRequestFixture from "../fixtures/merge-requests/get_merge_request.json";

describe("GitLabMergeRequestSchema", () => {
  it("parses a real-shape get_merge_request response", () => {
    const result = GitLabMergeRequestSchema.safeParse(getMergeRequestFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.iid).toBe(42);
      expect(result.data.state).toBe("opened");
      expect(result.data.author?.username).toBe("ismart");
    }
  });

  it("preserves unknown fields via .passthrough()", () => {
    const result = GitLabMergeRequestSchema.safeParse(getMergeRequestFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      // changes_count isn't in the explicit schema — passthrough keeps it.
      expect((result.data as Record<string, unknown>).changes_count).toBe("7");
    }
  });

  it("rejects malformed input (missing required fields)", () => {
    const result = GitLabMergeRequestSchema.safeParse({ title: "no id, iid, etc" });
    expect(result.success).toBe(false);
  });

  it("parses an array of merge requests via GitLabMergeRequestListSchema", () => {
    const result = GitLabMergeRequestListSchema.safeParse([getMergeRequestFixture]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].iid).toBe(42);
    }
  });
});

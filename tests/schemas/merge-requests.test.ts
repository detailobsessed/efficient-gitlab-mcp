import { describe, expect, it } from "bun:test";
import {
  GitLabMergeRequestListSchema,
  GitLabMergeRequestSchema,
  GitLabMergeRequestSlimSchema,
  MERGE_REQUEST_SLIM_FIELDS,
  MergeRequestSlimShape,
} from "../../src/schemas/merge-requests.js";
import { projectField } from "../../src/utils/projection.js";
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

describe("GitLabMergeRequestSlimSchema (Phase 2 / DOT-557)", () => {
  it("parses the fixture and types every slim field", () => {
    // `.pick()` on a `.passthrough()` parent keeps the passthrough behavior, so
    // this schema validates the *typed* shape of the slim fields but does not
    // strip extras. Runtime slimming happens via `projectField` (next test).
    const result = GitLabMergeRequestSlimSchema.safeParse(getMergeRequestFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      for (const k of Object.keys(MergeRequestSlimShape)) {
        if (k in (getMergeRequestFixture as Record<string, unknown>)) {
          expect(k in result.data).toBe(true);
        }
      }
    }
  });

  it("projectField with MERGE_REQUEST_SLIM_FIELDS keeps only slim keys at runtime", () => {
    const slim = projectField(
      getMergeRequestFixture as Record<string, unknown>,
      MERGE_REQUEST_SLIM_FIELDS,
      undefined,
    );
    const allowed = new Set<string>(MERGE_REQUEST_SLIM_FIELDS);
    for (const k of Object.keys(slim)) {
      expect(allowed.has(k)).toBe(true);
    }
    // bloat fields present in the fixture must be gone
    expect((slim as Record<string, unknown>).changes_count).toBeUndefined();
    expect((slim as Record<string, unknown>).blocking_discussions_resolved).toBeUndefined();
    expect((slim as Record<string, unknown>).has_conflicts).toBeUndefined();
    expect((slim as Record<string, unknown>).sha).toBeUndefined();
  });

  it("MERGE_REQUEST_SLIM_FIELDS exactly mirrors MergeRequestSlimShape keys", () => {
    expect([...MERGE_REQUEST_SLIM_FIELDS].sort()).toEqual(
      Object.keys(MergeRequestSlimShape).sort(),
    );
  });

  it("token budget: projected fixture is materially smaller than the full payload", () => {
    const fullBytes = Buffer.byteLength(JSON.stringify(getMergeRequestFixture), "utf8");
    const slim = projectField(
      getMergeRequestFixture as Record<string, unknown>,
      MERGE_REQUEST_SLIM_FIELDS,
      undefined,
    );
    const slimBytes = Buffer.byteLength(JSON.stringify(slim), "utf8");
    // Slim must be at most 80% of full. Threshold deliberately loose for a
    // small fixture; spike on `list_projects` saw ~32 KB -> ~3 KB (~10%).
    // This regression test catches the case where slim defaults accidentally
    // grow to match (or exceed) the full payload.
    expect(slimBytes).toBeLessThanOrEqual(Math.floor(fullBytes * 0.8));
  });
});

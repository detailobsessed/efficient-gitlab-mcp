import { describe, expect, it } from "bun:test";
import {
  COMMIT_SLIM_FIELDS,
  CommitSlimShape,
  GitLabCommitListSchema,
  GitLabCommitSchema,
  GitLabCommitSlimSchema,
} from "../../src/schemas/commits.js";
import { projectField, projectFields } from "../../src/utils/projection.js";
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

describe("GitLabCommitSlimSchema (Phase 3 / DOT-558)", () => {
  const fixtureCommit = listCommitsFixture[0] as Record<string, unknown>;

  it("parses the fixture and types every slim field", () => {
    const result = GitLabCommitSlimSchema.safeParse(fixtureCommit);
    expect(result.success).toBe(true);
    if (result.success) {
      for (const k of Object.keys(CommitSlimShape)) {
        if (k in fixtureCommit) {
          expect(k in result.data).toBe(true);
        }
      }
    }
  });

  it("COMMIT_SLIM_FIELDS exactly mirrors CommitSlimShape keys", () => {
    expect([...COMMIT_SLIM_FIELDS].sort()).toEqual(Object.keys(CommitSlimShape).sort());
  });

  it("projectField with COMMIT_SLIM_FIELDS keeps only slim keys at runtime", () => {
    const slim = projectField(fixtureCommit, COMMIT_SLIM_FIELDS, undefined);
    const allowed = new Set<string>(COMMIT_SLIM_FIELDS);
    for (const k of Object.keys(slim)) {
      expect(allowed.has(k)).toBe(true);
    }
    // Bloat fields the fixture has but slim doesn't
    expect((slim as Record<string, unknown>).trailers).toBeUndefined();
    expect((slim as Record<string, unknown>).stats).toBeUndefined();
    expect((slim as Record<string, unknown>).last_pipeline).toBeUndefined();
    expect((slim as Record<string, unknown>).extended_trailers).toBeUndefined();
  });

  it("projectFields slims a list with the same allow-list", () => {
    const slim = projectFields(listCommitsFixture, COMMIT_SLIM_FIELDS, undefined);
    expect(slim).toHaveLength(1);
    const allowed = new Set<string>(COMMIT_SLIM_FIELDS);
    for (const k of Object.keys(slim[0])) {
      expect(allowed.has(k)).toBe(true);
    }
  });

  it("token budget: projected commit is materially smaller than the full payload", () => {
    const fullBytes = Buffer.byteLength(JSON.stringify(fixtureCommit), "utf8");
    const slim = projectField(fixtureCommit, COMMIT_SLIM_FIELDS, undefined);
    const slimBytes = Buffer.byteLength(JSON.stringify(slim), "utf8");
    expect(slimBytes).toBeLessThanOrEqual(Math.floor(fullBytes * 0.8));
  });
});

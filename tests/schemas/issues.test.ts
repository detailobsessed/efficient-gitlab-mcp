import { describe, expect, it } from "bun:test";
import {
  GitLabIssueListSchema,
  GitLabIssueSchema,
  GitLabIssueSlimSchema,
  ISSUE_SLIM_FIELDS,
  IssueSlimShape,
} from "../../src/schemas/issues.js";
import { projectField } from "../../src/utils/projection.js";
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

describe("GitLabIssueSlimSchema (Phase 3 / DOT-558)", () => {
  it("parses the fixture and types every slim field", () => {
    const result = GitLabIssueSlimSchema.safeParse(getIssueFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      for (const k of Object.keys(IssueSlimShape)) {
        if (k in (getIssueFixture as Record<string, unknown>)) {
          expect(k in result.data).toBe(true);
        }
      }
    }
  });

  it("ISSUE_SLIM_FIELDS exactly mirrors IssueSlimShape keys", () => {
    expect([...ISSUE_SLIM_FIELDS].sort()).toEqual(Object.keys(IssueSlimShape).sort());
  });

  it("projectField with ISSUE_SLIM_FIELDS keeps only slim keys at runtime", () => {
    const slim = projectField(
      getIssueFixture as Record<string, unknown>,
      ISSUE_SLIM_FIELDS,
      undefined,
    );
    const allowed = new Set<string>(ISSUE_SLIM_FIELDS);
    for (const k of Object.keys(slim)) {
      expect(allowed.has(k)).toBe(true);
    }
    expect((slim as Record<string, unknown>).description).toBeUndefined();
    expect((slim as Record<string, unknown>).user_notes_count).toBeUndefined();
    expect((slim as Record<string, unknown>).project_id).toBeUndefined();
  });

  it("token budget: projected issue is materially smaller than the full payload", () => {
    const fullBytes = Buffer.byteLength(JSON.stringify(getIssueFixture), "utf8");
    const slim = projectField(
      getIssueFixture as Record<string, unknown>,
      ISSUE_SLIM_FIELDS,
      undefined,
    );
    const slimBytes = Buffer.byteLength(JSON.stringify(slim), "utf8");
    expect(slimBytes).toBeLessThanOrEqual(Math.floor(fullBytes * 0.8));
  });
});

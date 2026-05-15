import { describe, expect, it } from "bun:test";
import {
  GitLabProjectListSchema,
  GitLabProjectSchema,
  GitLabProjectSlimSchema,
  PROJECT_SLIM_FIELDS,
  ProjectSlimShape,
} from "../../src/schemas/projects.js";
import { projectField } from "../../src/utils/projection.js";
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

describe("GitLabProjectSlimSchema (Phase 3 / DOT-558)", () => {
  const fixtureProject = listProjectsFixture[0] as Record<string, unknown>;

  it("parses the fixture and types every slim field", () => {
    const result = GitLabProjectSlimSchema.safeParse(fixtureProject);
    expect(result.success).toBe(true);
    if (result.success) {
      for (const k of Object.keys(ProjectSlimShape)) {
        if (k in fixtureProject) {
          expect(k in result.data).toBe(true);
        }
      }
    }
  });

  it("PROJECT_SLIM_FIELDS exactly mirrors ProjectSlimShape keys", () => {
    expect([...PROJECT_SLIM_FIELDS].sort()).toEqual(Object.keys(ProjectSlimShape).sort());
  });

  it("projectField with PROJECT_SLIM_FIELDS keeps only slim keys at runtime", () => {
    const slim = projectField(fixtureProject, PROJECT_SLIM_FIELDS, undefined);
    const allowed = new Set<string>(PROJECT_SLIM_FIELDS);
    for (const k of Object.keys(slim)) {
      expect(allowed.has(k)).toBe(true);
    }
    // Bloat fields the fixture has but slim doesn't
    expect((slim as Record<string, unknown>).shared_runners_enabled).toBeUndefined();
    expect((slim as Record<string, unknown>).owner).toBeUndefined();
    expect((slim as Record<string, unknown>).namespace).toBeUndefined();
    expect((slim as Record<string, unknown>).runners_token).toBeUndefined();
  });

  it("PROJECT_SLIM_FIELDS does NOT include runners_token (privacy guardrail)", () => {
    // runners_token is gated by `include_secrets`; the slim default must never
    // expose it unless the caller opts in via `fields: "all"` or includes it
    // explicitly in `fields: [...]`.
    expect(PROJECT_SLIM_FIELDS).not.toContain("runners_token");
  });

  it("token budget: projected project is materially smaller than the full payload", () => {
    const fullBytes = Buffer.byteLength(JSON.stringify(fixtureProject), "utf8");
    const slim = projectField(fixtureProject, PROJECT_SLIM_FIELDS, undefined);
    const slimBytes = Buffer.byteLength(JSON.stringify(slim), "utf8");
    expect(slimBytes).toBeLessThanOrEqual(Math.floor(fullBytes * 0.8));
  });
});

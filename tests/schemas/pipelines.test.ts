import { describe, expect, it } from "bun:test";
import {
  GitLabPipelineListSchema,
  GitLabPipelineSchema,
  GitLabPipelineSlimSchema,
  PIPELINE_SLIM_FIELDS,
  PipelineSlimShape,
} from "../../src/schemas/pipelines.js";
import { projectField } from "../../src/utils/projection.js";
import listPipelinesFixture from "../fixtures/pipelines/list_pipelines.json";

describe("GitLabPipelineSchema", () => {
  it("parses a real-shape list_pipelines response", () => {
    const result = GitLabPipelineListSchema.safeParse(listPipelinesFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe("success");
      expect(result.data[0].user?.username).toBe("alice");
    }
  });

  it("rejects malformed input (missing required fields)", () => {
    const result = GitLabPipelineSchema.safeParse({ status: "success" });
    expect(result.success).toBe(false);
  });
});

describe("GitLabPipelineSlimSchema (Phase 3 / DOT-558)", () => {
  const fixturePipeline = listPipelinesFixture[0] as Record<string, unknown>;

  it("parses the fixture and types every slim field", () => {
    const result = GitLabPipelineSlimSchema.safeParse(fixturePipeline);
    expect(result.success).toBe(true);
    if (result.success) {
      for (const k of Object.keys(PipelineSlimShape)) {
        if (k in fixturePipeline) {
          expect(k in result.data).toBe(true);
        }
      }
    }
  });

  it("PIPELINE_SLIM_FIELDS exactly mirrors PipelineSlimShape keys", () => {
    expect([...PIPELINE_SLIM_FIELDS].sort()).toEqual(Object.keys(PipelineSlimShape).sort());
  });

  it("projectField with PIPELINE_SLIM_FIELDS keeps only slim keys at runtime", () => {
    const slim = projectField(fixturePipeline, PIPELINE_SLIM_FIELDS, undefined);
    const allowed = new Set<string>(PIPELINE_SLIM_FIELDS);
    for (const k of Object.keys(slim)) {
      expect(allowed.has(k)).toBe(true);
    }
    // Bloat fields the fixture has but slim doesn't
    expect((slim as Record<string, unknown>).user).toBeUndefined();
    expect((slim as Record<string, unknown>).duration).toBeUndefined();
    expect((slim as Record<string, unknown>).started_at).toBeUndefined();
    expect((slim as Record<string, unknown>).finished_at).toBeUndefined();
  });

  it("token budget: projected pipeline is materially smaller than the full payload", () => {
    const fullBytes = Buffer.byteLength(JSON.stringify(fixturePipeline), "utf8");
    const slim = projectField(fixturePipeline, PIPELINE_SLIM_FIELDS, undefined);
    const slimBytes = Buffer.byteLength(JSON.stringify(slim), "utf8");
    expect(slimBytes).toBeLessThanOrEqual(Math.floor(fullBytes * 0.8));
  });
});

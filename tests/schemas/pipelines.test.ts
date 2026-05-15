import { describe, expect, it } from "bun:test";
import { GitLabPipelineListSchema, GitLabPipelineSchema } from "../../src/schemas/pipelines.js";
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

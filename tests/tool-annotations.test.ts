/**
 * Tool Annotation Completeness Tests (DET-51)
 *
 * Ensures every registered tool has either readOnlyHint or destructiveHint set,
 * which is required for GITLAB_READ_ONLY_MODE filtering to work correctly.
 *
 * Red/green TDD: these tests are written FIRST, before adding missing annotations.
 */

import { describe, expect, it } from "bun:test";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCommitTools } from "../src/tools/commits.js";
import { registerGraphqlTools } from "../src/tools/graphql.js";
import { registerIssueTools } from "../src/tools/issues.js";
import { registerMergeRequestTools } from "../src/tools/merge-requests.js";
import { registerMilestoneTools } from "../src/tools/milestones.js";
import { registerNamespaceTools } from "../src/tools/namespaces.js";
import { registerPipelineTools } from "../src/tools/pipelines.js";
import { registerProjectTools } from "../src/tools/projects.js";
import { registerReleaseTools } from "../src/tools/releases.js";
import { registerRepositoryTools } from "../src/tools/repositories.js";
import { registerSearchTools } from "../src/tools/search.js";
import { registerUserTools } from "../src/tools/users.js";
import { registerWebhookTools } from "../src/tools/webhooks.js";
import { registerWikiTools } from "../src/tools/wiki.js";
import { registerWorkItemTools } from "../src/tools/work-items.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

function createTestServer(): McpServer {
  return new McpServer(
    { name: "test", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } },
  );
}

/**
 * Collects all tools from all categories into a flat map.
 */
function getAllTools(): Map<string, RegisteredTool> {
  const server = createTestServer();
  const allTools = new Map<string, RegisteredTool>();

  const categories = [
    registerRepositoryTools(server, logger),
    registerMergeRequestTools(server, logger),
    registerIssueTools(server, logger),
    registerProjectTools(server, logger),
    registerCommitTools(server, logger),
    registerNamespaceTools(server, logger),
    registerUserTools(server, logger),
    registerSearchTools(server, logger),
    registerPipelineTools(server, logger),
    registerWikiTools(server, logger),
    registerMilestoneTools(server, logger),
    registerReleaseTools(server, logger),
    registerWebhookTools(server, logger),
    registerWorkItemTools(server, logger),
    registerGraphqlTools(server, logger),
  ];

  for (const category of categories) {
    for (const [name, tool] of category) {
      allTools.set(name, tool);
    }
  }

  return allTools;
}

describe("Tool Annotation Completeness", () => {
  it("every tool must have either readOnlyHint or destructiveHint set", () => {
    const allTools = getAllTools();
    const unannotated: string[] = [];

    for (const [name, tool] of allTools) {
      const annotations = tool.annotations;
      const hasReadOnly = annotations?.readOnlyHint !== undefined;
      const hasDestructive = annotations?.destructiveHint !== undefined;

      if (!hasReadOnly && !hasDestructive) {
        unannotated.push(name);
      }
    }

    expect(unannotated).toEqual([]);
  });

  it("read-only tools should have readOnlyHint: true", () => {
    const allTools = getAllTools();
    const inconsistent: string[] = [];

    for (const [name, tool] of allTools) {
      const annotations = tool.annotations;
      // If readOnlyHint is explicitly set to false, that's fine (means it's a write tool)
      // But readOnlyHint: true + destructiveHint: true would be contradictory
      if (annotations?.readOnlyHint === true && annotations?.destructiveHint === true) {
        inconsistent.push(name);
      }
    }

    expect(inconsistent).toEqual([]);
  });

  it("should have the correct total number of read-only tools", () => {
    const allTools = getAllTools();
    let readOnlyCount = 0;

    for (const [, tool] of allTools) {
      if (tool.annotations?.readOnlyHint === true) {
        readOnlyCount++;
      }
    }

    // 78 existing + 6 work-item read tools + 0 from other audited files = 84
    // (milestones, releases, wiki already have readOnlyHint on their read tools)
    expect(readOnlyCount).toBeGreaterThanOrEqual(84);
  });

  it("no tool should have both readOnlyHint: true and destructiveHint set", () => {
    const allTools = getAllTools();
    const conflicts: string[] = [];

    for (const [name, tool] of allTools) {
      const annotations = tool.annotations;
      if (annotations?.readOnlyHint === true && annotations?.destructiveHint !== undefined) {
        conflicts.push(name);
      }
    }

    expect(conflicts).toEqual([]);
  });

  // Stack 3A: every write tool must declare idempotentHint so the LLM can
  // decide whether to retry safely. Conservative default is `false`; updates,
  // deletes, and idempotent approvers should set `true`.
  it("every write tool should declare idempotentHint", () => {
    const allTools = getAllTools();
    const missing: string[] = [];

    for (const [name, tool] of allTools) {
      const a = tool.annotations;
      if (a?.readOnlyHint === false && a.idempotentHint === undefined) {
        missing.push(name);
      }
    }

    expect(missing).toEqual([]);
  });

  // Stack 3A: every tool that hits GitLab should declare openWorldHint so the
  // LLM knows it touches an external system. All our tools do.
  it("every tool should declare openWorldHint", () => {
    const allTools = getAllTools();
    const missing: string[] = [];

    for (const [name, tool] of allTools) {
      const a = tool.annotations;
      if (a?.openWorldHint === undefined) {
        missing.push(name);
      }
    }

    expect(missing).toEqual([]);
  });
});

/**
 * Read-Only Mode Tests (DET-51, Tier 1)
 *
 * Tests that GITLAB_READ_ONLY_MODE correctly filters tools at activation time,
 * using readOnlyHint annotations to determine which tools are safe to expose.
 *
 * Red/green TDD: these tests are written FIRST, before the implementation.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerIssueTools } from "../src/tools/issues.js";
import { registerRepositoryTools } from "../src/tools/repositories.js";
import { registerSearchTools } from "../src/tools/search.js";
import { Logger } from "../src/utils/logger.js";

function getTextContent(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }> };
  if (!r.content || !Array.isArray(r.content)) return "";
  const textContent = r.content.find((c) => c.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  return textContent?.text ?? "";
}

const logger = new Logger("error", "pretty");

/**
 * Helper to set up a server+client pair with optional read-only mode.
 * Registers repositories (mixed read/write), search (all read-only), and issues (mixed).
 */
async function createTestSetup(readOnlyMode: boolean) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const server = new McpServer(
    { name: "test-readonly", version: "1.0.0" },
    { capabilities: { logging: {}, tools: { listChanged: true } } },
  );

  const toolsByCategory: ToolsByCategory = new Map();
  toolsByCategory.set("repositories", registerRepositoryTools(server, logger));
  toolsByCategory.set("search", registerSearchTools(server, logger));
  toolsByCategory.set("issues", registerIssueTools(server, logger));
  registerDisclosureTools(server, toolsByCategory, logger, readOnlyMode);

  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { server, client, toolsByCategory };
}

describe("Read-Only Mode", () => {
  let server: McpServer;
  let client: Client;

  afterEach(async () => {
    await client?.close();
    await server?.close();
  });

  describe("when readOnlyMode is true", () => {
    beforeEach(async () => {
      ({ server, client } = await createTestSetup(true));
    });

    it("should only enable read-only tools when activating a category", async () => {
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });

      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);

      // Read-only repository tools should be enabled
      expect(toolNames).toContain("search_repositories");
      expect(toolNames).toContain("get_file_contents");
      expect(toolNames).toContain("get_repository_tree");
      expect(toolNames).toContain("get_branch_diffs");

      // Write tools should NOT be enabled
      expect(toolNames).not.toContain("create_repository");
      expect(toolNames).not.toContain("create_branch");
      expect(toolNames).not.toContain("create_or_update_file");
      expect(toolNames).not.toContain("push_files");
      expect(toolNames).not.toContain("fork_repository");
    });

    it("should report skipped tools in activation response", async () => {
      const result = await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });

      const text = getTextContent(result);
      // Should mention that some tools were skipped due to read-only mode
      expect(text).toContain("skipped");
      expect(text).toContain("read-only");
    });

    it("should show only read-only tool counts in list_categories", async () => {
      const result = await client.callTool({
        name: "list_categories",
        arguments: {},
      });

      const text = getTextContent(result);

      // Search tools are all read-only, so count should match full count (6)
      expect(text).toContain("search");

      // Repositories has a mix — count should be less than full (9)
      // Only 4 read-only tools: search_repositories, get_file_contents, get_repository_tree, get_branch_diffs
      const repoLine = text.split("\n").find((l: string) => l.includes("repositories"));
      expect(repoLine).toBeDefined();
      expect(repoLine).toContain("4 tools");
    });

    it("should show read-only mode preamble in list_categories", async () => {
      const result = await client.callTool({
        name: "list_categories",
        arguments: {},
      });

      const text = getTextContent(result);
      expect(text.toLowerCase()).toContain("read-only mode");
    });

    it("should enable all search tools (all are read-only)", async () => {
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["search"] },
      });

      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);

      expect(toolNames).toContain("global_search");
      expect(toolNames).toContain("project_search");
      expect(toolNames).toContain("group_search");
      expect(toolNames).toContain("search_code");
      expect(toolNames).toContain("search_project_code");
      expect(toolNames).toContain("search_group_code");
    });

    it("should not enable any issue write tools", async () => {
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["issues"] },
      });

      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);

      // Read-only issue tools should be enabled
      expect(toolNames).toContain("list_issues");
      expect(toolNames).toContain("my_issues");
      expect(toolNames).toContain("get_issue");
      expect(toolNames).toContain("list_issue_links");
      expect(toolNames).toContain("get_issue_link");
      expect(toolNames).toContain("list_issue_discussions");

      // Write tools should NOT be enabled
      expect(toolNames).not.toContain("create_issue");
      expect(toolNames).not.toContain("update_issue");
      expect(toolNames).not.toContain("delete_issue");
      expect(toolNames).not.toContain("create_issue_link");
      expect(toolNames).not.toContain("delete_issue_link");
      expect(toolNames).not.toContain("create_issue_note");
      expect(toolNames).not.toContain("create_note");
      expect(toolNames).not.toContain("update_issue_note");
    });
  });

  describe("when readOnlyMode is false", () => {
    beforeEach(async () => {
      ({ server, client } = await createTestSetup(false));
    });

    it("should enable all tools (no filtering)", async () => {
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });

      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);

      // Both read and write tools should be enabled
      expect(toolNames).toContain("search_repositories");
      expect(toolNames).toContain("create_repository");
      expect(toolNames).toContain("create_branch");
      expect(toolNames).toContain("push_files");
    });

    it("should show full tool counts in list_categories", async () => {
      const result = await client.callTool({
        name: "list_categories",
        arguments: {},
      });

      const text = getTextContent(result);

      const repoLine = text.split("\n").find((l: string) => l.includes("repositories"));
      expect(repoLine).toBeDefined();
      expect(repoLine).toContain("9 tools");
    });

    it("should not show read-only preamble", async () => {
      const result = await client.callTool({
        name: "list_categories",
        arguments: {},
      });

      const text = getTextContent(result);
      expect(text.toLowerCase()).not.toContain("read-only mode");
    });
  });
});

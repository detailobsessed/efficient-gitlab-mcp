/**
 * MCP Server Integration Tests
 *
 * Tests the SDK-native progressive disclosure flow:
 * - On connect: only list_categories and activate_tools visible
 * - After activation: category tools appear via tools/list_changed
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
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

describe("MCP Server Integration", () => {
  let client: Client;
  let server: McpServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    server = new McpServer(
      { name: "test-gitlab-mcp", version: "1.0.0" },
      { capabilities: { logging: {}, tools: { listChanged: true } } },
    );

    // Register tools (disabled) and disclosure meta-tools
    const toolsByCategory: ToolsByCategory = new Map();
    toolsByCategory.set("repositories", registerRepositoryTools(server, logger));
    toolsByCategory.set("search", registerSearchTools(server, logger));
    registerDisclosureTools(server, toolsByCategory, logger);

    client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  describe("Server Initialization", () => {
    it("should report server info", async () => {
      const serverInfo = client.getServerVersion();
      expect(serverInfo?.name).toBe("test-gitlab-mcp");
    });

    it("should report tools.listChanged capability", async () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities?.tools?.listChanged).toBe(true);
    });
  });

  describe("Progressive Disclosure", () => {
    it("should only show meta-tools on startup", async () => {
      const result = await client.listTools();
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("list_categories");
      expect(toolNames).toContain("activate_tools");
      expect(toolNames.length).toBe(2);
    });

    it("should list categories with tool counts", async () => {
      const result = await client.callTool({
        name: "list_categories",
        arguments: {},
      });

      const text = getTextContent(result);
      expect(text).toContain("repositories");
      expect(text).toContain("search");
    });

    it("should activate a category and expose its tools", async () => {
      // Activate repositories
      const activateResult = await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });

      const text = getTextContent(activateResult);
      expect(text).toContain("search_repositories");
      expect(text).toContain("get_file_contents");

      // Now tools/list should include repository tools
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).toContain("list_categories");
      expect(toolNames).toContain("activate_tools");
      expect(toolNames).toContain("search_repositories");
      expect(toolNames).toContain("get_file_contents");
      expect(toolNames).toContain("create_branch");
      // Search tools should still be hidden
      expect(toolNames).not.toContain("global_search");
    });

    it("should activate multiple categories at once", async () => {
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories", "search"] },
      });

      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).toContain("search_repositories");
      expect(toolNames).toContain("global_search");
    });

    it("should be idempotent", async () => {
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });

      const result = await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });

      const text = getTextContent(result);
      expect(text).toContain("already active");
    });

    it("should handle unknown categories", async () => {
      const result = await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["nonexistent"] },
      });

      const text = getTextContent(result);
      expect(text).toContain("Unknown categories");
      expect(text).toContain("nonexistent");
    });

    it("should show enabled count in categories after activation", async () => {
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });

      const result = await client.callTool({
        name: "list_categories",
        arguments: {},
      });

      const text = getTextContent(result);
      expect(text).toContain("active");
    });
  });

  describe("MCP Protocol Logging", () => {
    it("should report logging capability", async () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities?.logging).toBeDefined();
    });
  });
});

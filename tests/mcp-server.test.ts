/**
 * MCP Server Integration Tests
 *
 * Tests the SDK-native progressive disclosure flow:
 * - On connect: only list_categories and activate_tools visible
 * - After activation: category tools appear via tools/list_changed
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { SERVER_CAPABILITIES } from "../src/server/index.js";
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

    // Regression guard: assert the constant the production createMcpServer
    // uses, not just the test's own server setup. If someone removes
    // listChanged from src/server/index.ts SERVER_CAPABILITIES, our spike
    // testing showed Claude Code (and any spec-compliant MCP client) will
    // silently drop tools/list_changed notifications and progressive
    // disclosure becomes unreachable from the LLM side.
    it("production SERVER_CAPABILITIES declares tools.listChanged", () => {
      expect(SERVER_CAPABILITIES.tools?.listChanged).toBe(true);
    });
  });

  describe("Progressive Disclosure", () => {
    it("should only show meta-tools on startup", async () => {
      const result = await client.listTools();
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("list_categories");
      expect(toolNames).toContain("activate_tools");
      expect(toolNames).toContain("deactivate_tools");
      expect(toolNames.length).toBe(3);
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

    it("should handle sequential activations without disconnect", async () => {
      // Mirrors DET-58 reproduction: activate categories one at a time
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });

      const tools1 = await client.listTools();
      expect(tools1.tools.map((t) => t.name)).toContain("search_repositories");

      // Second activation while first category is already active
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["search"] },
      });

      const tools2 = await client.listTools();
      const names2 = tools2.tools.map((t) => t.name);
      expect(names2).toContain("search_repositories");
      expect(names2).toContain("global_search");

      // Re-activate already-active category (idempotent, no notification sent)
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });

      const tools3 = await client.listTools();
      const names3 = tools3.tools.map((t) => t.name);
      expect(names3).toContain("search_repositories");
      expect(names3).toContain("global_search");
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

  describe("deactivate_tools", () => {
    it("removes tools from the active set after activation", async () => {
      // Activate first so there's something to deactivate.
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });
      const beforeNames = (await client.listTools()).tools.map((t) => t.name);
      expect(beforeNames).toContain("search_repositories");

      const result = await client.callTool({
        name: "deactivate_tools",
        arguments: { categories: ["repositories"] },
      });
      const text = getTextContent(result);
      expect(text).toContain("search_repositories");

      const afterNames = (await client.listTools()).tools.map((t) => t.name);
      expect(afterNames).not.toContain("search_repositories");
      // Meta-tools always remain
      expect(afterNames).toContain("list_categories");
      expect(afterNames).toContain("activate_tools");
      expect(afterNames).toContain("deactivate_tools");
    });

    it("supports multi-category deactivation in a single call", async () => {
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories", "search"] },
      });
      await client.callTool({
        name: "deactivate_tools",
        arguments: { categories: ["repositories", "search"] },
      });

      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).not.toContain("search_repositories");
      expect(names).not.toContain("global_search");
    });

    it("reports gracefully when nothing is active in the requested categories", async () => {
      const result = await client.callTool({
        name: "deactivate_tools",
        arguments: { categories: ["repositories"] },
      });

      const text = getTextContent(result);
      // Whether the message says "no tools were active" verbatim or just
      // doesn't list any disabled, the call must not error.
      expect(text).not.toContain("Error");
    });

    it("handles unknown categories with a clear hint", async () => {
      const result = await client.callTool({
        name: "deactivate_tools",
        arguments: { categories: ["nonexistent"] },
      });
      const text = getTextContent(result);
      expect(text).toContain("Unknown categories");
      expect(text).toContain("nonexistent");
    });

    it("fires sendToolListChanged exactly once per deactivation that disabled ≥1 tool", async () => {
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });
      const spy = spyOn(server, "sendToolListChanged");
      await client.callTool({
        name: "deactivate_tools",
        arguments: { categories: ["repositories"] },
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("does not fire sendToolListChanged when nothing was disabled", async () => {
      const spy = spyOn(server, "sendToolListChanged");
      // Categories that aren't active — nothing to disable
      await client.callTool({
        name: "deactivate_tools",
        arguments: { categories: ["repositories"] },
      });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("tools/list_changed Notifications (regression)", () => {
    // The disclosure layer must call sendToolListChanged() exactly once per
    // activation that enables ≥1 new tool, and not at all when no new tools
    // are enabled. Both halves matter: missing it → clients never see the
    // new tools (the upstream bug); over-firing it → notification storms /
    // unnecessary client refreshes (we previously fixed DET-58 around this).
    //
    // We spy on the McpServer instance the test already creates. Since the
    // spy replaces the method, we also need to ensure the disclosure code
    // reaches sendToolListChanged via the exact same instance, which it
    // does (registerDisclosureTools captures the McpServer reference at
    // registration time and calls sendToolListChanged on it).

    it("calls sendToolListChanged exactly once per single-category activation", async () => {
      const spy = spyOn(server, "sendToolListChanged");
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("batches one sendToolListChanged across multi-category activation", async () => {
      const spy = spyOn(server, "sendToolListChanged");
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories", "search"] },
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("does not call sendToolListChanged when re-activating an already-active category", async () => {
      // First activation enables tools and fires the notification once.
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });
      // Spy AFTER the first activation so we only count the idempotent call.
      const spy = spyOn(server, "sendToolListChanged");
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["repositories"] },
      });
      expect(spy).not.toHaveBeenCalled();
    });

    it("does not call sendToolListChanged when only unknown categories are passed", async () => {
      const spy = spyOn(server, "sendToolListChanged");
      await client.callTool({
        name: "activate_tools",
        arguments: { categories: ["nonexistent"] },
      });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("MCP Protocol Logging", () => {
    it("should report logging capability", async () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities?.logging).toBeDefined();
    });
  });
});

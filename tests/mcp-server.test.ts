/**
 * MCP Server Integration Tests
 *
 * Tests the full MCP server flow using InMemoryTransport from the SDK.
 * This tests the actual MCP protocol communication, not just our registry logic.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { createRegistryAdapter, registerMetaTools, ToolRegistry } from "../src/registry/index.js";
import { registerRepositoryTools } from "../src/tools/repositories.js";
import { registerSearchTools } from "../src/tools/search.js";
import { Logger } from "../src/utils/logger.js";

interface TextContent {
  type: "text";
  text: string;
}

// Helper to extract text content from tool results
// The SDK returns a union type, so we need to handle both cases
function getTextContent(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }> };
  if (!r.content || !Array.isArray(r.content)) {
    return "";
  }
  const textContent = r.content.find((c) => c.type === "text") as TextContent | undefined;
  return textContent?.text ?? "";
}

const logger = new Logger("error", "pretty");

describe("MCP Server Integration", () => {
  let client: Client;
  let server: McpServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    // Create linked transport pair for in-process testing
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Create and configure MCP server with logging capability
    server = new McpServer(
      {
        name: "test-gitlab-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          logging: {},
        },
      },
    );

    // Set up tool registry with a subset of tools for testing
    const registry = new ToolRegistry();
    registerRepositoryTools(createRegistryAdapter(registry, "repositories"), logger);
    registerSearchTools(createRegistryAdapter(registry, "search"), logger);

    // Register meta-tools
    registerMetaTools(server, registry, logger);

    // Create client
    client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    // Connect both ends
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  describe("Server Initialization", () => {
    it("should initialize and report server info", async () => {
      const serverInfo = client.getServerVersion();
      expect(serverInfo?.name).toBe("test-gitlab-mcp");
      expect(serverInfo?.version).toBe("1.0.0");
    });

    it("should report tools capability", async () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities?.tools).toBeDefined();
    });
  });

  describe("Tool Discovery", () => {
    it("should list available tools (meta-tools)", async () => {
      const result = await client.listTools();
      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBe(5); // 5 meta-tools

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("list_categories");
      expect(toolNames).toContain("list_tools");
      expect(toolNames).toContain("search_tools");
      expect(toolNames).toContain("get_tool_schema");
      expect(toolNames).toContain("execute_tool");
    });

    it("should have proper schema for list_categories", async () => {
      const result = await client.listTools();
      const listCategories = result.tools.find((t) => t.name === "list_categories");

      expect(listCategories).toBeDefined();
      expect(listCategories?.description).toContain("List all available GitLab tool categories");
    });

    it("should have proper schema for execute_tool", async () => {
      const result = await client.listTools();
      const executeTool = result.tools.find((t) => t.name === "execute_tool");

      expect(executeTool).toBeDefined();
      expect(executeTool?.description).toContain("Execute a GitLab tool by name");
      expect(executeTool?.inputSchema).toBeDefined();
    });
  });

  describe("Meta-tool: list_categories", () => {
    it("should return available categories", async () => {
      const result = await client.callTool({
        name: "list_categories",
        arguments: {},
      });

      const text = getTextContent(result);
      expect(text).toContain("repositories");
      expect(text).toContain("search");
    });
  });

  describe("Meta-tool: list_tools", () => {
    it("should list tools in repositories category", async () => {
      const result = await client.callTool({
        name: "list_tools",
        arguments: { category: "repositories" },
      });

      const text = getTextContent(result);
      expect(text).toContain("search_repositories");
      expect(text).toContain("get_file_contents");
    });

    it("should return error for unknown category", async () => {
      const result = await client.callTool({
        name: "list_tools",
        arguments: { category: "nonexistent" },
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain("not found");
    });
  });

  describe("Meta-tool: search_tools", () => {
    it("should find tools by keyword", async () => {
      const result = await client.callTool({
        name: "search_tools",
        arguments: { query: "merge" },
      });

      const text = getTextContent(result);
      expect(text.toLowerCase()).toContain("merge");
    });

    it("should respect limit parameter", async () => {
      const result = await client.callTool({
        name: "search_tools",
        arguments: { query: "file", limit: 2 },
      });

      const text = getTextContent(result);
      expect(text).toBeDefined();
    });

    it("should handle no results gracefully", async () => {
      const result = await client.callTool({
        name: "search_tools",
        arguments: { query: "xyznonexistent123" },
      });

      const text = getTextContent(result);
      expect(text).toContain("No tools found");
    });
  });

  describe("Meta-tool: get_tool_schema", () => {
    it("should return schema for valid tool", async () => {
      const result = await client.callTool({
        name: "get_tool_schema",
        arguments: { toolName: "search_repositories" },
      });

      const text = getTextContent(result);
      expect(text).toContain("Search Repositories");
      expect(text).toContain("Input Parameters");
    });

    it("should return error for unknown tool", async () => {
      const result = await client.callTool({
        name: "get_tool_schema",
        arguments: { toolName: "nonexistent_tool" },
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain("not found");
    });
  });

  describe("Meta-tool: execute_tool", () => {
    it("should return error for unknown tool", async () => {
      const result = await client.callTool({
        name: "execute_tool",
        arguments: {
          toolName: "nonexistent_tool",
          params: {},
        },
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain("not found");
    });

    // Note: We don't test actual GitLab API calls here since that would require
    // mocking the GitLab client. Those are covered in the tool-specific tests.
  });

  describe("MCP Protocol Logging", () => {
    it("should report logging capability", async () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities?.logging).toBeDefined();
    });

    it("should receive log messages from server", async () => {
      const receivedLogs: Array<{ level: string; data: unknown }> = [];

      // Set up notification handler for logging messages
      client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
        receivedLogs.push({
          level: notification.params.level,
          data: notification.params.data,
        });
      });

      // Send a log message from the server
      await server.server.sendLoggingMessage({
        level: "info",
        logger: "test",
        data: "Test log message from server",
      });

      // Give time for the notification to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedLogs.length).toBeGreaterThan(0);
      expect(receivedLogs[0].level).toBe("info");
      expect(receivedLogs[0].data).toBe("Test log message from server");
    });

    it("should receive structured log data", async () => {
      const receivedLogs: Array<{ level: string; data: unknown }> = [];

      client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
        receivedLogs.push({
          level: notification.params.level,
          data: notification.params.data,
        });
      });

      // Send structured log data
      await server.server.sendLoggingMessage({
        level: "debug",
        logger: "gitlab-mcp",
        data: { message: "Tool executed", toolName: "list_categories", duration: 42 },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedLogs.length).toBeGreaterThan(0);
      const logData = receivedLogs[0].data as Record<string, unknown>;
      expect(logData.message).toBe("Tool executed");
      expect(logData.toolName).toBe("list_categories");
      expect(logData.duration).toBe(42);
    });
  });
});

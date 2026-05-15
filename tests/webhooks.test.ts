import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerWebhookTools } from "../src/tools/webhooks.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Webhook Tools Handlers", () => {
  const originalFetch = globalThis.fetch;
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: { listChanged: true } } },
    );

    const toolsByCategory: ToolsByCategory = new Map();
    const webhookTools = registerWebhookTools(server, logger);
    for (const tool of webhookTools.values()) tool.enable();
    toolsByCategory.set("webhooks", webhookTools);
    registerDisclosureTools(server, toolsByCategory, logger);

    client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await client.close();
    await server.close();
  });

  describe("list_webhooks", () => {
    it("should GET project hooks", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockWebhooks = [
        { id: 1, url: "https://example.com/hook1", push_events: true },
        { id: 2, url: "https://example.com/hook2", push_events: false },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockWebhooks)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_webhooks",
        arguments: {
          project_id: "my-group/my-project",
          page: 1,
          per_page: 20,
        },
      });

      expect(capturedUrl).toBe(
        "https://gitlab.com/api/v4/projects/my-group%2Fmy-project/hooks?page=1&per_page=20",
      );
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].url).toBe("https://example.com/hook1");
    });
  });

  describe("list_webhook_events", () => {
    it("should GET hook events for a specific webhook", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockEvents = [
        {
          id: 100,
          url: "https://example.com/hook1",
          trigger: "push_events",
          response_status: 200,
          execution_duration: 0.5,
        },
        {
          id: 101,
          url: "https://example.com/hook1",
          trigger: "merge_request_events",
          response_status: 200,
          execution_duration: 0.3,
        },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockEvents)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_webhook_events",
        arguments: {
          project_id: "my-group/my-project",
          hook_id: 1,
          page: 1,
          per_page: 10,
        },
      });

      expect(capturedUrl).toBe(
        "https://gitlab.com/api/v4/projects/my-group%2Fmy-project/hooks/1/events?page=1&per_page=10",
      );
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].trigger).toBe("push_events");
    });
  });
});

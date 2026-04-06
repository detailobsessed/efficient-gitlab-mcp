import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerRepositoryTools } from "../src/tools/repositories.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Repository Tools Handlers", () => {
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
    const repoTools = registerRepositoryTools(server, logger);
    // Enable for testing
    for (const tool of repoTools.values()) tool.enable();
    toolsByCategory.set("repositories", repoTools);
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

  describe("create_or_update_file", () => {
    it("should use POST when file does not exist", async () => {
      let requestMethod: string | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        if (options?.method === "GET" || !options?.method) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: "Not Found",
            text: () => Promise.resolve("File not found"),
          } as Response);
        }

        requestMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve('{"file_path": "test.txt", "branch": "main"}'),
        } as Response);
      });

      await client.callTool({
        name: "create_or_update_file",
        arguments: {
          project_id: "my-group/my-project",
          file_path: "test.txt",
          branch: "main",
          content: "Hello World",
          commit_message: "Add test file",
        },
      });

      expect(requestMethod).toBe("POST");
    });

    it("should use PUT when file already exists", async () => {
      let requestMethod: string | undefined;
      let callCount = 0;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        callCount++;

        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('{"file_name": "test.txt", "content": "old content"}'),
          } as Response);
        }

        requestMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"file_path": "test.txt", "branch": "main"}'),
        } as Response);
      });

      await client.callTool({
        name: "create_or_update_file",
        arguments: {
          project_id: "my-group/my-project",
          file_path: "test.txt",
          branch: "main",
          content: "Updated content",
          commit_message: "Update test file",
        },
      });

      expect(requestMethod).toBe("PUT");
      expect(callCount).toBe(2);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerSearchTools } from "../src/tools/search.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Search Tools Handlers", () => {
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
    const searchTools = registerSearchTools(server, logger);
    for (const tool of searchTools.values()) tool.enable();
    toolsByCategory.set("search", searchTools);
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

  describe("global_search", () => {
    it("should GET /search with correct scope and search params", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;

      const mockResults = [
        { id: 1, title: "Login bug", state: "opened", web_url: "https://gitlab.com/issues/1" },
        { id: 2, title: "Login feature", state: "closed", web_url: "https://gitlab.com/issues/2" },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResults)),
        } as Response);
      });

      const result = await client.callTool({
        name: "global_search",
        arguments: {
          scope: "issues",
          search: "login",
          state: "opened",
          per_page: 10,
        },
      });

      expect(capturedUrl).toContain("/search");
      expect(capturedUrl).toContain("scope=issues");
      expect(capturedUrl).toContain("search=login");
      expect(capturedUrl).toContain("state=opened");
      expect(capturedUrl).toContain("per_page=10");
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].title).toBe("Login bug");
    });
  });

  describe("search_code", () => {
    it("should GET /search with scope=blobs and code search params", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;

      const mockResults = [
        {
          basename: "utils",
          data: "function handleLogin() { ... }",
          path: "src/utils/auth.ts",
          filename: "auth.ts",
          ref: "main",
          startline: 15,
          project_id: 42,
        },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResults)),
        } as Response);
      });

      const result = await client.callTool({
        name: "search_code",
        arguments: {
          search: "handleLogin",
          extension: "ts",
          per_page: 20,
        },
      });

      expect(capturedUrl).toContain("/search");
      expect(capturedUrl).toContain("scope=blobs");
      expect(capturedUrl).toContain("search=handleLogin");
      expect(capturedUrl).toContain("extension=ts");
      expect(capturedUrl).toContain("per_page=20");
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(1);
      expect(responseData[0].filename).toBe("auth.ts");
      expect(responseData[0].path).toBe("src/utils/auth.ts");
    });
  });
});

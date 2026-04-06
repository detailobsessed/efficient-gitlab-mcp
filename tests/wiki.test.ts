import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerWikiTools } from "../src/tools/wiki.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Wiki Tools Handlers", () => {
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
    const wikiTools = registerWikiTools(server, logger);
    for (const tool of wikiTools.values()) tool.enable();
    toolsByCategory.set("wiki", wikiTools);
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

  describe("create_wiki_page", () => {
    it("should POST to /projects/:id/wikis with correct body", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;
      let capturedBody: string | undefined;

      const mockWikiPage = {
        slug: "getting-started",
        title: "Getting Started",
        content: "# Getting Started\n\nWelcome to the project.",
        format: "markdown",
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        capturedBody = options?.body as string;
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve(JSON.stringify(mockWikiPage)),
        } as Response);
      });

      const result = await client.callTool({
        name: "create_wiki_page",
        arguments: {
          project_id: "my-group/my-project",
          title: "Getting Started",
          content: "# Getting Started\n\nWelcome to the project.",
          format: "markdown",
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/wikis");
      expect(capturedMethod).toBe("POST");

      const body = JSON.parse(capturedBody ?? "");
      expect(body.title).toBe("Getting Started");
      expect(body.content).toBe("# Getting Started\n\nWelcome to the project.");
      expect(body.format).toBe("markdown");
      // project_id should not be in the POST body
      expect(body.project_id).toBeUndefined();

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData.slug).toBe("getting-started");
      expect(responseData.title).toBe("Getting Started");
    });
  });

  describe("list_group_wiki_pages", () => {
    it("should GET /groups/:id/wikis with query params", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;

      const mockWikiPages = [
        { slug: "home", title: "Home", format: "markdown" },
        { slug: "setup", title: "Setup Guide", format: "markdown" },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockWikiPages)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_group_wiki_pages",
        arguments: {
          group_id: "my-org/platform",
          with_content: true,
          page: 1,
          per_page: 50,
        },
      });

      expect(capturedUrl).toContain("/groups/my-org%2Fplatform/wikis");
      expect(capturedUrl).toContain("with_content=true");
      expect(capturedUrl).toContain("page=1");
      expect(capturedUrl).toContain("per_page=50");
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].slug).toBe("home");
      expect(responseData[1].title).toBe("Setup Guide");
    });
  });
});

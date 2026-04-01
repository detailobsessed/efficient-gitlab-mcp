import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerCommitTools } from "../src/tools/commits.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Commit Tools Handlers", () => {
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
    const commitTools = registerCommitTools(server, logger);
    for (const tool of commitTools.values()) tool.enable();
    toolsByCategory.set("commits", commitTools);
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

  describe("list_commits", () => {
    it("should GET commits with ref_name query parameter", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockCommits = [
        { id: "abc123", short_id: "abc1", title: "Initial commit", message: "Initial commit" },
        { id: "def456", short_id: "def4", title: "Add feature", message: "Add feature" },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCommits)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_commits",
        arguments: {
          project_id: "my-group/my-project",
          ref_name: "main",
          page: 1,
          per_page: 20,
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/repository/commits");
      expect(capturedUrl).toContain("ref_name=main");
      expect(capturedUrl).toContain("page=1");
      expect(capturedUrl).toContain("per_page=20");
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].title).toBe("Initial commit");
    });
  });

  describe("get_commit", () => {
    it("should GET a specific commit by SHA", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockCommit = {
        id: "abc123def456789",
        short_id: "abc123d",
        title: "Fix bug in parser",
        message: "Fix bug in parser\n\nDetailed description here.",
        author_name: "Dev User",
        author_email: "dev@example.com",
        created_at: "2025-01-15T10:30:00Z",
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCommit)),
        } as Response);
      });

      const result = await client.callTool({
        name: "get_commit",
        arguments: {
          project_id: "my-group/my-project",
          sha: "abc123def456789",
        },
      });

      expect(capturedUrl).toContain(
        "/projects/my-group%2Fmy-project/repository/commits/abc123def456789",
      );
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData.id).toBe("abc123def456789");
      expect(responseData.title).toBe("Fix bug in parser");
      expect(responseData.author_name).toBe("Dev User");
    });
  });
});

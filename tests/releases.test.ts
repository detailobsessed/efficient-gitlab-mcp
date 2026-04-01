import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerReleaseTools } from "../src/tools/releases.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Release Tools Handlers", () => {
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
    const releaseTools = registerReleaseTools(server, logger);
    for (const tool of releaseTools.values()) tool.enable();
    toolsByCategory.set("releases", releaseTools);
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

  describe("list_releases", () => {
    it("should GET releases for a project", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockReleases = [
        { tag_name: "v1.0.0", name: "Release 1.0.0", description: "First release" },
        { tag_name: "v0.9.0", name: "Release 0.9.0", description: "Beta release" },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockReleases)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_releases",
        arguments: {
          project_id: "my-group/my-project",
          order_by: "released_at",
          sort: "desc",
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/releases");
      expect(capturedUrl).toContain("order_by=released_at");
      expect(capturedUrl).toContain("sort=desc");
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].tag_name).toBe("v1.0.0");
    });
  });

  describe("create_release", () => {
    it("should POST with tag_name, name, and description in body", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      let capturedBody = "";

      const mockRelease = {
        tag_name: "v2.0.0",
        name: "Release 2.0.0",
        description: "Major update",
        created_at: "2025-01-01T00:00:00Z",
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        capturedBody = typeof options?.body === "string" ? options.body : "";
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve(JSON.stringify(mockRelease)),
        } as Response);
      });

      const result = await client.callTool({
        name: "create_release",
        arguments: {
          project_id: "my-group/my-project",
          tag_name: "v2.0.0",
          name: "Release 2.0.0",
          description: "Major update",
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/releases");
      expect(capturedMethod).toBe("POST");

      const body = JSON.parse(capturedBody ?? "");
      expect(body.tag_name).toBe("v2.0.0");
      expect(body.name).toBe("Release 2.0.0");
      expect(body.description).toBe("Major update");
      expect(body.project_id).toBeUndefined();

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData.tag_name).toBe("v2.0.0");
      expect(responseData.name).toBe("Release 2.0.0");
    });
  });
});

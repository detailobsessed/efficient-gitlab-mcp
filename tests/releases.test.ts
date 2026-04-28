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

    it("applies field projection (DOT-516.5) by default", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify([
                {
                  tag_name: "v1.0.0",
                  name: "Release 1.0.0",
                  description: "First release",
                  released_at: "2026-04-01T00:00:00Z",
                  // Bloat that should be dropped:
                  description_html: "<p>First release</p>",
                  _links: { self: "..." },
                  evidences: [{ id: 1, sha: "abc" }],
                  assets: { count: 0, sources: [] },
                  milestones: [],
                },
              ]),
            ),
        } as Response),
      );

      const result = await client.callTool({
        name: "list_releases",
        arguments: { project_id: "p" },
      });
      const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
      expect(data[0].tag_name).toBe("v1.0.0");
      expect(data[0].description).toBe("First release");
      // Bloat dropped
      expect(data[0].description_html).toBeUndefined();
      expect(data[0]._links).toBeUndefined();
      expect(data[0].evidences).toBeUndefined();
      expect(data[0].assets).toBeUndefined();
    });
  });

  describe("download_release_asset", () => {
    const mockRelease = (assetUrl: string) => ({
      tag_name: "v1.0.0",
      assets: {
        links: [{ direct_asset_path: "/binaries/app.tar.gz", direct_asset_url: assetUrl }],
      },
    });

    it("should download an internal asset via rawFetch", async () => {
      const calls: string[] = [];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, _options?: RequestInit) => {
        calls.push(_url);
        // First call: GET release metadata
        if (_url.includes("/releases/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify(
                  mockRelease(
                    "https://gitlab.com/api/v4/projects/1/packages/generic/app/1.0/app.tar.gz",
                  ),
                ),
              ),
          } as Response);
        }
        // Second call: rawFetch for internal asset
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("binary-content-here"),
        } as Response);
      });

      const result = await client.callTool({
        name: "download_release_asset",
        arguments: {
          project_id: "my-group/my-project",
          tag_name: "v1.0.0",
          direct_asset_path: "/binaries/app.tar.gz",
        },
      });

      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toBe("binary-content-here");
      // Two fetches: release metadata + asset download
      expect(calls).toHaveLength(2);
      expect(calls[1]).toContain("gitlab.com");
    });

    it("should download an external asset via bare fetch", async () => {
      const calls: string[] = [];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, _options?: RequestInit) => {
        calls.push(_url);
        if (_url.includes("/releases/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify(mockRelease("https://cdn.example.com/assets/app.tar.gz")),
              ),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("external-content"),
        } as Response);
      });

      const result = await client.callTool({
        name: "download_release_asset",
        arguments: {
          project_id: "my-group/my-project",
          tag_name: "v1.0.0",
          direct_asset_path: "/binaries/app.tar.gz",
        },
      });

      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toBe("external-content");
      expect(calls[1]).toBe("https://cdn.example.com/assets/app.tar.gz");
    });

    it("should return error when external asset fetch fails", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string) => {
        if (_url.includes("/releases/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify(mockRelease("https://cdn.example.com/assets/app.tar.gz")),
              ),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: () => Promise.resolve(""),
        } as Response);
      });

      const result = await client.callTool({
        name: "download_release_asset",
        arguments: {
          project_id: "my-group/my-project",
          tag_name: "v1.0.0",
          direct_asset_path: "/binaries/app.tar.gz",
        },
      });

      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.error).toContain("Failed to fetch asset: 404 Not Found");
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

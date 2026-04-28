import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerProjectTools } from "../src/tools/projects.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

type TextContent = { type: "text"; text: string }[];

function mockJsonResponse(body: unknown) {
  // @ts-expect-error - mock doesn't need full fetch signature
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: new Headers(),
    } as Response),
  );
}

describe("Project Tools Handlers", () => {
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
    const projectTools = registerProjectTools(server, logger);
    for (const tool of projectTools.values()) tool.enable();
    toolsByCategory.set("projects", projectTools);
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

  describe("list_projects redacts runners_token", () => {
    it("strips runners_token from each project by default", async () => {
      mockJsonResponse([
        { id: 1, name: "Alpha", runners_token: "secret-alpha" },
        { id: 2, name: "Beta", runners_token: "secret-beta" },
      ]);

      const result = await client.callTool({
        name: "list_projects",
        arguments: {},
      });
      const text = (result.content as TextContent)[0].text;

      expect(text).not.toContain("runners_token");
      expect(text).not.toContain("secret-alpha");
      expect(text).not.toContain("secret-beta");
      // Non-secret fields preserved
      expect(text).toContain("Alpha");
      expect(text).toContain("Beta");
    });

    it("preserves runners_token when include_secrets is true", async () => {
      mockJsonResponse([{ id: 1, name: "Alpha", runners_token: "secret-alpha" }]);

      const result = await client.callTool({
        name: "list_projects",
        arguments: { include_secrets: true },
      });
      const text = (result.content as TextContent)[0].text;

      expect(text).toContain("runners_token");
      expect(text).toContain("secret-alpha");
    });

    it("handles projects without runners_token gracefully", async () => {
      mockJsonResponse([{ id: 1, name: "Alpha" }]);

      const result = await client.callTool({
        name: "list_projects",
        arguments: {},
      });
      const text = (result.content as TextContent)[0].text;

      expect(text).toContain("Alpha");
    });
  });

  describe("get_project redacts runners_token", () => {
    it("strips runners_token from a single project by default", async () => {
      mockJsonResponse({ id: 1, name: "Alpha", runners_token: "secret-alpha" });

      const result = await client.callTool({
        name: "get_project",
        arguments: { project_id: "1" },
      });
      const text = (result.content as TextContent)[0].text;

      expect(text).not.toContain("runners_token");
      expect(text).not.toContain("secret-alpha");
      expect(text).toContain("Alpha");
    });

    it("preserves runners_token when include_secrets is true", async () => {
      mockJsonResponse({ id: 1, name: "Alpha", runners_token: "secret-alpha" });

      const result = await client.callTool({
        name: "get_project",
        arguments: { project_id: "1", include_secrets: true },
      });
      const text = (result.content as TextContent)[0].text;

      expect(text).toContain("runners_token");
      expect(text).toContain("secret-alpha");
    });
  });

  describe("list_labels honors with_counts", () => {
    it("passes with_counts=true through to GitLab when set", async () => {
      let capturedUrl: string | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string, _options?: RequestInit) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              '[{"id": 1, "name": "bug", "open_issues_count": 3, "closed_issues_count": 1}]',
            ),
          headers: new Headers(),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_labels",
        arguments: { project_id: "1", with_counts: true },
      });

      expect(capturedUrl).toContain("with_counts=true");
      const text = (result.content as TextContent)[0].text;
      expect(text).toContain("open_issues_count");
    });

    it("omits with_counts from the outgoing query when not set", async () => {
      let capturedUrl: string | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string, _options?: RequestInit) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('[{"id": 1, "name": "bug"}]'),
          headers: new Headers(),
        } as Response);
      });

      await client.callTool({
        name: "list_labels",
        arguments: { project_id: "1" },
      });

      expect(capturedUrl).not.toContain("with_counts");
    });
  });

  describe("list_projects forwards topic filter", () => {
    it("passes topic=foo through to GitLab when set", async () => {
      let capturedUrl: string | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string, _options?: RequestInit) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
          headers: new Headers(),
        } as Response);
      });

      await client.callTool({
        name: "list_projects",
        arguments: { topic: "mkdocs" },
      });

      expect(capturedUrl).toContain("topic=mkdocs");
    });

    it("omits topic from the outgoing query when not set", async () => {
      let capturedUrl: string | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string, _options?: RequestInit) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
          headers: new Headers(),
        } as Response);
      });

      await client.callTool({
        name: "list_projects",
        arguments: {},
      });

      expect(capturedUrl).not.toContain("topic=");
    });
  });

  describe("list_projects field projection (DOT-516.2)", () => {
    it("returns only the default field set when fields is unset", async () => {
      mockJsonResponse([
        {
          id: 1,
          name: "Alpha",
          description: "first",
          visibility: "public",
          web_url: "https://gitlab.example/alpha",
          default_branch: "main",
          last_activity_at: "2026-04-01T00:00:00Z",
          archived: false,
          // Bloat fields that should NOT survive projection:
          container_registry_image_prefix: "registry.example/alpha",
          shared_runners_enabled: true,
          forking_access_level: "enabled",
          issues_template: "...",
        },
      ]);

      const result = await client.callTool({
        name: "list_projects",
        arguments: {},
      });
      const text = (result.content as TextContent)[0].text;
      const data = JSON.parse(text);

      // Default fields kept
      expect(data[0].id).toBe(1);
      expect(data[0].name).toBe("Alpha");
      expect(data[0].visibility).toBe("public");
      // Bloat dropped
      expect(data[0].container_registry_image_prefix).toBeUndefined();
      expect(data[0].shared_runners_enabled).toBeUndefined();
      expect(data[0].forking_access_level).toBeUndefined();
      expect(data[0].issues_template).toBeUndefined();
    });

    it('returns the full GitLab payload when fields="all"', async () => {
      mockJsonResponse([
        {
          id: 1,
          name: "Alpha",
          shared_runners_enabled: true,
          forking_access_level: "enabled",
        },
      ]);

      const result = await client.callTool({
        name: "list_projects",
        arguments: { fields: "all" },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data[0].shared_runners_enabled).toBe(true);
      expect(data[0].forking_access_level).toBe("enabled");
    });

    it("respects a caller-supplied field allow-list", async () => {
      mockJsonResponse([{ id: 1, name: "Alpha", visibility: "public", description: "first" }]);

      const result = await client.callTool({
        name: "list_projects",
        arguments: { fields: ["id", "description"] },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(Object.keys(data[0]).sort()).toEqual(["description", "id"]);
      expect(data[0].name).toBeUndefined();
      expect(data[0].visibility).toBeUndefined();
    });

    it("include_secrets:true implies fields:'all' so the secret survives", async () => {
      // Without this rule, projection's default set would silently strip
      // runners_token even though the caller explicitly opted in.
      mockJsonResponse([
        { id: 1, name: "Alpha", runners_token: "secret-alpha", shared_runners_enabled: true },
      ]);

      const result = await client.callTool({
        name: "list_projects",
        arguments: { include_secrets: true },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data[0].runners_token).toBe("secret-alpha");
      expect(data[0].shared_runners_enabled).toBe(true);
    });

    it("explicit fields wins over include_secrets implication", async () => {
      // Caller opts into secrets but ALSO explicitly narrows the field set.
      // The narrow list should win — caller said exactly what they wanted.
      mockJsonResponse([{ id: 1, name: "Alpha", runners_token: "secret-alpha" }]);

      const result = await client.callTool({
        name: "list_projects",
        arguments: { include_secrets: true, fields: ["id"] },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(Object.keys(data[0])).toEqual(["id"]);
      expect(data[0].runners_token).toBeUndefined();
    });
  });

  describe("list_group_projects forwards topic filter", () => {
    it("passes topic=foo through to GitLab when set", async () => {
      let capturedUrl: string | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string, _options?: RequestInit) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
          headers: new Headers(),
        } as Response);
      });

      await client.callTool({
        name: "list_group_projects",
        arguments: { group_id: "my-group", topic: "terraform-module" },
      });

      expect(capturedUrl).toContain("topic=terraform-module");
    });
  });

  describe("list_group_projects redacts runners_token", () => {
    it("strips runners_token from group projects by default", async () => {
      mockJsonResponse([
        { id: 1, name: "Alpha", runners_token: "secret-alpha" },
        { id: 2, name: "Beta", runners_token: "secret-beta" },
      ]);

      const result = await client.callTool({
        name: "list_group_projects",
        arguments: { group_id: "my-group" },
      });
      const text = (result.content as TextContent)[0].text;

      expect(text).not.toContain("runners_token");
      expect(text).not.toContain("secret-alpha");
    });

    it("preserves runners_token when include_secrets is true", async () => {
      mockJsonResponse([{ id: 1, name: "Alpha", runners_token: "secret-alpha" }]);

      const result = await client.callTool({
        name: "list_group_projects",
        arguments: { group_id: "my-group", include_secrets: true },
      });
      const text = (result.content as TextContent)[0].text;

      expect(text).toContain("runners_token");
      expect(text).toContain("secret-alpha");
    });

    it("applies field projection (DOT-516.5) using LIST_PROJECTS_DEFAULT_FIELDS", async () => {
      mockJsonResponse([
        { id: 1, name: "Alpha", visibility: "public", shared_runners_enabled: true },
      ]);

      const result = await client.callTool({
        name: "list_group_projects",
        arguments: { group_id: "my-group" },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data[0].name).toBe("Alpha");
      expect(data[0].shared_runners_enabled).toBeUndefined();
    });
  });
});

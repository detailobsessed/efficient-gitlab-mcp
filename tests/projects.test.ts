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
  });
});

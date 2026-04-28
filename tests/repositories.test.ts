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

        requestMethod = options?.method;
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

        requestMethod = options?.method;
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

    it("should propagate 403 errors instead of treating as file-not-found", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        // The GET file-existence check returns 403
        if (options?.method === "GET" || !options?.method) {
          return Promise.resolve({
            ok: false,
            status: 403,
            statusText: "Forbidden",
            text: () => Promise.resolve('{"message":"403 Forbidden"}'),
          } as Response);
        }

        // POST/PUT should never be reached
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve('{"file_path": "secret.txt", "branch": "main"}'),
        } as Response);
      });

      const result = await client.callTool({
        name: "create_or_update_file",
        arguments: {
          project_id: "my-group/my-project",
          file_path: "secret.txt",
          branch: "main",
          content: "should not be written",
          commit_message: "Should fail",
        },
      });

      const content = result.content as Array<{ type: string; text: string }>;
      // The 403 should surface as an error, not silently fall through to POST
      expect(content[0].text).toContain("permission denied");
    });
  });

  describe("get_file_contents", () => {
    it("auto-defaults ref to project's default_branch when ref is omitted", async () => {
      const calls: { url: string; method: string }[] = [];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        calls.push({ url, method: options?.method ?? "GET" });
        if (url.includes("/repository/files/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve('{"file_path": "README.md", "ref": "main", "content": "..."}'),
            headers: new Headers(),
          } as Response);
        }
        // Project metadata fetch
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"id": 42, "default_branch": "main"}'),
          headers: new Headers(),
        } as Response);
      });

      const result = await client.callTool({
        name: "get_file_contents",
        arguments: {
          project_id: "my-group/my-project",
          file_path: "README.md",
        },
      });

      // First call: GET /projects/:id (to look up default_branch)
      expect(calls.length).toBe(2);
      expect(calls[0].url).toContain("/projects/my-group");
      expect(calls[0].url).not.toContain("/repository/files");
      // Second call: GET /repository/files/... with the resolved ref
      expect(calls[1].url).toContain("/repository/files/README.md");
      expect(calls[1].url).toContain("ref=main");

      const text = (result.content as { type: "text"; text: string }[])[0].text;
      expect(text).toContain("README.md");
    });

    it("does not fetch project metadata when ref is explicitly provided", async () => {
      const calls: string[] = [];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string, _options?: RequestInit) => {
        calls.push(url);
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve('{"file_path": "README.md", "ref": "develop", "content": "..."}'),
          headers: new Headers(),
        } as Response);
      });

      await client.callTool({
        name: "get_file_contents",
        arguments: {
          project_id: "my-group/my-project",
          file_path: "README.md",
          ref: "develop",
        },
      });

      // Only one call — straight to the file endpoint with the explicit ref.
      expect(calls.length).toBe(1);
      expect(calls[0]).toContain("/repository/files/README.md");
      expect(calls[0]).toContain("ref=develop");
    });

    it("URL-encodes the resolved default_branch", async () => {
      const calls: string[] = [];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string, _options?: RequestInit) => {
        calls.push(url);
        if (url.includes("/repository/files/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('{"file_path": "x", "content": "..."}'),
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          // Default branch with a slash to verify encoding
          text: () => Promise.resolve('{"id": 42, "default_branch": "feature/v2"}'),
          headers: new Headers(),
        } as Response);
      });

      await client.callTool({
        name: "get_file_contents",
        arguments: { project_id: "p", file_path: "x" },
      });

      expect(calls[1]).toContain("ref=feature%2Fv2");
    });
  });

  describe("search_repositories", () => {
    it("should accept 'query' as an alias for 'search'", async () => {
      let capturedUrl: string | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, _options?: RequestInit) => {
        capturedUrl = _url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(JSON.stringify([{ id: 1, name: "test-repo", path: "test-repo" }])),
        } as Response);
      });

      const result = await client.callTool({
        name: "search_repositories",
        arguments: {
          query: "test-repo", // 'query' instead of 'search'
        },
      });

      expect(result.isError).toBeFalsy();
      expect(capturedUrl).toContain("search=test-repo");
    });
  });
});

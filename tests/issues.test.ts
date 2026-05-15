import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerIssueTools } from "../src/tools/issues.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Issue Tools Handlers", () => {
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
    const issueTools = registerIssueTools(server, logger);
    for (const tool of issueTools.values()) tool.enable();
    toolsByCategory.set("issues", issueTools);
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

  describe("create_issue", () => {
    it("should POST to the correct endpoint with the right body", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;
      let capturedBody: string | undefined;

      const mockIssue = {
        id: 1,
        iid: 42,
        title: "Bug report",
        description: "Something is broken",
        state: "opened",
        labels: ["bug"],
        web_url: "https://gitlab.com/my-group/my-project/-/issues/42",
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        capturedBody = options?.body as string;
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve(JSON.stringify(mockIssue)),
        } as Response);
      });

      const result = await client.callTool({
        name: "create_issue",
        arguments: {
          project_id: "my-group/my-project",
          title: "Bug report",
          description: "Something is broken",
          labels: ["bug"],
        },
      });

      expect(capturedUrl).toBe("https://gitlab.com/api/v4/projects/my-group%2Fmy-project/issues");
      expect(capturedMethod).toBe("POST");

      const body = JSON.parse(capturedBody ?? "");
      expect(body.title).toBe("Bug report");
      expect(body.description).toBe("Something is broken");
      expect(body.labels).toEqual(["bug"]);
      // project_id should not be in the POST body
      expect(body.project_id).toBeUndefined();

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData.iid).toBe(42);
      expect(responseData.title).toBe("Bug report");
    });
  });

  describe("list_issues", () => {
    it("should GET with correct query parameters for pagination and filters", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;

      const mockIssues = [
        { id: 1, iid: 1, title: "First issue", state: "opened" },
        { id: 2, iid: 2, title: "Second issue", state: "opened" },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockIssues)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_issues",
        arguments: {
          project_id: "my-group/my-project",
          state: "opened",
          labels: ["bug", "critical"],
          page: 2,
          per_page: 25,
        },
      });

      // Arrays go into query strings as labels[]=bug&labels[]=critical
      expect(capturedUrl).toBe(
        "https://gitlab.com/api/v4/projects/my-group%2Fmy-project/issues?state=opened&labels%5B%5D=bug&labels%5B%5D=critical&page=2&per_page=25",
      );
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].title).toBe("First issue");
    });

    it("accepts a JSON-stringified array of labels (coerceStringArray)", async () => {
      // Regression for upstream 350d84a: LLMs sometimes serialize arrays as
      // JSON strings when filling MCP tool parameters. coerceStringArray
      // accepts either form and normalises to an array.
      let capturedUrl: string | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string) => {
        capturedUrl = _url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
        } as Response);
      });

      await client.callTool({
        name: "list_issues",
        arguments: {
          project_id: "my-group/my-project",
          labels: '["bug","critical"]',
        },
      });

      expect(capturedUrl).toBe(
        "https://gitlab.com/api/v4/projects/my-group%2Fmy-project/issues?labels%5B%5D=bug&labels%5B%5D=critical",
      );
    });
  });

  describe("get_issue", () => {
    it("should GET with encoded project_id and issue_iid", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;

      const mockIssue = {
        id: 1,
        iid: 10,
        title: "Important issue",
        description: "Details here",
        state: "opened",
        author: { id: 5, username: "admin" },
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockIssue)),
        } as Response);
      });

      const result = await client.callTool({
        name: "get_issue",
        arguments: {
          project_id: "my-group/sub-group/my-project",
          issue_iid: 10,
        },
      });

      expect(capturedUrl).toBe(
        "https://gitlab.com/api/v4/projects/my-group%2Fsub-group%2Fmy-project/issues/10",
      );
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData.iid).toBe(10);
      expect(responseData.title).toBe("Important issue");
    });
  });

  describe("error handling", () => {
    it("should return error content on API 404", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: () => Promise.resolve("Project not found"),
        } as Response),
      );

      const result = await client.callTool({
        name: "get_issue",
        arguments: { project_id: "nonexistent/project", issue_iid: 1 },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("404 Not Found");
    });

    it("should return rate limit error on 403 with rate limit message", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          text: () => Promise.resolve("Rate limit exceeded"),
        } as Response),
      );

      const result = await client.callTool({
        name: "list_issues",
        arguments: { project_id: "my-group/my-project" },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("Rate Limit Exceeded");
    });
  });

  describe("authentication", () => {
    it("should send Content-Type header on all requests", async () => {
      let capturedHeaders: Record<string, string> | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedHeaders = options?.headers as Record<string, string>;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify([{ id: 1, title: "Test" }])),
        } as Response);
      });

      await client.callTool({
        name: "list_issues",
        arguments: { project_id: "my-group/my-project" },
      });

      expect(capturedHeaders?.["Content-Type"]).toBe("application/json");
    });
  });

  describe("update_issue", () => {
    it("should coerce string boolean 'true' to boolean true for confidential", async () => {
      let capturedBody: string | undefined;

      const mockIssue = {
        id: 1,
        iid: 10,
        title: "Updated issue",
        state: "opened",
        confidential: true,
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedBody = options?.body as string;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockIssue)),
        } as Response);
      });

      const result = await client.callTool({
        name: "update_issue",
        arguments: {
          project_id: "my-group/my-project",
          issue_iid: 10,
          confidential: "true", // LLMs send booleans as strings
        },
      });

      // Should succeed, not error
      expect(result.isError).toBeFalsy();

      const body = JSON.parse(capturedBody ?? "{}");
      expect(body.confidential).toBe(true);
    });
  });

  describe("list_issues field projection (DOT-516.3)", () => {
    function mockIssuesResponse(issues: Record<string, unknown>[]) {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(issues)),
        } as Response),
      );
    }

    it("returns only the default field set when fields is unset", async () => {
      mockIssuesResponse([
        {
          id: 1,
          iid: 42,
          title: "Bug",
          state: "opened",
          web_url: "https://gitlab.example/p/-/issues/42",
          // Bloat fields that should NOT survive projection:
          subscribed: true,
          time_stats: { time_estimate: 0 },
          task_completion_status: { count: 0, completed_count: 0 },
          discussion_locked: false,
          merge_requests_count: 0,
        },
      ]);

      const result = await client.callTool({
        name: "list_issues",
        arguments: { project_id: "p" },
      });
      const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
      expect(data[0].iid).toBe(42);
      expect(data[0].title).toBe("Bug");
      expect(data[0].state).toBe("opened");
      // Bloat dropped
      expect(data[0].subscribed).toBeUndefined();
      expect(data[0].time_stats).toBeUndefined();
      expect(data[0].task_completion_status).toBeUndefined();
      expect(data[0].merge_requests_count).toBeUndefined();
    });

    it('returns the full payload when fields="all"', async () => {
      mockIssuesResponse([{ id: 1, iid: 42, title: "Bug", subscribed: true }]);

      const result = await client.callTool({
        name: "list_issues",
        arguments: { project_id: "p", fields: "all" },
      });
      const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
      expect(data[0].subscribed).toBe(true);
    });

    it("respects a caller-supplied field allow-list", async () => {
      mockIssuesResponse([{ id: 1, iid: 42, title: "Bug", state: "opened" }]);

      const result = await client.callTool({
        name: "list_issues",
        arguments: { project_id: "p", fields: ["iid", "title"] },
      });
      const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
      expect(Object.keys(data[0]).sort()).toEqual(["iid", "title"]);
      expect(data[0].state).toBeUndefined();
    });
  });

  describe("my_issues field projection (DOT-516.3)", () => {
    it("applies the same default field set across all projects", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify([{ id: 1, iid: 1, title: "Mine", state: "opened", subscribed: true }]),
            ),
        } as Response),
      );

      const result = await client.callTool({
        name: "my_issues",
        arguments: {},
      });
      const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
      expect(data[0].title).toBe("Mine");
      expect(data[0].subscribed).toBeUndefined();
    });
  });
});

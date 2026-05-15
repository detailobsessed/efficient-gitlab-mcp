import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerMergeRequestTools } from "../src/tools/merge-requests.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Merge Request Tools Handlers", () => {
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
    const mrTools = registerMergeRequestTools(server, logger);
    for (const tool of mrTools.values()) tool.enable();
    toolsByCategory.set("merge-requests", mrTools);
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

  describe("create_merge_request", () => {
    it("should POST with source_branch, target_branch, and title in body", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      let capturedBody = "";

      const mockMr = {
        id: 1,
        iid: 10,
        title: "Add feature",
        source_branch: "feature-branch",
        target_branch: "main",
        state: "opened",
        web_url: "https://gitlab.com/my-group/my-project/-/merge_requests/10",
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        capturedBody = typeof options?.body === "string" ? options.body : "";
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve(JSON.stringify(mockMr)),
        } as Response);
      });

      const result = await client.callTool({
        name: "create_merge_request",
        arguments: {
          project_id: "my-group/my-project",
          source_branch: "feature-branch",
          target_branch: "main",
          title: "Add feature",
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/merge_requests");
      expect(capturedMethod).toBe("POST");

      const body = JSON.parse(capturedBody ?? "");
      expect(body.source_branch).toBe("feature-branch");
      expect(body.target_branch).toBe("main");
      expect(body.title).toBe("Add feature");
      expect(body.project_id).toBeUndefined();

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData.iid).toBe(10);
      expect(responseData.title).toBe("Add feature");
    });
  });

  describe("list_merge_requests", () => {
    it("should GET with state and page query parameters", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockMrs = [
        { id: 1, iid: 1, title: "MR one", state: "opened" },
        { id: 2, iid: 2, title: "MR two", state: "opened" },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockMrs)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_merge_requests",
        arguments: {
          project_id: "my-group/my-project",
          state: "opened",
          page: 2,
          per_page: 10,
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/merge_requests");
      expect(capturedUrl).toContain("state=opened");
      expect(capturedUrl).toContain("page=2");
      expect(capturedUrl).toContain("per_page=10");
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].title).toBe("MR one");
    });

    it("should pass user filter params as query parameters", async () => {
      let capturedUrl = "";

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, _options?: RequestInit) => {
        capturedUrl = _url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
        } as Response);
      });

      await client.callTool({
        name: "list_merge_requests",
        arguments: {
          project_id: "my-group/my-project",
          author_username: "alice",
          assignee_id: 42,
        },
      });

      expect(capturedUrl).toContain("author_username=alice");
      expect(capturedUrl).toContain("assignee_id=42");
    });

    it("should prefer author_username over author_id when both provided", async () => {
      let capturedUrl = "";

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, _options?: RequestInit) => {
        capturedUrl = _url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
        } as Response);
      });

      await client.callTool({
        name: "list_merge_requests",
        arguments: {
          project_id: "my-group/my-project",
          author_id: 99,
          author_username: "alice",
        },
      });

      expect(capturedUrl).toContain("author_username=alice");
      expect(capturedUrl).not.toContain("author_id=99");
    });

    it("should prefer reviewer_username over reviewer_id when both provided", async () => {
      let capturedUrl = "";

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, _options?: RequestInit) => {
        capturedUrl = _url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
        } as Response);
      });

      await client.callTool({
        name: "list_merge_requests",
        arguments: {
          project_id: "my-group/my-project",
          reviewer_id: 7,
          reviewer_username: "bob",
        },
      });

      expect(capturedUrl).toContain("reviewer_username=bob");
      expect(capturedUrl).not.toContain("reviewer_id=7");
    });

    it("should prefer assignee_username over assignee_id=0 when both provided", async () => {
      let capturedUrl = "";

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, _options?: RequestInit) => {
        capturedUrl = _url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
        } as Response);
      });

      await client.callTool({
        name: "list_merge_requests",
        arguments: {
          project_id: "my-group/my-project",
          assignee_id: 0,
          assignee_username: "alice",
        },
      });

      expect(capturedUrl).toContain("assignee_username=alice");
      expect(capturedUrl).not.toContain("assignee_id=0");
    });
  });

  describe("approve_merge_request", () => {
    it("should POST to the approve endpoint", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockApproval = {
        id: 1,
        iid: 5,
        approved: true,
        approved_by: [{ user: { id: 10, username: "reviewer" } }],
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve(JSON.stringify(mockApproval)),
        } as Response);
      });

      const result = await client.callTool({
        name: "approve_merge_request",
        arguments: {
          project_id: "my-group/my-project",
          merge_request_iid: 5,
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/merge_requests/5/approve");
      expect(capturedMethod).toBe("POST");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData.approved).toBe(true);
    });
  });

  describe("list_draft_notes", () => {
    it("should GET draft notes for a merge request", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockDraftNotes = [
        { id: 1, body: "Draft comment one", author_id: 10 },
        { id: 2, body: "Draft comment two", author_id: 10 },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockDraftNotes)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_draft_notes",
        arguments: {
          project_id: "my-group/my-project",
          merge_request_iid: 7,
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/merge_requests/7/draft_notes");
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].body).toBe("Draft comment one");
    });
  });

  describe("merge_request_iid coerces stringified numbers (DOT-519)", () => {
    // Defensive hardening: regardless of whether a client passes 26 (number)
    // or "26" (stringified number, the symptom in DOT-519), the schema accepts
    // both and the URL ends up identical.
    it("accepts a stringified merge_request_iid for get_merge_request", async () => {
      let capturedUrl = "";

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string) => {
        capturedUrl = _url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"id": 1, "iid": 26, "title": "Test MR"}'),
        } as Response);
      });

      const result = await client.callTool({
        name: "get_merge_request",
        arguments: {
          project_id: "my-group/my-project",
          // @ts-expect-error - intentionally passing a string to verify coercion
          merge_request_iid: "26",
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/merge_requests/26");
      const content = result.content as Array<{ type: string; text: string }>;
      const data = JSON.parse(content[0].text);
      expect(data.iid).toBe(26);
    });

    it("accepts a stringified merge_request_iid for update_merge_request", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"id": 1, "iid": 27}'),
        } as Response);
      });

      await client.callTool({
        name: "update_merge_request",
        arguments: {
          project_id: "my-group/my-project",
          // @ts-expect-error - intentionally passing a string to verify coercion
          merge_request_iid: "27",
          title: "Renamed",
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/merge_requests/27");
      expect(capturedMethod).toBe("PUT");
    });
  });

  describe("list_merge_requests field projection (DOT-516.4)", () => {
    function mockMRsResponse(mrs: Record<string, unknown>[]) {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mrs)),
        } as Response),
      );
    }

    it("returns only the default field set when fields is unset", async () => {
      mockMRsResponse([
        {
          id: 1,
          iid: 5,
          title: "Refactor",
          state: "opened",
          source_branch: "feature/x",
          target_branch: "main",
          web_url: "https://gitlab.example/p/-/merge_requests/5",
          merge_status: "can_be_merged",
          // Bloat fields that should NOT survive projection:
          changes_count: "12",
          time_stats: { time_estimate: 0 },
          has_conflicts: false,
          blocking_discussions_resolved: true,
          _links: { self: "..." },
          merge_commit_sha: null,
          rebase_in_progress: false,
        },
      ]);

      const result = await client.callTool({
        name: "list_merge_requests",
        arguments: { project_id: "p" },
      });
      const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
      expect(data[0].iid).toBe(5);
      expect(data[0].state).toBe("opened");
      expect(data[0].source_branch).toBe("feature/x");
      // Bloat dropped
      expect(data[0].changes_count).toBeUndefined();
      expect(data[0].time_stats).toBeUndefined();
      expect(data[0].has_conflicts).toBeUndefined();
      expect(data[0]._links).toBeUndefined();
    });

    it('returns the full payload when fields="all"', async () => {
      mockMRsResponse([{ id: 1, iid: 5, title: "Refactor", changes_count: "12" }]);

      const result = await client.callTool({
        name: "list_merge_requests",
        arguments: { project_id: "p", fields: "all" },
      });
      const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
      expect(data[0].changes_count).toBe("12");
    });

    it("preserves the existing state filter alongside projection", async () => {
      // Regression: the username/id mutual-exclusion logic in the handler
      // shouldn't be disturbed by the new fields destructure.
      let capturedUrl: string | undefined;
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
        } as Response);
      });

      await client.callTool({
        name: "list_merge_requests",
        arguments: {
          project_id: "p",
          state: "opened",
          author_id: 42,
          author_username: "alice",
        },
      });
      // username wins over id when both provided
      expect(capturedUrl).toContain("state=opened");
      expect(capturedUrl).toContain("author_username=alice");
      expect(capturedUrl).not.toContain("author_id=42");
    });
  });

  describe("list_merge_request_pipelines (DOT-543)", () => {
    it("GETs the MR pipelines endpoint and forwards pagination", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockPipelines = [
        {
          id: 77,
          sha: "959e04d7c7a30600c894bd3c0cd0e1ce7f42c11d",
          ref: "main",
          status: "success",
        },
        {
          id: 78,
          sha: "a59e04d7c7a30600c894bd3c0cd0e1ce7f42c22e",
          ref: "refs/merge-requests/1/head",
          status: "running",
          source: "merge_request_event",
          web_url: "https://gitlab.example.com/test/project/-/pipelines/78",
        },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        capturedUrl = url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockPipelines)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_merge_request_pipelines",
        arguments: {
          project_id: "my-group/my-project",
          merge_request_iid: 1,
          page: 2,
          per_page: 10,
        },
      });

      expect(capturedMethod).toBe("GET");
      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/merge_requests/1/pipelines");
      expect(capturedUrl).toContain("page=2");
      expect(capturedUrl).toContain("per_page=10");
      // project_id and merge_request_iid live in the path, not the query.
      expect(capturedUrl).not.toContain("project_id=");
      expect(capturedUrl).not.toContain("merge_request_iid=");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].id).toBe(77);
      expect(responseData[1].source).toBe("merge_request_event");
    });

    it("coerces a stringified merge_request_iid", async () => {
      let capturedUrl = "";
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
        } as Response);
      });

      await client.callTool({
        name: "list_merge_request_pipelines",
        arguments: {
          project_id: "g/p",
          merge_request_iid: "42",
        },
      });

      expect(capturedUrl).toContain("/merge_requests/42/pipelines");
    });
  });
});

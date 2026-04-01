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
});

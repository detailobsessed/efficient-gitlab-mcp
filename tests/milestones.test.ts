import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerMilestoneTools } from "../src/tools/milestones.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Milestone Tools Handlers", () => {
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
    const milestoneTools = registerMilestoneTools(server, logger);
    for (const tool of milestoneTools.values()) tool.enable();
    toolsByCategory.set("milestones", milestoneTools);
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

  describe("list_milestones", () => {
    it("should GET milestones with state filter", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockMilestones = [
        { id: 1, title: "v1.0", state: "active" },
        { id: 2, title: "v2.0", state: "active" },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockMilestones)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_milestones",
        arguments: {
          project_id: "my-group/my-project",
          state: "active",
          page: 1,
        },
      });

      expect(capturedUrl).toBe(
        "https://gitlab.com/api/v4/projects/my-group%2Fmy-project/milestones?state=active&page=1",
      );
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].title).toBe("v1.0");
    });
  });

  describe("create_milestone", () => {
    it("should POST with title and description in body", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      let capturedBody = "";

      const mockMilestone = {
        id: 3,
        title: "v3.0",
        description: "Major release",
        state: "active",
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        capturedBody = typeof options?.body === "string" ? options.body : "";
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve(JSON.stringify(mockMilestone)),
        } as Response);
      });

      const result = await client.callTool({
        name: "create_milestone",
        arguments: {
          project_id: "my-group/my-project",
          title: "v3.0",
          description: "Major release",
        },
      });

      expect(capturedUrl).toBe(
        "https://gitlab.com/api/v4/projects/my-group%2Fmy-project/milestones",
      );
      expect(capturedMethod).toBe("POST");

      const body = JSON.parse(capturedBody ?? "");
      expect(body.title).toBe("v3.0");
      expect(body.description).toBe("Major release");
      expect(body.project_id).toBeUndefined();

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData.id).toBe(3);
      expect(responseData.title).toBe("v3.0");
    });
  });

  describe("get_milestone_issue", () => {
    it("should GET issues for a milestone", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockIssues = [
        { id: 10, iid: 1, title: "Issue in milestone", state: "opened" },
        { id: 11, iid: 2, title: "Another issue", state: "closed" },
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
        name: "get_milestone_issue",
        arguments: {
          project_id: "my-group/my-project",
          milestone_id: "5",
        },
      });

      expect(capturedUrl).toBe(
        "https://gitlab.com/api/v4/projects/my-group%2Fmy-project/milestones/5/issues",
      );
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].title).toBe("Issue in milestone");
    });
  });
});

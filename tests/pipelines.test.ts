import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerPipelineTools } from "../src/tools/pipelines.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Pipeline Tools Handlers", () => {
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
    const pipelineTools = registerPipelineTools(server, logger);
    for (const tool of pipelineTools.values()) tool.enable();
    toolsByCategory.set("pipelines", pipelineTools);
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

  describe("list_pipelines", () => {
    it("should GET with query parameters", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockPipelines = [
        { id: 101, ref: "main", status: "success", sha: "abc123" },
        { id: 102, ref: "main", status: "failed", sha: "def456" },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockPipelines)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_pipelines",
        arguments: {
          project_id: "my-group/my-project",
          status: "success",
          ref: "main",
          page: 1,
          per_page: 20,
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/pipelines");
      expect(capturedUrl).toContain("status=success");
      expect(capturedUrl).toContain("ref=main");
      expect(capturedUrl).toContain("page=1");
      expect(capturedUrl).toContain("per_page=20");
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].status).toBe("success");
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
                  id: 101,
                  ref: "main",
                  status: "success",
                  sha: "abc123",
                  // Bloat fields that should be dropped:
                  before_sha: "0000000000000000000000000000000000000000",
                  user: { id: 1, username: "alice" },
                  finished_at: "2026-04-28T07:00:00Z",
                  duration: 120,
                  queued_duration: 5,
                },
              ]),
            ),
        } as Response),
      );

      const result = await client.callTool({
        name: "list_pipelines",
        arguments: { project_id: "p" },
      });
      const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
      expect(data[0].ref).toBe("main");
      expect(data[0].status).toBe("success");
      // Bloat dropped
      expect(data[0].before_sha).toBeUndefined();
      expect(data[0].user).toBeUndefined();
      expect(data[0].duration).toBeUndefined();
    });
  });

  describe("create_pipeline", () => {
    it("should POST with ref in body", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      let capturedBody = "";

      const mockPipeline = {
        id: 200,
        ref: "develop",
        status: "pending",
        sha: "aaa111",
        web_url: "https://gitlab.com/my-group/my-project/-/pipelines/200",
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        capturedBody = typeof options?.body === "string" ? options.body : "";
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve(JSON.stringify(mockPipeline)),
        } as Response);
      });

      const result = await client.callTool({
        name: "create_pipeline",
        arguments: {
          project_id: "my-group/my-project",
          ref: "develop",
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/pipeline");
      expect(capturedMethod).toBe("POST");

      const body = JSON.parse(capturedBody ?? "");
      expect(body.ref).toBe("develop");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData.id).toBe(200);
      expect(responseData.status).toBe("pending");
    });
  });

  describe("list_deployments", () => {
    it("should GET deployments with filters", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockDeployments = [
        { id: 1, environment: "production", ref: "main", status: "success" },
        { id: 2, environment: "staging", ref: "develop", status: "success" },
      ];

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockDeployments)),
        } as Response);
      });

      const result = await client.callTool({
        name: "list_deployments",
        arguments: {
          project_id: "my-group/my-project",
          environment: "production",
          status: "success",
        },
      });

      expect(capturedUrl).toContain("/projects/my-group%2Fmy-project/deployments");
      expect(capturedUrl).toContain("environment=production");
      expect(capturedUrl).toContain("status=success");
      expect(capturedMethod).toBe("GET");

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].environment).toBe("production");
    });
  });
});

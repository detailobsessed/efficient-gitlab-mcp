import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerGraphqlTools } from "../src/tools/graphql.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("GraphQL Tools Handlers", () => {
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
    const graphqlTools = registerGraphqlTools(server, logger);
    for (const tool of graphqlTools.values()) tool.enable();
    toolsByCategory.set("graphql", graphqlTools);
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

  describe("execute_graphql", () => {
    it("should POST query and variables to the GraphQL endpoint", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      let capturedBody = "";

      const mockResponse = {
        data: {
          project: {
            id: "gid://gitlab/Project/1",
            name: "My Project",
            description: "A test project",
          },
        },
      };

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedUrl = _url;
        capturedMethod = options?.method ?? "GET";
        capturedBody = typeof options?.body === "string" ? options.body : "";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResponse),
          text: () => Promise.resolve(JSON.stringify(mockResponse)),
        } as Response);
      });

      const query = '{ project(fullPath: "my-group/my-project") { id name description } }';

      const result = await client.callTool({
        name: "execute_graphql",
        arguments: {
          query,
        },
      });

      expect(capturedUrl).toBe("https://gitlab.com/api/graphql");
      expect(capturedMethod).toBe("POST");

      const body = JSON.parse(capturedBody ?? "");
      expect(body.query).toBe(query);
      expect(body.variables).toEqual({});

      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      // graphql() unwraps the data field, so the tool receives json.data directly
      expect(responseData.project.name).toBe("My Project");
    });
  });

  describe("error handling", () => {
    it("should return error content instead of throwing on API failure", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: () => Promise.resolve("Server error"),
        } as Response),
      );

      const result = await client.callTool({
        name: "execute_graphql",
        arguments: {
          query: '{ project(fullPath: "test") { name } }',
        },
      });

      // GraphQL tool intentionally returns errors as content, not MCP errors
      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const responseData = JSON.parse(content[0].text);
      expect(responseData.error).toContain("GraphQL request failed");
    });
  });
});

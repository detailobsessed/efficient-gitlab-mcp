import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerUserTools } from "../src/tools/users.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

type TextContent = { type: "text"; text: string }[];

describe("User Tools Handlers", () => {
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
    const userTools = registerUserTools(server, logger);
    for (const tool of userTools.values()) tool.enable();
    toolsByCategory.set("users", userTools);
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

  describe("get_users explicit-null shape", () => {
    it("returns null for usernames the API doesn't resolve", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string) => {
        // GitLab returns [] for unknown usernames, [{...}] for known ones.
        const known = url.includes("username=alice");
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(known ? '[{"id": 1, "username": "alice", "name": "Alice"}]' : "[]"),
          headers: new Headers(),
        } as Response);
      });

      const result = await client.callTool({
        name: "get_users",
        arguments: { usernames: ["alice", "ghost"] },
      });
      const text = (result.content as TextContent)[0].text;
      const parsed = JSON.parse(text);

      // Found user is present and well-formed
      expect(parsed.alice).toBeDefined();
      expect(parsed.alice.username).toBe("alice");

      // Unknown user is explicitly null — caller can tell which key missed.
      // Previous behavior was to omit the key entirely, which collapsed
      // signal: ambiguous between "I never asked" and "they don't exist".
      expect(parsed).toHaveProperty("ghost");
      expect(parsed.ghost).toBeNull();
    });

    it("returns an empty object only when no usernames are requested", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("[]"),
          headers: new Headers(),
        } as Response),
      );

      const result = await client.callTool({
        name: "get_users",
        arguments: { usernames: [] },
      });
      const text = (result.content as TextContent)[0].text;
      const parsed = JSON.parse(text);

      expect(Object.keys(parsed).length).toBe(0);
    });
  });
});

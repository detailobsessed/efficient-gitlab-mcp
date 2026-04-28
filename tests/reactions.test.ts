import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerReactionTools } from "../src/tools/reactions.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Emoji Reaction Tools Handlers", () => {
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
    const reactionTools = registerReactionTools(server, logger);
    for (const tool of reactionTools.values()) tool.enable();
    toolsByCategory.set("emoji-reactions", reactionTools);
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

  // Capture URL + method + body in one mock helper
  function captureRequest(responseBody: unknown = {}) {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody: string | undefined;

    // @ts-expect-error - mock doesn't need full fetch signature
    globalThis.fetch = mock((url: string, options?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = options?.method ?? "GET";
      capturedBody = typeof options?.body === "string" ? options.body : undefined;
      return Promise.resolve({
        ok: true,
        status: capturedMethod === "DELETE" ? 204 : 200,
        text: () => Promise.resolve(JSON.stringify(responseBody)),
      } as Response);
    });

    return {
      get url() {
        return capturedUrl;
      },
      get method() {
        return capturedMethod;
      },
      get body() {
        return capturedBody;
      },
    };
  }

  // ---------- MR-level reactions ----------

  describe("list_merge_request_emoji_reactions", () => {
    it("GETs /merge_requests/:iid/award_emoji", async () => {
      const cap = captureRequest([{ id: 1, name: "thumbsup" }]);

      await client.callTool({
        name: "list_merge_request_emoji_reactions",
        arguments: { project_id: "my-group/my-project", merge_request_iid: 7 },
      });

      expect(cap.url).toContain("/projects/my-group%2Fmy-project/merge_requests/7/award_emoji");
      expect(cap.method).toBe("GET");
    });
  });

  describe("create_merge_request_emoji_reaction", () => {
    it("POSTs name in body", async () => {
      const cap = captureRequest({ id: 99, name: "rocket" });

      await client.callTool({
        name: "create_merge_request_emoji_reaction",
        arguments: { project_id: "p", merge_request_iid: 7, name: "rocket" },
      });

      expect(cap.url).toContain("/projects/p/merge_requests/7/award_emoji");
      expect(cap.method).toBe("POST");
      const body = JSON.parse(cap.body ?? "{}");
      expect(body.name).toBe("rocket");
    });
  });

  describe("delete_merge_request_emoji_reaction", () => {
    it("DELETEEs /award_emoji/:id with URL-encoded id", async () => {
      const cap = captureRequest();

      await client.callTool({
        name: "delete_merge_request_emoji_reaction",
        arguments: { project_id: "p", merge_request_iid: 7, award_id: 99 },
      });

      expect(cap.url).toContain("/projects/p/merge_requests/7/award_emoji/99");
      expect(cap.method).toBe("DELETE");
    });
  });

  // ---------- MR-note-level reactions ----------

  describe("list_merge_request_note_emoji_reactions", () => {
    it("GETs /notes/:id/award_emoji when discussion_id is omitted", async () => {
      const cap = captureRequest([]);

      await client.callTool({
        name: "list_merge_request_note_emoji_reactions",
        arguments: { project_id: "p", merge_request_iid: 7, note_id: 42 },
      });

      expect(cap.url).toContain("/projects/p/merge_requests/7/notes/42/award_emoji");
      // Critical: no `/discussions/` segment when discussion_id is unset
      expect(cap.url).not.toContain("/discussions/");
    });

    it("GETs /discussions/:did/notes/:id/award_emoji when discussion_id is set", async () => {
      const cap = captureRequest([]);

      await client.callTool({
        name: "list_merge_request_note_emoji_reactions",
        arguments: {
          project_id: "p",
          merge_request_iid: 7,
          note_id: 42,
          discussion_id: "abc123",
        },
      });

      expect(cap.url).toContain(
        "/projects/p/merge_requests/7/discussions/abc123/notes/42/award_emoji",
      );
    });
  });

  describe("create_merge_request_note_emoji_reaction", () => {
    it("POSTs name in body, routes through discussion when provided", async () => {
      const cap = captureRequest({ id: 99 });

      await client.callTool({
        name: "create_merge_request_note_emoji_reaction",
        arguments: {
          project_id: "p",
          merge_request_iid: 7,
          note_id: 42,
          discussion_id: "abc123",
          name: "eyes",
        },
      });

      expect(cap.url).toContain("/discussions/abc123/notes/42/award_emoji");
      expect(cap.method).toBe("POST");
      const body = JSON.parse(cap.body ?? "{}");
      expect(body.name).toBe("eyes");
    });
  });

  describe("delete_merge_request_note_emoji_reaction", () => {
    it("DELETEEs /notes/:id/award_emoji/:award_id without discussion_id", async () => {
      const cap = captureRequest();

      await client.callTool({
        name: "delete_merge_request_note_emoji_reaction",
        arguments: { project_id: "p", merge_request_iid: 7, note_id: 42, award_id: 99 },
      });

      expect(cap.url).toContain("/notes/42/award_emoji/99");
      expect(cap.url).not.toContain("/discussions/");
      expect(cap.method).toBe("DELETE");
    });
  });

  // ---------- Issue-level reactions ----------

  describe("list_issue_emoji_reactions", () => {
    it("GETs /issues/:iid/award_emoji", async () => {
      const cap = captureRequest([{ id: 1, name: "thumbsup" }]);

      await client.callTool({
        name: "list_issue_emoji_reactions",
        arguments: { project_id: "p", issue_iid: 11 },
      });

      expect(cap.url).toContain("/projects/p/issues/11/award_emoji");
      expect(cap.method).toBe("GET");
    });
  });

  describe("create_issue_emoji_reaction", () => {
    it("POSTs name in body to /issues/:iid/award_emoji", async () => {
      const cap = captureRequest({ id: 99, name: "rocket" });

      await client.callTool({
        name: "create_issue_emoji_reaction",
        arguments: { project_id: "p", issue_iid: 11, name: "rocket" },
      });

      expect(cap.url).toContain("/projects/p/issues/11/award_emoji");
      expect(cap.method).toBe("POST");
      const body = JSON.parse(cap.body ?? "{}");
      expect(body.name).toBe("rocket");
    });
  });

  describe("delete_issue_emoji_reaction", () => {
    it("removes the emoji reaction from /issues/:iid/award_emoji/:award_id", async () => {
      const cap = captureRequest();

      await client.callTool({
        name: "delete_issue_emoji_reaction",
        arguments: { project_id: "p", issue_iid: 11, award_id: 88 },
      });

      expect(cap.url).toContain("/projects/p/issues/11/award_emoji/88");
      expect(cap.method).toBe("DELETE");
    });
  });

  // ---------- Issue-note-level reactions ----------

  describe("list_issue_note_emoji_reactions", () => {
    it("GETs /notes/:id/award_emoji when discussion_id is omitted", async () => {
      const cap = captureRequest([]);

      await client.callTool({
        name: "list_issue_note_emoji_reactions",
        arguments: { project_id: "p", issue_iid: 11, note_id: 42 },
      });

      expect(cap.url).toContain("/projects/p/issues/11/notes/42/award_emoji");
      expect(cap.url).not.toContain("/discussions/");
    });

    it("GETs /discussions/:did/notes/:id/award_emoji when discussion_id is set", async () => {
      const cap = captureRequest([]);

      await client.callTool({
        name: "list_issue_note_emoji_reactions",
        arguments: {
          project_id: "p",
          issue_iid: 11,
          note_id: 42,
          discussion_id: "abc123",
        },
      });

      expect(cap.url).toContain("/projects/p/issues/11/discussions/abc123/notes/42/award_emoji");
    });
  });

  describe("create_issue_note_emoji_reaction", () => {
    it("POSTs name in body, routes through discussion when provided", async () => {
      const cap = captureRequest({ id: 99 });

      await client.callTool({
        name: "create_issue_note_emoji_reaction",
        arguments: {
          project_id: "p",
          issue_iid: 11,
          note_id: 42,
          discussion_id: "abc123",
          name: "eyes",
        },
      });

      expect(cap.url).toContain("/discussions/abc123/notes/42/award_emoji");
      expect(cap.method).toBe("POST");
      const body = JSON.parse(cap.body ?? "{}");
      expect(body.name).toBe("eyes");
    });
  });

  describe("delete_issue_note_emoji_reaction", () => {
    it("removes the reaction from /notes/:id/award_emoji/:award_id without discussion_id", async () => {
      const cap = captureRequest();

      await client.callTool({
        name: "delete_issue_note_emoji_reaction",
        arguments: { project_id: "p", issue_iid: 11, note_id: 42, award_id: 99 },
      });

      expect(cap.url).toContain("/issues/11/notes/42/award_emoji/99");
      expect(cap.url).not.toContain("/discussions/");
      expect(cap.method).toBe("DELETE");
    });
  });
});

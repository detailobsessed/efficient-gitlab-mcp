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

  // ---------- Work item (GraphQL) reactions ----------

  // All work-item tools first call /api/v4/projects/:id to resolve the
  // project path, then a GraphQL query to resolve the work-item GID, then
  // the actual awardEmoji query or mutation. So each test needs the mock
  // to serve three responses in sequence (or we drive via response-count).

  function captureGraphQLSequence(responses: unknown[]) {
    const urls: string[] = [];
    const bodies: (string | undefined)[] = [];
    let callIdx = 0;

    // @ts-expect-error - mock doesn't need full fetch signature
    globalThis.fetch = mock((url: string, options?: RequestInit) => {
      urls.push(url);
      bodies.push(typeof options?.body === "string" ? options.body : undefined);
      const response = responses[callIdx] ?? {};
      callIdx++;
      // graphql() uses response.json() — REST get() uses response.text(). Provide both.
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(response)),
        json: () => Promise.resolve(response),
      } as Response);
    });

    return {
      get urls() {
        return urls;
      },
      get bodies() {
        return bodies;
      },
      lastGraphQLBody() {
        return bodies[bodies.length - 1]
          ? (JSON.parse(bodies[bodies.length - 1] as string) as {
              query: string;
              variables: Record<string, unknown>;
            })
          : undefined;
      },
    };
  }

  // Standard 3-response fixture for work-item tools:
  // 1. REST: GET /api/v4/projects/:id → { path_with_namespace }
  // 2. GraphQL: resolveWorkItemGID query → workItem.id
  // 3. GraphQL: the actual reaction query/mutation → varies per test
  function workItemMockFor(finalResponse: unknown) {
    return [
      // projects/:id REST resolution
      { path_with_namespace: "my-group/my-project" },
      // resolveWorkItemGID GraphQL
      { data: { namespace: { workItem: { id: "gid://gitlab/WorkItem/42" } } } },
      // Actual tool's GraphQL call
      { data: finalResponse },
    ];
  }

  describe("list_work_item_emoji_reactions", () => {
    it("resolves the work-item GID then queries awardEmojis", async () => {
      const cap = captureGraphQLSequence(
        workItemMockFor({ awardEmojis: { nodes: [{ name: "thumbsup" }] } }),
      );

      const result = await client.callTool({
        name: "list_work_item_emoji_reactions",
        arguments: { project_id: "my-group/my-project", iid: 42 },
      });

      expect(cap.urls).toHaveLength(3);
      const body = cap.lastGraphQLBody();
      expect(body?.query).toContain("awardEmojis");
      expect(body?.variables.awardableId).toBe("gid://gitlab/WorkItem/42");
      const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
      expect(data[0].name).toBe("thumbsup");
    });
  });

  describe("create_work_item_emoji_reaction", () => {
    it("mutates awardEmojiAdd with the work-item GID and name", async () => {
      const cap = captureGraphQLSequence(
        workItemMockFor({
          awardEmojiAdd: { awardEmoji: { name: "rocket" }, errors: [] },
        }),
      );

      await client.callTool({
        name: "create_work_item_emoji_reaction",
        arguments: { project_id: "my-group/my-project", iid: 42, name: "rocket" },
      });

      const body = cap.lastGraphQLBody();
      expect(body?.query).toContain("awardEmojiAdd");
      expect(body?.variables.awardableId).toBe("gid://gitlab/WorkItem/42");
      expect(body?.variables.name).toBe("rocket");
    });

    it("throws on awardEmojiAdd errors", async () => {
      captureGraphQLSequence(
        workItemMockFor({
          awardEmojiAdd: { awardEmoji: null, errors: ["Emoji already awarded"] },
        }),
      );

      const result = await client.callTool({
        name: "create_work_item_emoji_reaction",
        arguments: { project_id: "p", iid: 42, name: "thumbsup" },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Emoji already awarded");
    });
  });

  describe("delete_work_item_emoji_reaction", () => {
    it("mutates awardEmojiRemove by name (not by award_id)", async () => {
      const cap = captureGraphQLSequence(workItemMockFor({ awardEmojiRemove: { errors: [] } }));

      await client.callTool({
        name: "delete_work_item_emoji_reaction",
        arguments: { project_id: "p", iid: 42, name: "thumbsup" },
      });

      const body = cap.lastGraphQLBody();
      expect(body?.query).toContain("awardEmojiRemove");
      expect(body?.variables.awardableId).toBe("gid://gitlab/WorkItem/42");
      expect(body?.variables.name).toBe("thumbsup");
    });
  });

  describe("list_work_item_note_emoji_reactions", () => {
    it("queries awardEmojis against the note GID (not the work-item GID)", async () => {
      const cap = captureGraphQLSequence(workItemMockFor({ awardEmojis: { nodes: [] } }));

      await client.callTool({
        name: "list_work_item_note_emoji_reactions",
        arguments: {
          project_id: "p",
          iid: 42,
          note_id: "gid://gitlab/Note/123",
        },
      });

      const body = cap.lastGraphQLBody();
      expect(body?.variables.awardableId).toBe("gid://gitlab/Note/123");
    });
  });

  describe("create_work_item_note_emoji_reaction", () => {
    it("mutates awardEmojiAdd against the note GID", async () => {
      const cap = captureGraphQLSequence(
        workItemMockFor({
          awardEmojiAdd: { awardEmoji: { name: "eyes" }, errors: [] },
        }),
      );

      await client.callTool({
        name: "create_work_item_note_emoji_reaction",
        arguments: {
          project_id: "p",
          iid: 42,
          note_id: "gid://gitlab/Note/123",
          name: "eyes",
        },
      });

      const body = cap.lastGraphQLBody();
      expect(body?.query).toContain("awardEmojiAdd");
      expect(body?.variables.awardableId).toBe("gid://gitlab/Note/123");
      expect(body?.variables.name).toBe("eyes");
    });
  });

  describe("delete_work_item_note_emoji_reaction", () => {
    it("mutates awardEmojiRemove against the note GID by name", async () => {
      const cap = captureGraphQLSequence(workItemMockFor({ awardEmojiRemove: { errors: [] } }));

      await client.callTool({
        name: "delete_work_item_note_emoji_reaction",
        arguments: {
          project_id: "p",
          iid: 42,
          note_id: "gid://gitlab/Note/123",
          name: "eyes",
        },
      });

      const body = cap.lastGraphQLBody();
      expect(body?.query).toContain("awardEmojiRemove");
      expect(body?.variables.awardableId).toBe("gid://gitlab/Note/123");
      expect(body?.variables.name).toBe("eyes");
    });
  });
});

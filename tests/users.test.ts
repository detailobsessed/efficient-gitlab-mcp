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

  describe("get_current_user", () => {
    it("hits /user with no extra params", async () => {
      let capturedUrl: string | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve('{"id": 42, "username": "ismart", "name": "Ismar Iljazovic"}'),
          headers: new Headers(),
        } as Response);
      });

      const result = await client.callTool({
        name: "get_current_user",
        arguments: {},
      });
      const text = (result.content as TextContent)[0].text;

      // Hit /user (singular) not /users (plural).
      expect(capturedUrl).toBe("https://gitlab.com/api/v4/user");
      expect(text).toContain("ismart");
      expect(text).toContain("42");
    });
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

  describe("health_check (DOT-543)", () => {
    it("reports status:ok and authenticated:true when /user returns 200", async () => {
      let capturedUrl: string | undefined;
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"id": 1, "username": "ismart"}'),
          headers: new Headers(),
        } as Response);
      });

      const result = await client.callTool({
        name: "health_check",
        arguments: {},
      });
      const text = (result.content as TextContent)[0].text;
      const parsed = JSON.parse(text);

      expect(capturedUrl).toBe("https://gitlab.com/api/v4/user");
      expect(parsed.status).toBe("ok");
      expect(parsed.authenticated).toBe(true);
      expect(typeof parsed.gitlab_url).toBe("string");
      expect(parsed.gitlab_url.length).toBeGreaterThan(0);
    });

    it("reports status:error and authenticated:false on 401", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: () => Promise.resolve('{"message": "401 Unauthorized"}'),
          headers: new Headers(),
        } as Response),
      );

      const result = await client.callTool({
        name: "health_check",
        arguments: {},
      });
      const text = (result.content as TextContent)[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.status).toBe("error");
      expect(parsed.authenticated).toBe(false);
      expect(typeof parsed.gitlab_url).toBe("string");
    });

    it("reports status:error on network failure (does not throw)", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() => Promise.reject(new Error("ECONNREFUSED")));

      const result = await client.callTool({
        name: "health_check",
        arguments: {},
      });
      const text = (result.content as TextContent)[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.status).toBe("error");
      expect(parsed.authenticated).toBe(false);
    });
  });

  describe("get_current_user field projection (Phase 3b / DOT-560)", () => {
    const fullUser = {
      id: 42,
      name: "Ismar",
      username: "ismart",
      state: "active",
      avatar_url: null,
      web_url: "https://gitlab.example/ismart",
      created_at: "2020-01-01T00:00:00Z",
      bot: false,
      // Privacy-sensitive — must be absent from default slim output:
      email: "ismart@example.com",
      last_sign_in_at: "2026-05-15T08:00:00Z",
      confirmed_at: "2020-01-01T00:00:00Z",
      last_activity_on: "2026-05-15",
      two_factor_enabled: true,
      current_sign_in_at: "2026-05-15T08:00:00Z",
      is_admin: false,
      private_profile: false,
      external: false,
    };

    function mockUserResponse(user: Record<string, unknown>) {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(user)),
        } as Response),
      );
    }

    it("returns identity-only fields by default (privacy fields stripped)", async () => {
      mockUserResponse(fullUser);
      const result = await client.callTool({ name: "get_current_user", arguments: {} });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data.username).toBe("ismart");
      expect(data.bot).toBe(false);
      // Privacy guardrail
      expect(data.email).toBeUndefined();
      expect(data.last_sign_in_at).toBeUndefined();
      expect(data.is_admin).toBeUndefined();
      expect(data.two_factor_enabled).toBeUndefined();
      expect(data.current_sign_in_at).toBeUndefined();
      expect(data.private_profile).toBeUndefined();
    });

    it('exposes privacy fields when fields="all"', async () => {
      mockUserResponse(fullUser);
      const result = await client.callTool({
        name: "get_current_user",
        arguments: { fields: "all" },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data.email).toBe("ismart@example.com");
      expect(data.is_admin).toBe(false);
      expect(data.two_factor_enabled).toBe(true);
    });

    it("returns exactly the requested fields for a custom list", async () => {
      mockUserResponse(fullUser);
      const result = await client.callTool({
        name: "get_current_user",
        arguments: { fields: ["id", "username", "email"] },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(Object.keys(data).sort()).toEqual(["email", "id", "username"]);
      expect(data.email).toBe("ismart@example.com");
    });
  });

  describe("get_user field projection (Phase 3b / DOT-560)", () => {
    const fullUser = {
      id: 7,
      name: "Alice",
      username: "alice",
      state: "active",
      avatar_url: null,
      web_url: "https://gitlab.example/alice",
      bot: false,
      bio: "Engineer",
      location: "Berlin",
      organization: "ACME",
      job_title: "SWE",
      pronouns: "they/them",
      work_information: "info",
      followers: 12,
      following: 5,
      created_at: "2021-06-01T00:00:00Z",
    };

    function mockUserResponse(user: Record<string, unknown>) {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(user)),
        } as Response),
      );
    }

    it("returns only identity-default fields by default", async () => {
      mockUserResponse(fullUser);
      const result = await client.callTool({
        name: "get_user",
        arguments: { user_id: 7 },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data.id).toBe(7);
      expect(data.username).toBe("alice");
      // Bloat dropped
      expect(data.bio).toBeUndefined();
      expect(data.organization).toBeUndefined();
      expect(data.followers).toBeUndefined();
      expect(data.created_at).toBeUndefined();
    });

    it('returns the full payload when fields="all"', async () => {
      mockUserResponse(fullUser);
      const result = await client.callTool({
        name: "get_user",
        arguments: { user_id: 7, fields: "all" },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data.bio).toBe("Engineer");
      expect(data.followers).toBe(12);
    });

    it("returns exactly the requested fields for a custom list", async () => {
      mockUserResponse(fullUser);
      const result = await client.callTool({
        name: "get_user",
        arguments: { user_id: 7, fields: ["id", "name"] },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(Object.keys(data).sort()).toEqual(["id", "name"]);
    });
  });

  describe("get_users field projection (Phase 3b / DOT-560)", () => {
    function mockPerUsername(byUsername: Record<string, Record<string, unknown> | null>) {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string) => {
        const match = url.match(/username=([^&]+)/);
        const username = match ? decodeURIComponent(match[1]) : "";
        const user = byUsername[username];
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(user ? [user] : [])),
        } as Response);
      });
    }

    const alice = {
      id: 1,
      username: "alice",
      name: "Alice",
      state: "active",
      avatar_url: null,
      web_url: "https://gitlab.example/alice",
      bot: false,
      bio: "Engineer",
      organization: "ACME",
    };

    it("slims each value in the map by default", async () => {
      mockPerUsername({ alice, unknown: null });
      const result = await client.callTool({
        name: "get_users",
        arguments: { usernames: ["alice", "unknown"] },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data.alice.username).toBe("alice");
      expect(data.alice.bio).toBeUndefined();
      expect(data.alice.organization).toBeUndefined();
      // null preserved for unresolved usernames
      expect(data.unknown).toBeNull();
    });

    it('preserves bloat when fields="all"', async () => {
      mockPerUsername({ alice });
      const result = await client.callTool({
        name: "get_users",
        arguments: { usernames: ["alice"], fields: "all" },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data.alice.bio).toBe("Engineer");
      expect(data.alice.organization).toBe("ACME");
    });

    it("returns exactly the requested fields for a custom list", async () => {
      mockPerUsername({ alice });
      const result = await client.callTool({
        name: "get_users",
        arguments: { usernames: ["alice"], fields: ["id", "username"] },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(Object.keys(data.alice).sort()).toEqual(["id", "username"]);
    });
  });

  describe("search_users field projection (Phase 3b / DOT-560)", () => {
    function mockUsersResponse(users: Record<string, unknown>[]) {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(users)),
        } as Response),
      );
    }

    const matches = [
      {
        id: 1,
        username: "alice",
        name: "Alice",
        state: "active",
        avatar_url: null,
        web_url: "https://gitlab.example/alice",
        bot: false,
        bio: "Engineer",
        organization: "ACME",
      },
      {
        id: 2,
        username: "alex",
        name: "Alex",
        state: "active",
        avatar_url: null,
        web_url: "https://gitlab.example/alex",
        bot: false,
        bio: "Designer",
        organization: "Globex",
      },
    ];

    it("slims each match by default", async () => {
      mockUsersResponse(matches);
      const result = await client.callTool({
        name: "search_users",
        arguments: { search: "al" },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data).toHaveLength(2);
      expect(data[0].username).toBe("alice");
      expect(data[0].bio).toBeUndefined();
      expect(data[1].organization).toBeUndefined();
    });

    it('preserves bloat when fields="all"', async () => {
      mockUsersResponse(matches);
      const result = await client.callTool({
        name: "search_users",
        arguments: { search: "al", fields: "all" },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(data[0].bio).toBe("Engineer");
    });

    it("respects a caller-supplied field allow-list", async () => {
      mockUsersResponse(matches);
      const result = await client.callTool({
        name: "search_users",
        arguments: { search: "al", fields: ["id", "username"] },
      });
      const data = JSON.parse((result.content as TextContent)[0].text);
      expect(Object.keys(data[0]).sort()).toEqual(["id", "username"]);
    });

    it("does not forward the fields param to GitLab as a query string", async () => {
      let capturedUrl: string | undefined;
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(matches)),
        } as Response);
      });
      await client.callTool({
        name: "search_users",
        arguments: { search: "al", fields: ["id"] },
      });
      // `fields` is a server-side projection param, not a GitLab API param
      expect(capturedUrl).not.toContain("fields=");
    });
  });
});

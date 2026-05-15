import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisclosureTools, type ToolsByCategory } from "../src/registry/index.js";
import { registerWorkItemTools } from "../src/tools/work-items.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

// Helper: create a mock fetch that tracks calls and returns canned responses
function createMockFetch(responses: Array<{ data: unknown }>) {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  let callIndex = 0;

  const mockFn = mock((_url: string, options?: RequestInit) => {
    calls.push({
      url: _url,
      method: options?.method ?? "GET",
      body: typeof options?.body === "string" ? options.body : "",
    });
    const response = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(response)),
      json: () => Promise.resolve(response),
    } as Response);
  });

  return { mockFn, calls };
}

describe("Work Item Tools Handlers", () => {
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
    const workItemTools = registerWorkItemTools(server, logger);
    for (const tool of workItemTools.values()) tool.enable();
    toolsByCategory.set("work-items", workItemTools);
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

  describe("get_work_item", () => {
    it("should resolve project path and query GraphQL", async () => {
      const { mockFn, calls } = createMockFetch([
        // 1st call: REST resolve project path
        { data: { path_with_namespace: "my-group/my-project" } },
        // 2nd call: GraphQL get work item
        {
          data: {
            namespace: {
              workItem: {
                id: "gid://gitlab/WorkItem/1",
                iid: "42",
                title: "Fix login",
                state: "OPEN",
                description: "Login is broken",
                webUrl: "https://gitlab.com/my-group/my-project/-/work_items/42",
                confidential: false,
                author: { username: "dev1" },
                createdAt: "2026-01-01T00:00:00Z",
                closedAt: null,
                workItemType: { name: "Issue" },
                widgets: [],
              },
            },
          },
        },
      ]);

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mockFn;

      const result = await client.callTool({
        name: "get_work_item",
        arguments: { project_id: "my-group/my-project", iid: 42 },
      });

      // First call should be REST to resolve project path
      expect(calls[0].url).toContain("/projects/my-group%2Fmy-project");
      expect(calls[0].method).toBe("GET");

      // Second call should be GraphQL
      expect(calls[1].url).toContain("/api/graphql");
      expect(calls[1].method).toBe("POST");
      const gqlBody = JSON.parse(calls[1].body);
      expect(gqlBody.query).toContain("workItem(iid:");

      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.title).toBe("Fix login");
      expect(parsed.type).toBe("Issue");
      expect(parsed.author).toBe("dev1");
    });
  });

  describe("list_work_items", () => {
    it("should query with filters and return flattened items", async () => {
      const { mockFn, calls } = createMockFetch([
        // REST resolve project path
        { data: { path_with_namespace: "my-group/my-project" } },
        // GraphQL list work items
        {
          data: {
            project: {
              workItems: {
                nodes: [
                  {
                    id: "gid://gitlab/WorkItem/1",
                    iid: "10",
                    title: "Task 1",
                    state: "OPEN",
                    webUrl: "https://gitlab.com/issues/10",
                    workItemType: { name: "Task" },
                    widgets: [],
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      ]);

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mockFn;

      const result = await client.callTool({
        name: "list_work_items",
        arguments: {
          project_id: "my-group/my-project",
          types: ["task"],
          state: "opened",
        },
      });

      expect(calls[1].method).toBe("POST");
      const gqlBody = JSON.parse(calls[1].body);
      expect(gqlBody.variables.types).toEqual(["TASK"]);
      expect(gqlBody.variables.state).toBe("opened");

      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].title).toBe("Task 1");
      expect(parsed.items[0].type).toBe("Task");
    });

    it("coerces JSON-stringified arrays for label_names + assignee_usernames", async () => {
      // Regression for DOT-554: LLMs sometimes serialize arrays as JSON strings
      // when filling MCP tool parameters. coerceStringArray accepts either form
      // and normalises to an array, matching behavior already in place for
      // `labels` everywhere else in the fork.
      const { mockFn, calls } = createMockFetch([
        // REST resolve project path
        { data: { path_with_namespace: "my-group/my-project" } },
        // GraphQL list work items
        {
          data: {
            project: {
              workItems: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      ]);

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mockFn;

      await client.callTool({
        name: "list_work_items",
        arguments: {
          project_id: "my-group/my-project",
          label_names: '["bug","critical"]',
          assignee_usernames: '["alice","bob"]',
        },
      });

      const gqlBody = JSON.parse(calls[1].body);
      expect(gqlBody.variables.labelName).toEqual(["bug", "critical"]);
      expect(gqlBody.variables.assigneeUsernames).toEqual(["alice", "bob"]);
    });
  });

  describe("create_work_item", () => {
    it("should resolve type GID and create via GraphQL mutation", async () => {
      const { mockFn, calls } = createMockFetch([
        // REST resolve project path
        { data: { path_with_namespace: "my-group/my-project" } },
        // GraphQL resolve work item type GID
        {
          data: {
            namespace: {
              workItemTypes: {
                nodes: [{ id: "gid://gitlab/WorkItemType/1", name: "Task" }],
              },
            },
          },
        },
        // GraphQL create work item mutation (no label/user resolution needed)
        {
          data: {
            workItemCreate: {
              workItem: {
                id: "gid://gitlab/WorkItem/99",
                iid: "99",
                title: "New task",
                webUrl: "https://gitlab.com/issues/99",
                workItemType: { name: "Task" },
              },
              errors: [],
            },
          },
        },
      ]);

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mockFn;

      const result = await client.callTool({
        name: "create_work_item",
        arguments: {
          project_id: "my-group/my-project",
          title: "New task",
          type: "task",
        },
      });

      // Should have made 3 fetch calls (no labels/users to resolve)
      expect(calls.length).toBe(3);

      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.title).toBe("New task");
      expect(parsed.type).toBe("Task");
      expect(parsed.iid).toBe("99");
    });
  });

  describe("convert_work_item_type", () => {
    it("should convert via GraphQL mutation", async () => {
      const { mockFn } = createMockFetch([
        // REST resolve project path
        { data: { path_with_namespace: "my-group/my-project" } },
        // GraphQL resolve work item GID
        {
          data: {
            namespace: { workItem: { id: "gid://gitlab/WorkItem/1" } },
          },
        },
        // GraphQL resolve target type GID
        {
          data: {
            namespace: {
              workItemTypes: {
                nodes: [{ id: "gid://gitlab/WorkItemType/2", name: "Task" }],
              },
            },
          },
        },
        // GraphQL convert mutation
        {
          data: {
            workItemConvert: {
              workItem: {
                id: "gid://gitlab/WorkItem/1",
                workItemType: { name: "Task" },
              },
              errors: [],
            },
          },
        },
      ]);

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mockFn;

      const result = await client.callTool({
        name: "convert_work_item_type",
        arguments: {
          project_id: "my-group/my-project",
          iid: 1,
          new_type: "task",
        },
      });

      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.type).toBe("Task");
    });
  });

  describe("get_timeline_events", () => {
    it("should fetch incident timeline events", async () => {
      const { mockFn } = createMockFetch([
        // REST resolve project path
        { data: { path_with_namespace: "my-group/my-project" } },
        // GraphQL resolve work item GID
        {
          data: {
            namespace: { workItem: { id: "gid://gitlab/WorkItem/5" } },
          },
        },
        // GraphQL get timeline events
        {
          data: {
            project: {
              incidentManagementTimelineEvents: {
                nodes: [
                  {
                    id: "gid://gitlab/TimelineEvent/1",
                    note: "Incident started",
                    noteHtml: "<p>Incident started</p>",
                    action: "comment",
                    occurredAt: "2026-01-01T00:00:00Z",
                    createdAt: "2026-01-01T00:01:00Z",
                    timelineEventTags: { nodes: [{ id: "1", name: "Start time" }] },
                  },
                ],
              },
            },
          },
        },
      ]);

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mockFn;

      const result = await client.callTool({
        name: "get_timeline_events",
        arguments: { project_id: "my-group/my-project", incident_iid: 5 },
      });

      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].note).toBe("Incident started");
      expect(parsed[0].tags).toEqual(["Start time"]);
    });
  });

  describe("tool registration", () => {
    it("should register all 12 work item tools", async () => {
      const testServer = new McpServer(
        { name: "test", version: "1.0.0" },
        { capabilities: { tools: { listChanged: true } } },
      );
      const tools = registerWorkItemTools(testServer, logger);

      expect(tools.size).toBe(12);
      expect(tools.has("get_work_item")).toBe(true);
      expect(tools.has("list_work_items")).toBe(true);
      expect(tools.has("create_work_item")).toBe(true);
      expect(tools.has("update_work_item")).toBe(true);
      expect(tools.has("convert_work_item_type")).toBe(true);
      expect(tools.has("list_work_item_statuses")).toBe(true);
      expect(tools.has("list_custom_field_definitions")).toBe(true);
      expect(tools.has("move_work_item")).toBe(true);
      expect(tools.has("list_work_item_notes")).toBe(true);
      expect(tools.has("create_work_item_note")).toBe(true);
      expect(tools.has("get_timeline_events")).toBe(true);
      expect(tools.has("create_timeline_event")).toBe(true);
    });
  });

  describe("update_work_item with children_to_add missing project_id", () => {
    it("should default child project_id to parent's projectId", async () => {
      const { mockFn, calls } = createMockFetch([
        // 1. REST resolve parent project path
        { data: { path_with_namespace: "my-group/my-project" } },
        // 2. GraphQL resolve parent work item GID
        {
          data: {
            namespace: { workItem: { id: "gid://gitlab/WorkItem/1" } },
          },
        },
        // 3. GraphQL main update mutation (title change)
        {
          data: {
            workItemUpdate: {
              workItem: {
                id: "gid://gitlab/WorkItem/1",
                iid: "1",
                title: "Updated",
                state: "OPEN",
                webUrl: "https://gitlab.com/issues/1",
                workItemType: { name: "Epic" },
                widgets: [],
              },
              errors: [],
            },
          },
        },
        // 4. REST resolve child project path (uses parent's project_id as fallback)
        { data: { path_with_namespace: "my-group/my-project" } },
        // 5. GraphQL resolve child work item GID
        {
          data: {
            namespace: { workItem: { id: "gid://gitlab/WorkItem/50" } },
          },
        },
        // 6. GraphQL add children mutation
        {
          data: {
            workItemUpdate: { errors: [] },
          },
        },
      ]);

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mockFn;

      const result = await client.callTool({
        name: "update_work_item",
        arguments: {
          project_id: "my-group/my-project",
          iid: 1,
          title: "Updated",
          children_to_add: [{ iid: 50 }], // no project_id — should fallback to parent's
        },
      });

      expect(result.isError).toBeFalsy();
      // The child resolution (call 4) should use the parent's project
      expect(calls[3].url).toContain("my-group%2Fmy-project");
    });
  });

  describe("create_work_item incident weight skip", () => {
    it("should not include weightWidget when type is incident", async () => {
      const { mockFn, calls } = createMockFetch([
        // REST resolve project path
        { data: { path_with_namespace: "my-group/my-project" } },
        // GraphQL resolve work item type GID
        {
          data: {
            namespace: {
              workItemTypes: {
                nodes: [{ id: "gid://gitlab/WorkItemType/3", name: "Incident" }],
              },
            },
          },
        },
        // GraphQL create work item mutation
        {
          data: {
            workItemCreate: {
              workItem: {
                id: "gid://gitlab/WorkItem/101",
                iid: "101",
                title: "Server down",
                webUrl: "https://gitlab.com/issues/101",
                workItemType: { name: "Incident" },
              },
              errors: [],
            },
          },
        },
      ]);

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mockFn;

      const result = await client.callTool({
        name: "create_work_item",
        arguments: {
          project_id: "my-group/my-project",
          title: "Server down",
          type: "incident",
          weight: 5, // should be ignored for incidents
        },
      });

      expect(result.isError).toBeFalsy();
      // The create mutation (call index 2) should NOT contain weightWidget
      const createCall = calls[2];
      expect(createCall.body).not.toContain("weightWidget");
      expect(createCall.body).not.toContain("$weight");
    });
  });

  describe("LLM parameter coercion", () => {
    it("should accept JSON-stringified labels array in create_work_item", async () => {
      const { mockFn, calls } = createMockFetch([
        // REST resolve project path
        { data: { path_with_namespace: "my-group/my-project" } },
        // GraphQL resolve work item type GID
        {
          data: {
            namespace: {
              workItemTypes: {
                nodes: [{ id: "gid://gitlab/WorkItemType/1", name: "Issue" }],
              },
            },
          },
        },
        // GraphQL resolve label IDs
        {
          data: {
            project: {
              labels: {
                nodes: [
                  { id: "gid://gitlab/Label/1", title: "bug" },
                  { id: "gid://gitlab/Label/2", title: "urgent" },
                ],
              },
            },
          },
        },
        // GraphQL create work item mutation
        {
          data: {
            workItemCreate: {
              workItem: {
                id: "gid://gitlab/WorkItem/100",
                iid: "100",
                title: "Coerced labels",
                webUrl: "https://gitlab.com/issues/100",
                workItemType: { name: "Issue" },
              },
              errors: [],
            },
          },
        },
      ]);

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mockFn;

      const result = await client.callTool({
        name: "create_work_item",
        arguments: {
          project_id: "my-group/my-project",
          title: "Coerced labels",
          labels: '["bug", "urgent"]', // JSON string instead of array
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.title).toBe("Coerced labels");

      // Verify the GraphQL mutation included labelIds (call index 3 = create mutation)
      const createCall = calls[3];
      expect(createCall.body).toContain("labelIds");
    });
  });
});

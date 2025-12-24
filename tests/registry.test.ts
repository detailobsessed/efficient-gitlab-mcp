import { beforeEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import { createRegistryAdapter } from "../src/registry/tool-adapter.js";
import { ToolRegistry } from "../src/registry/tool-registry.js";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe("registerTool", () => {
    it("should register a tool and update category count", () => {
      registry.registerTool(
        "test_tool",
        "repositories",
        "Test Tool",
        "A test tool",
        { input: z.string() },
        { output: z.boolean() },
        async () => ({
          content: [{ type: "text" as const, text: "ok" }],
        }),
      );

      const categories = registry.listCategories();
      const repositories = categories.find((c) => c.name === "repositories");
      expect(repositories?.toolCount).toBe(1);
    });

    it("should make tool searchable", () => {
      registry.registerTool(
        "create_merge_request",
        "merge-requests",
        "Create Merge Request",
        "Create a new merge request in GitLab",
        { projectId: z.string(), title: z.string() },
        { success: z.boolean() },
        async () => ({
          content: [{ type: "text" as const, text: "created" }],
        }),
      );

      const results = registry.searchTools("merge");
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("create_merge_request");
    });
  });

  describe("listCategories", () => {
    it("should only return categories with tools", () => {
      registry.registerTool("test_tool", "issues", "Test", "Test", {}, {}, async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }));

      const categories = registry.listCategories();
      expect(categories.every((c) => c.toolCount > 0)).toBe(true);
    });

    it("should return empty when no tools registered", () => {
      const categories = registry.listCategories();
      expect(categories.length).toBe(0);
    });
  });

  describe("listTools", () => {
    it("should return tools in a category", () => {
      registry.registerTool(
        "list_pipelines",
        "pipelines",
        "List Pipelines",
        "List pipelines in a project",
        { projectId: z.string() },
        { pipelines: z.array(z.unknown()) },
        async () => ({ content: [{ type: "text" as const, text: "[]" }] }),
      );

      const tools = registry.listTools("pipelines");
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe("list_pipelines");
    });

    it("should be case-insensitive", () => {
      registry.registerTool("test", "issues", "Test", "Test", {}, {}, async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }));

      const tools = registry.listTools("ISSUES");
      expect(tools.length).toBe(1);
    });

    it("should return empty for unknown category", () => {
      const tools = registry.listTools("unknown");
      expect(tools.length).toBe(0);
    });
  });

  describe("searchTools", () => {
    beforeEach(() => {
      registry.registerTool(
        "create_issue",
        "issues",
        "Create Issue",
        "Create a new issue in GitLab",
        {},
        {},
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );
      registry.registerTool(
        "list_pipelines",
        "pipelines",
        "List Pipelines",
        "List CI/CD pipelines for a project",
        {},
        {},
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );
    });

    it("should find tools by name", () => {
      const results = registry.searchTools("pipeline");
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("list_pipelines");
    });

    it("should find tools by description", () => {
      const results = registry.searchTools("GitLab");
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("create_issue");
    });

    it("should respect limit", () => {
      const results = registry.searchTools("a", 1);
      expect(results.length).toBe(1);
    });

    it("should return empty for no matches", () => {
      const results = registry.searchTools("nonexistent");
      expect(results.length).toBe(0);
    });
  });

  describe("getToolSchema", () => {
    it("should return full schema for a tool", () => {
      registry.registerTool(
        "test_tool",
        "repositories",
        "Test Tool",
        "A test tool",
        { input: z.string().describe("The input") },
        { output: z.boolean() },
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );

      const schema = registry.getToolSchema("test_tool");
      expect(schema).not.toBeNull();
      expect(schema?.name).toBe("test_tool");
      expect(schema?.category).toBe("repositories");
    });

    it("should return null for unknown tool", () => {
      const schema = registry.getToolSchema("unknown");
      expect(schema).toBeNull();
    });
  });

  describe("getHandler", () => {
    it("should return handler that can be executed", async () => {
      registry.registerTool(
        "test_tool",
        "repositories",
        "Test Tool",
        "A test tool",
        {},
        {},
        async () => ({
          content: [{ type: "text" as const, text: "executed" }],
          structuredContent: { success: true },
        }),
      );

      const handler = registry.getHandler("test_tool");
      expect(handler).toBeDefined();

      const result = await handler?.({});
      expect(result?.content[0].text).toBe("executed");
      expect(result?.structuredContent?.success).toBe(true);
    });

    it("should return null for unknown tool", () => {
      const handler = registry.getHandler("unknown");
      expect(handler).toBeNull();
    });
  });

  describe("hasTool", () => {
    it("should return true for registered tool", () => {
      registry.registerTool("test", "issues", "Test", "Test", {}, {}, async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }));

      expect(registry.hasTool("test")).toBe(true);
    });

    it("should return false for unknown tool", () => {
      expect(registry.hasTool("unknown")).toBe(false);
    });
  });

  describe("getAllToolNames", () => {
    it("should return all registered tool names", () => {
      registry.registerTool("tool1", "issues", "Tool 1", "Test", {}, {}, async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }));
      registry.registerTool("tool2", "pipelines", "Tool 2", "Test", {}, {}, async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }));

      const names = registry.getAllToolNames();
      expect(names).toContain("tool1");
      expect(names).toContain("tool2");
      expect(names.length).toBe(2);
    });
  });

  describe("serializeSchema", () => {
    it("should serialize string schema", () => {
      const schema = { name: z.string() };
      const serialized = registry.serializeSchema(schema);
      expect(serialized.name).toEqual({ type: "string" });
    });

    it("should serialize number schema", () => {
      const schema = { count: z.number() };
      const serialized = registry.serializeSchema(schema);
      expect(serialized.count).toEqual({ type: "number" });
    });

    it("should serialize boolean schema", () => {
      const schema = { active: z.boolean() };
      const serialized = registry.serializeSchema(schema);
      expect(serialized.active).toEqual({ type: "boolean" });
    });

    it("should serialize optional schema", () => {
      const schema = { name: z.string().optional() };
      const serialized = registry.serializeSchema(schema);
      expect((serialized.name as Record<string, unknown>).optional).toBe(true);
    });

    it("should serialize enum schema", () => {
      const schema = { status: z.enum(["open", "closed"]) };
      const serialized = registry.serializeSchema(schema);
      expect((serialized.status as Record<string, unknown>).enum).toEqual(["open", "closed"]);
    });
  });
});

describe("RegistryAdapter", () => {
  it("should forward registrations to registry", () => {
    const registry = new ToolRegistry();
    const adapter = createRegistryAdapter(registry, "merge-requests");

    adapter.registerTool(
      "create_merge_request",
      {
        title: "Create Merge Request",
        description: "Create a new merge request",
        inputSchema: { title: z.string() },
        outputSchema: { success: z.boolean() },
      },
      async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
    );

    expect(registry.hasTool("create_merge_request")).toBe(true);
    const schema = registry.getToolSchema("create_merge_request");
    expect(schema?.category).toBe("merge-requests");
  });

  it("should handle tools without output schema", () => {
    const registry = new ToolRegistry();
    const adapter = createRegistryAdapter(registry, "issues");

    adapter.registerTool(
      "delete_issue",
      {
        title: "Delete Issue",
        description: "Delete an issue",
        inputSchema: { issueId: z.string() },
      },
      async () => ({ content: [{ type: "text" as const, text: "deleted" }] }),
    );

    expect(registry.hasTool("delete_issue")).toBe(true);
  });
});

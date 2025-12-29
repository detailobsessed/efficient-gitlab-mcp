/**
 * Meta-tools for Progressive Disclosure
 *
 * These 5 tools replace 100+ individual tool registrations, dramatically reducing
 * token consumption when the LLM loads the tool list.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { Logger } from "../utils/logger.js";
import type { ToolRegistry } from "./tool-registry.js";

export function registerMetaTools(server: McpServer, registry: ToolRegistry, logger: Logger): void {
  // 1. List Categories
  server.registerTool(
    "list_categories",
    {
      title: "List Tool Categories",
      description:
        "List all available GitLab tool categories. Start here to discover what operations are available.",
      inputSchema: {},
      outputSchema: {
        categories: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            toolCount: z.number(),
          }),
        ),
      },
      annotations: {
        title: "List Tool Categories",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const categories = registry.listCategories();

      logger.info("Listed categories", { count: categories.length });

      return {
        content: [
          {
            type: "text" as const,
            text: `Available categories:\n${categories.map((c) => `- **${c.name}** (${c.toolCount} tools): ${c.description}`).join("\n")}`,
          },
        ],
        structuredContent: { categories },
      };
    },
  );

  // 2. List Tools in Category
  server.registerTool(
    "list_tools",
    {
      title: "List Tools in Category",
      description:
        "List all tools available in a specific category. Use list_categories first to see available categories.",
      inputSchema: {
        category: z
          .string()
          .describe("Category name (e.g., 'repositories', 'merge-requests', 'issues')"),
      },
      outputSchema: {
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
          }),
        ),
      },
      annotations: {
        title: "List Tools in Category",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ category }) => {
      const tools = registry.listTools(category as string);

      if (tools.length === 0) {
        const available = registry
          .listCategories()
          .map((c) => c.name)
          .join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: `Category '${category}' not found or has no tools. Available categories: ${available}`,
            },
          ],
          structuredContent: { tools: [] },
          isError: true,
        };
      }

      logger.info("Listed tools", { category, count: tools.length });

      return {
        content: [
          {
            type: "text" as const,
            text: `Tools in ${category}:\n${tools.map((t) => `- **${t.name}**: ${t.description}`).join("\n")}`,
          },
        ],
        structuredContent: { tools },
      };
    },
  );

  // 3. Search Tools
  server.registerTool(
    "search_tools",
    {
      title: "Search Tools",
      description:
        "Search for tools by keyword across all categories. Useful when you know what you want to do but not which category it's in.",
      inputSchema: {
        query: z.string().describe("Search term (e.g., 'merge', 'pipeline', 'issue')"),
        limit: z.number().int().min(1).max(50).default(20).describe("Maximum results to return"),
      },
      outputSchema: {
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
          }),
        ),
      },
      annotations: {
        title: "Search Tools",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit }) => {
      const tools = registry.searchTools(query as string, (limit as number) || 20);

      logger.info("Searched tools", { query, results: tools.length });

      if (tools.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No tools found matching '${query}'. Try a different search term or use list_categories to browse.`,
            },
          ],
          structuredContent: { tools: [] },
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${tools.length} tool(s) matching '${query}':\n${tools.map((t) => `- **${t.name}**: ${t.description}`).join("\n")}`,
          },
        ],
        structuredContent: { tools },
      };
    },
  );

  // 4. Get Tool Schema
  server.registerTool(
    "get_tool_schema",
    {
      title: "Get Tool Schema",
      description:
        "Get the full input/output schema for a specific tool. Use this before calling execute_tool to understand required parameters.",
      inputSchema: {
        toolName: z.string().describe("Tool name (e.g., 'create_merge_request', 'list_issues')"),
      },
      outputSchema: {
        name: z.string(),
        title: z.string(),
        description: z.string(),
        category: z.string(),
        inputSchema: z.record(z.unknown()),
        outputSchema: z.record(z.unknown()),
      },
      annotations: {
        title: "Get Tool Schema",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ toolName }) => {
      const schema = registry.getToolSchema(toolName as string);

      if (!schema) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Tool '${toolName}' not found. Use search_tools or list_tools to find valid tool names.`,
            },
          ],
          isError: true,
        };
      }

      logger.info("Got tool schema", { toolName });

      // Serialize Zod schemas to JSON-compatible format
      const serializedInput = registry.serializeSchema(schema.inputSchema);
      const serializedOutput = registry.serializeSchema(schema.outputSchema);

      return {
        content: [
          {
            type: "text" as const,
            text: `## ${schema.title}\n\n${schema.description}\n\n**Category:** ${schema.category}\n\n**Input Parameters:**\n\`\`\`json\n${JSON.stringify(serializedInput, null, 2)}\n\`\`\`\n\n**Output:**\n\`\`\`json\n${JSON.stringify(serializedOutput, null, 2)}\n\`\`\``,
          },
        ],
        structuredContent: {
          name: schema.name,
          title: schema.title,
          description: schema.description,
          category: schema.category,
          inputSchema: serializedInput,
          outputSchema: serializedOutput,
        },
      };
    },
  );

  // 5. Execute Tool
  server.registerTool(
    "execute_tool",
    {
      title: "Execute GitLab Tool",
      description:
        "Execute a GitLab tool by name with the provided parameters. Use get_tool_schema first to see required parameters.",
      inputSchema: {
        toolName: z.string().describe("Tool name to execute"),
        params: z.record(z.unknown()).default({}).describe("Tool parameters as key-value pairs"),
      },
      annotations: {
        title: "Execute GitLab Tool",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ toolName, params }) => {
      const handler = registry.getHandler(toolName as string);

      if (!handler) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Tool '${toolName}' not found. Use search_tools or list_tools to find valid tool names.`,
            },
          ],
          structuredContent: {
            success: false,
            error: `Tool '${toolName}' not found`,
          },
          isError: true,
        };
      }

      logger.info("Executing tool", { toolName, params });

      try {
        const result = await handler(params as Record<string, unknown>);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Tool execution failed", {
          toolName,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Tool execution failed: ${errorMessage}`,
            },
          ],
          structuredContent: {
            success: false,
            error: errorMessage,
          },
          isError: true,
        };
      }
    },
  );

  logger.info("Registered meta-tools for progressive disclosure", {
    totalTools: registry.getAllToolNames().length,
    categories: registry.listCategories().length,
  });
}

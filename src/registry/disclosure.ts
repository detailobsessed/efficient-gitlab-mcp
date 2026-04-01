/**
 * SDK-Native Progressive Disclosure
 *
 * Registers 2 meta-tools that leverage the MCP SDK's native enable()/disable()
 * and notifications/tools/list_changed to progressively expose GitLab tools.
 *
 * On startup, all GitLab tools are registered but disabled. The LLM sees only:
 *   - list_categories: discover available tool categories
 *   - activate_tools: enable tools in a category (triggers tools/list_changed)
 */

import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Logger } from "../utils/logger.js";
import { CATEGORIES } from "./categories.js";

export type ToolsByCategory = Map<string, Map<string, RegisteredTool>>;

function activateCategories(
  categoryNames: string[],
  toolsByCategory: ToolsByCategory,
): { enabled: string[]; notFound: string[] } {
  const enabled: string[] = [];
  const notFound: string[] = [];

  for (const name of categoryNames) {
    const tools = toolsByCategory.get(name);
    if (!tools) {
      notFound.push(name);
      continue;
    }
    for (const [toolName, tool] of tools) {
      if (!tool.enabled) {
        tool.enable();
        enabled.push(toolName);
      }
    }
  }

  return { enabled, notFound };
}

function formatActivationResult(
  enabled: string[],
  notFound: string[],
  toolsByCategory: ToolsByCategory,
): string {
  const lines: string[] = [];
  if (enabled.length > 0) {
    lines.push(`Enabled ${enabled.length} tool(s): ${enabled.join(", ")}`);
  }
  if (notFound.length > 0) {
    const available = Array.from(toolsByCategory.keys()).join(", ");
    lines.push(`Unknown categories: ${notFound.join(", ")}. Available: ${available}`);
  }
  if (enabled.length === 0 && notFound.length === 0) {
    lines.push("All tools in the requested categories are already active.");
  }
  return lines.join("\n");
}

export function registerDisclosureTools(
  server: McpServer,
  toolsByCategory: ToolsByCategory,
  logger: Logger,
): void {
  server.registerTool(
    "list_categories",
    {
      title: "List Tool Categories",
      description:
        "List all available GitLab tool categories. Start here to discover what operations are available, then use activate_tools to enable a category.",
      annotations: {
        title: "List Tool Categories",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const categories = CATEGORIES.filter((cat) => toolsByCategory.has(cat.name)).map((cat) => {
        const tools = toolsByCategory.get(cat.name);
        const toolCount = tools?.size ?? 0;
        const enabledCount = tools ? Array.from(tools.values()).filter((t) => t.enabled).length : 0;
        return {
          name: cat.name,
          description: cat.description,
          toolCount,
          enabledCount,
        };
      });

      logger.info("Listed categories", { count: categories.length });

      return {
        content: [
          {
            type: "text" as const,
            text: categories
              .map(
                (c) =>
                  `- **${c.name}** (${c.toolCount} tools${c.enabledCount > 0 ? `, ${c.enabledCount} active` : ""}): ${c.description}`,
              )
              .join("\n"),
          },
        ],
      };
    },
  );

  server.registerTool(
    "activate_tools",
    {
      title: "Activate Tool Category",
      description:
        "Enable all tools in one or more categories. After activation, the tools will appear in your tool list automatically.",
      inputSchema: {
        categories: z
          .array(z.string())
          .describe("Category names to activate (e.g., ['issues', 'merge-requests'])"),
      },
      annotations: {
        title: "Activate Tool Category",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ categories: categoryNames }) => {
      const names = categoryNames as string[];
      const { enabled, notFound } = activateCategories(names, toolsByCategory);

      if (enabled.length > 0) {
        server.sendToolListChanged();
      }

      logger.info("Activated tools", {
        categories: names,
        enabledCount: enabled.length,
        notFound,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: formatActivationResult(enabled, notFound, toolsByCategory),
          },
        ],
      };
    },
  );

  logger.info("Registered disclosure meta-tools (list_categories, activate_tools)");
}

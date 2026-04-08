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

function isToolReadOnly(tool: RegisteredTool): boolean {
  return tool.annotations?.readOnlyHint === true;
}

function activateCategories(
  categoryNames: string[],
  toolsByCategory: ToolsByCategory,
  readOnlyMode: boolean,
): { enabled: string[]; skipped: number; notFound: string[] } {
  const enabled: string[] = [];
  let skipped = 0;
  const notFound: string[] = [];

  for (const name of categoryNames) {
    const tools = toolsByCategory.get(name);
    if (!tools) {
      notFound.push(name);
      continue;
    }
    for (const [toolName, tool] of tools) {
      if (readOnlyMode && !isToolReadOnly(tool)) {
        skipped++;
        continue;
      }
      if (!tool.enabled) {
        tool.enable();
        enabled.push(toolName);
      }
    }
  }

  return { enabled, skipped, notFound };
}

function formatActivationResult(
  enabled: string[],
  skipped: number,
  notFound: string[],
  toolsByCategory: ToolsByCategory,
): string {
  const lines: string[] = [];
  if (enabled.length > 0) {
    lines.push(`Enabled ${enabled.length} tool(s): ${enabled.join(", ")}`);
  }
  if (skipped > 0) {
    lines.push(`${skipped} write tool(s) skipped (read-only mode).`);
  }
  if (notFound.length > 0) {
    const available = Array.from(toolsByCategory.keys()).join(", ");
    lines.push(`Unknown categories: ${notFound.join(", ")}. Available: ${available}`);
  }
  if (enabled.length === 0 && notFound.length === 0) {
    if (skipped === 0) {
      lines.push("All tools in the requested categories are already active.");
    } else {
      lines.push("All available read-only tools are already active.");
    }
  }
  return lines.join("\n");
}

export function registerDisclosureTools(
  server: McpServer,
  toolsByCategory: ToolsByCategory,
  logger: Logger,
  readOnlyMode = false,
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
      const categories = CATEGORIES.filter((cat) => toolsByCategory.has(cat.name))
        .map((cat) => {
          const tools = toolsByCategory.get(cat.name);
          const eligible = readOnlyMode
            ? tools
              ? Array.from(tools.values()).filter(isToolReadOnly)
              : []
            : tools
              ? Array.from(tools.values())
              : [];
          const toolCount = eligible.length;
          const enabledCount = eligible.filter((t) => t.enabled).length;
          return {
            name: cat.name,
            description: cat.description,
            toolCount,
            enabledCount,
          };
        })
        .filter((c) => c.toolCount > 0);

      logger.info("Listed categories", { count: categories.length });

      const preamble = readOnlyMode
        ? "**Read-only mode active** — only read operations are available.\n\n"
        : "";

      return {
        content: [
          {
            type: "text" as const,
            text:
              preamble +
              categories
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
      const { enabled, skipped, notFound } = activateCategories(
        names,
        toolsByCategory,
        readOnlyMode,
      );

      if (enabled.length > 0) {
        server.sendToolListChanged();
      }

      logger.info("Activated tools", {
        categories: names,
        enabledCount: enabled.length,
        skipped,
        notFound,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: formatActivationResult(enabled, skipped, notFound, toolsByCategory),
          },
        ],
      };
    },
  );

  logger.info("Registered disclosure meta-tools (list_categories, activate_tools)");
}

/**
 * Tool Registry for Progressive Disclosure
 *
 * Instead of exposing 100+ individual tools to the LLM (consuming massive tokens),
 * we expose only 5 meta-tools that allow the LLM to discover and execute tools on-demand.
 *
 * Pattern inspired by unblu-mcp and efficient-discord-agent-mcp servers.
 */

import type { ZodType } from "zod";

export interface ToolInfo {
  name: string;
  title: string;
  description: string;
  category: string;
  inputSchema: Record<string, ZodType>;
  outputSchema: Record<string, ZodType>;
}

export interface ToolSummary {
  name: string;
  description: string;
}

export interface CategoryInfo {
  name: string;
  description: string;
  toolCount: number;
}

export type ToolHandler = (params: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

interface RegisteredTool {
  info: ToolInfo;
  handler: ToolHandler;
}

/**
 * Registry that indexes all GitLab tools by category for progressive disclosure.
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private categories: Map<string, CategoryInfo> = new Map();
  private toolsByCategory: Map<string, string[]> = new Map();

  constructor() {
    this.initializeCategories();
  }

  private initializeCategories(): void {
    const categoryDefs: Array<{ name: string; description: string }> = [
      {
        name: "repositories",
        description:
          "Search, create, fork repositories. Get file contents, push files, manage branches.",
      },
      {
        name: "merge-requests",
        description:
          "Create, update, merge MRs. List MRs, get diffs, manage discussions and threads.",
      },
      {
        name: "issues",
        description:
          "Create, update, delete issues. List issues, manage issue links and discussions.",
      },
      {
        name: "pipelines",
        description: "List, create, retry, cancel pipelines. Get pipeline jobs and their output.",
      },
      {
        name: "projects",
        description: "Get project details, list projects, manage project members and labels.",
      },
      {
        name: "commits",
        description: "List commits, get commit details and diffs.",
      },
      {
        name: "namespaces",
        description: "List, get, and verify namespaces (groups and users).",
      },
      {
        name: "milestones",
        description: "Create, edit, delete milestones. Get milestone issues and merge requests.",
      },
      {
        name: "wiki",
        description: "List, create, update, delete wiki pages.",
      },
      {
        name: "releases",
        description: "List, create, update, delete releases. Download release assets.",
      },
      {
        name: "users",
        description: "Get user details by username.",
      },
      {
        name: "search",
        description:
          "Global, project, and group search across issues, merge requests, code, commits, and more.",
      },
      {
        name: "notes",
        description:
          "Create and manage notes (comments) on issues and merge requests. Draft notes for MRs.",
      },
      {
        name: "events",
        description: "List user and project events/activity.",
      },
      {
        name: "groups",
        description: "List group projects and iterations.",
      },
    ];

    for (const cat of categoryDefs) {
      this.categories.set(cat.name, {
        name: cat.name,
        description: cat.description,
        toolCount: 0,
      });
      this.toolsByCategory.set(cat.name, []);
    }
  }

  /**
   * Register a tool with the registry.
   */
  registerTool(
    name: string,
    category: string,
    title: string,
    description: string,
    inputSchema: Record<string, ZodType>,
    outputSchema: Record<string, ZodType>,
    handler: ToolHandler,
  ): void {
    const info: ToolInfo = {
      name,
      title,
      description,
      category,
      inputSchema,
      outputSchema,
    };

    this.tools.set(name, { info, handler });

    // Update category
    const categoryTools = this.toolsByCategory.get(category);
    if (categoryTools) {
      categoryTools.push(name);
      const catInfo = this.categories.get(category);
      if (catInfo) {
        catInfo.toolCount++;
      }
    }
  }

  /**
   * List all available categories.
   */
  listCategories(): CategoryInfo[] {
    return Array.from(this.categories.values()).filter((cat) => cat.toolCount > 0);
  }

  /**
   * List tools in a specific category.
   */
  listTools(category: string): ToolSummary[] {
    const toolNames = this.toolsByCategory.get(category.toLowerCase());
    if (!toolNames) {
      return [];
    }

    return toolNames.map((name) => {
      const tool = this.tools.get(name);
      return {
        name,
        description: tool?.info.description || "",
      };
    });
  }

  /**
   * Search tools by keyword.
   */
  searchTools(query: string, limit = 20): ToolSummary[] {
    const queryLower = query.toLowerCase();
    const results: Array<{ score: number; tool: ToolSummary }> = [];

    for (const [name, registered] of this.tools) {
      let score = 0;
      const info = registered.info;

      if (name.toLowerCase().includes(queryLower)) {
        score += 3;
      }
      if (info.title.toLowerCase().includes(queryLower)) {
        score += 2;
      }
      if (info.description.toLowerCase().includes(queryLower)) {
        score += 1;
      }

      if (score > 0) {
        results.push({
          score,
          tool: { name, description: info.description },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map((r) => r.tool);
  }

  /**
   * Get full schema for a specific tool.
   */
  getToolSchema(toolName: string): ToolInfo | null {
    const registered = this.tools.get(toolName);
    return registered?.info || null;
  }

  /**
   * Get the handler for a tool.
   */
  getHandler(toolName: string): ToolHandler | null {
    const registered = this.tools.get(toolName);
    return registered?.handler || null;
  }

  /**
   * Check if a tool exists.
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Get all tool names.
   */
  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Serialize input schema to JSON-compatible format for LLM consumption.
   */
  serializeSchema(schema: Record<string, ZodType>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, zodType] of Object.entries(schema)) {
      result[key] = this.zodToJsonSchema(zodType);
    }

    return result;
  }

  private applyStringChecks(
    schema: Record<string, unknown>,
    checks?: Array<{ kind: string; value?: unknown }>,
  ) {
    if (!checks) return;
    for (const check of checks) {
      if (check.kind === "max") schema.maxLength = check.value;
      if (check.kind === "min") schema.minLength = check.value;
    }
  }

  private handleZodNumber(def: ZodDef): Record<string, unknown> {
    const schema: Record<string, unknown> = { type: "number" };
    for (const check of def.checks || []) {
      if (check.kind === "int") schema.type = "integer";
      if (check.kind === "min") schema.minimum = check.value;
      if (check.kind === "max") schema.maximum = check.value;
    }
    return schema;
  }

  private handleZodArray(def: ZodDef): Record<string, unknown> {
    const schema: Record<string, unknown> = {
      type: "array",
      items: def.type ? this.zodToJsonSchema(def.type) : { type: "unknown" },
    };
    if (def.maxLength) schema.maxItems = def.maxLength.value;
    if (def.minLength) schema.minItems = def.minLength.value;
    return schema;
  }

  private handleZodWrapper(
    def: ZodDef,
    extraProps: Record<string, unknown>,
  ): Record<string, unknown> {
    const schema = (
      def.innerType ? this.zodToJsonSchema(def.innerType) : { type: "unknown" }
    ) as Record<string, unknown>;
    return { ...schema, ...extraProps };
  }

  private zodToJsonSchema(zodType: ZodType): unknown {
    const def = (zodType as unknown as { _def: ZodDef })._def;
    if (!def) return { type: "unknown" };

    const { typeName, description } = def;
    let schema: Record<string, unknown>;

    switch (typeName) {
      case "ZodString":
        schema = { type: "string" };
        this.applyStringChecks(schema, def.checks);
        break;
      case "ZodNumber":
        schema = this.handleZodNumber(def);
        break;
      case "ZodBoolean":
        schema = { type: "boolean" };
        break;
      case "ZodArray":
        schema = this.handleZodArray(def);
        break;
      case "ZodObject":
        schema = { type: "object", properties: def.shape ? this.serializeSchema(def.shape()) : {} };
        break;
      case "ZodOptional":
        schema = this.handleZodWrapper(def, { optional: true });
        break;
      case "ZodDefault":
        schema = this.handleZodWrapper(def, {
          default: def.defaultValue ? def.defaultValue() : undefined,
        });
        break;
      case "ZodEnum":
        schema = { type: "string", enum: def.values };
        break;
      case "ZodUnion":
        schema = {
          oneOf: def.options ? def.options.map((opt: ZodType) => this.zodToJsonSchema(opt)) : [],
        };
        break;
      case "ZodNullable":
        schema = this.handleZodWrapper(def, { nullable: true });
        break;
      default:
        schema = { type: typeName.replace("Zod", "").toLowerCase() };
    }

    if (description) schema.description = description;
    return schema;
  }
}

/** Zod internal definition type */
interface ZodDef {
  typeName: string;
  description?: string;
  checks?: Array<{ kind: string; value?: unknown }>;
  values?: unknown[];
  innerType?: ZodType;
  shape?: () => Record<string, ZodType>;
  type?: ZodType;
  defaultValue?: () => unknown;
  options?: ZodType[];
  minLength?: { value: number };
  maxLength?: { value: number };
}

// Global registry instance
let registryInstance: ToolRegistry | null = null;

export function getRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
  }
  return registryInstance;
}

export function resetRegistry(): void {
  registryInstance = null;
}

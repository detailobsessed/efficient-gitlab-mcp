/**
 * Tool Adapter
 *
 * Provides a compatible interface for existing tool registration functions
 * to register with the ToolRegistry instead of directly with McpServer.
 */

import type { ZodRawShape, z } from "zod";
import type { ToolHandler, ToolRegistry } from "./tool-registry.js";

/**
 * Tool result type matching MCP SDK expectations
 */
interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Type that makes RegistryAdapter compatible with McpServer for tool registration.
 * Uses generics to preserve Zod type inference for handler parameters.
 */
export interface ToolRegistrationTarget {
  registerTool<TInput extends ZodRawShape, TOutput extends ZodRawShape>(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema: TInput;
      outputSchema?: TOutput;
      annotations?: {
        title?: string;
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
      };
    },
    handler: (params: z.infer<z.ZodObject<TInput>>) => Promise<ToolResult>,
  ): void;
}

export class RegistryAdapter implements ToolRegistrationTarget {
  constructor(
    private registry: ToolRegistry,
    private category: string,
  ) {}

  /**
   * Compatible with McpServer.registerTool signature.
   * Intercepts tool registrations and forwards them to the registry.
   */
  registerTool<TInput extends ZodRawShape, TOutput extends ZodRawShape>(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema: TInput;
      outputSchema?: TOutput;
      annotations?: {
        title?: string;
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
      };
    },
    handler: (params: z.infer<z.ZodObject<TInput>>) => Promise<ToolResult>,
  ): void {
    this.registry.registerTool(
      name,
      this.category,
      config.title,
      config.description,
      config.inputSchema,
      config.outputSchema ?? {},
      handler as ToolHandler,
    );
  }
}

/**
 * Creates a mock server interface that redirects tool registrations to the registry.
 * This allows existing tool files to work unchanged - they call registerTool on this
 * adapter, which forwards to the registry with the appropriate category.
 */
export function createRegistryAdapter(
  registry: ToolRegistry,
  category: string,
): ToolRegistrationTarget {
  return new RegistryAdapter(registry, category);
}

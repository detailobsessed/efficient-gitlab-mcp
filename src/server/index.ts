#!/usr/bin/env node
/**
 * GitLab MCP Server Entry Point
 *
 * Uses progressive disclosure pattern to expose 5 meta-tools instead of 100+ individual tools,
 * dramatically reducing token consumption when the LLM loads the tool list.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import express, { type Request, type Response } from "express";

import { createRegistryAdapter, registerMetaTools, ToolRegistry } from "../registry/index.js";
import {
  registerCommitTools,
  registerIssueTools,
  registerMergeRequestTools,
  registerNamespaceTools,
  registerPipelineTools,
  registerProjectTools,
  registerRepositoryTools,
  registerUserTools,
} from "../tools/index.js";
import { Logger } from "../utils/logger.js";
import { loadConfig } from "./config.js";

async function main() {
  const config = loadConfig();
  const logger = new Logger(config.logLevel, config.logFormat);

  logger.info("Starting GitLab MCP Server", {
    version: config.serverVersion,
    transportMode: config.transportMode,
  });

  // Create MCP server
  const mcpServer = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  });

  // Create tool registry for progressive disclosure
  // We expose 5 meta-tools that allow the LLM to discover and execute tools on-demand
  const registry = new ToolRegistry();

  // Register all tools with the registry (not directly with MCP server)
  logger.info("Registering tools with registry...");

  // Register tools by category
  registerRepositoryTools(createRegistryAdapter(registry, "repositories"), logger);
  registerMergeRequestTools(createRegistryAdapter(registry, "merge-requests"), logger);
  registerIssueTools(createRegistryAdapter(registry, "issues"), logger);
  registerProjectTools(createRegistryAdapter(registry, "projects"), logger);
  registerCommitTools(createRegistryAdapter(registry, "commits"), logger);
  registerNamespaceTools(createRegistryAdapter(registry, "namespaces"), logger);
  registerUserTools(createRegistryAdapter(registry, "users"), logger);

  // Pipeline tools are optional (controlled by USE_PIPELINE env var)
  if (config.usePipeline) {
    registerPipelineTools(createRegistryAdapter(registry, "pipelines"), logger);
  }

  // Register the 5 meta-tools with the MCP server
  // These are the ONLY tools exposed to the LLM
  logger.info("Registering meta-tools for progressive disclosure...");
  registerMetaTools(mcpServer, registry, logger);

  // Setup transport based on configuration
  if (config.transportMode === "stdio") {
    logger.info("Starting with stdio transport");
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    logger.info("MCP Server ready (stdio)");
  } else if (config.transportMode === "streamable-http") {
    // HTTP transport with Express
    logger.info("Starting with Streamable HTTP transport", { port: config.httpPort });
    const app = express();
    app.use(express.json());

    // Track active transports
    const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};

    // Health check endpoint
    app.get("/health", (_req: Request, res: Response) => {
      res.json({
        status: "healthy",
        server: {
          name: config.serverName,
          version: config.serverVersion,
        },
        activeSessions: Object.keys(streamableTransports).length,
      });
    });

    // MCP endpoint
    app.post("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string;

      try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId && streamableTransports[sessionId]) {
          // Reuse existing transport for ongoing session
          transport = streamableTransports[sessionId];
          await transport.handleRequest(req, res, req.body);
        } else {
          // Create new transport for new session
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId: string) => {
              streamableTransports[newSessionId] = transport;
              logger.info(`Session initialized: ${newSessionId}`);
            },
          });

          // Set up cleanup handler when transport closes
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && streamableTransports[sid]) {
              logger.info(`Session closed: ${sid}`);
              delete streamableTransports[sid];
            }
          };

          // Connect transport to MCP server
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, req.body);
        }
      } catch (error) {
        logger.error("Error handling MCP request", {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });

    // Delete session endpoint
    app.delete("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string;

      if (!sessionId) {
        res.status(400).json({ error: "mcp-session-id header is required" });
        return;
      }

      const transport = streamableTransports[sessionId];
      if (!transport) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      try {
        await transport.close();
        logger.info(`Session explicitly closed: ${sessionId}`);
        res.status(204).send();
      } catch (error) {
        logger.error(`Error closing session ${sessionId}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: "Failed to close session" });
      }
    });

    app
      .listen(config.httpPort, config.httpHost, () => {
        logger.info(`MCP Server running on http://${config.httpHost}:${config.httpPort}/mcp`);
      })
      .on("error", (error: Error) => {
        logger.error("Server error", { error: error.message });
        process.exit(1);
      });
  } else {
    logger.error(`Unsupported transport mode: ${config.transportMode}`);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down gracefully...");
    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Log unhandled errors
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection", { reason: String(reason), promise: String(promise) });
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

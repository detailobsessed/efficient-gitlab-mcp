#!/usr/bin/env node

/**
 * GitLab MCP Server Entry Point
 *
 * Uses SDK-native progressive disclosure: all tools are registered but disabled.
 * Two meta-tools (list_categories, activate_tools) let the LLM discover and
 * enable tool categories on demand via notifications/tools/list_changed.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import express, { type Request, type Response } from "express";

import { registerDisclosureTools, type ToolsByCategory } from "../registry/index.js";
import {
  registerCommitTools,
  registerIssueTools,
  registerMergeRequestTools,
  registerNamespaceTools,
  registerPipelineTools,
  registerProjectTools,
  registerRepositoryTools,
  registerSearchTools,
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

  // Create MCP server with tools.listChanged capability for progressive disclosure
  const mcpServer = new McpServer(
    {
      name: config.serverName,
      version: config.serverVersion,
    },
    {
      capabilities: {
        logging: {},
        tools: { listChanged: true },
      },
    },
  );

  // Register all tools directly with McpServer (all start disabled)
  // Each register function returns a Map<string, RegisteredTool> for enable/disable control
  logger.info("Registering tools (disabled, pending activation)...");

  const toolsByCategory: ToolsByCategory = new Map();
  toolsByCategory.set("repositories", registerRepositoryTools(mcpServer, logger));
  toolsByCategory.set("merge-requests", registerMergeRequestTools(mcpServer, logger));
  toolsByCategory.set("issues", registerIssueTools(mcpServer, logger));
  toolsByCategory.set("projects", registerProjectTools(mcpServer, logger));
  toolsByCategory.set("commits", registerCommitTools(mcpServer, logger));
  toolsByCategory.set("namespaces", registerNamespaceTools(mcpServer, logger));
  toolsByCategory.set("users", registerUserTools(mcpServer, logger));
  toolsByCategory.set("search", registerSearchTools(mcpServer, logger));

  if (config.usePipeline) {
    toolsByCategory.set("pipelines", registerPipelineTools(mcpServer, logger));
  }

  const totalTools = Array.from(toolsByCategory.values()).reduce((sum, m) => sum + m.size, 0);
  logger.info(
    `Registered ${totalTools} tools across ${toolsByCategory.size} categories (all disabled)`,
  );

  // Register 2 always-enabled meta-tools for progressive disclosure
  registerDisclosureTools(mcpServer, toolsByCategory, logger);

  // Attach MCP server to logger for protocol logging
  // This enables agent observability - LLMs can see server logs
  logger.attachMcpServer(mcpServer);

  // Setup transport based on configuration
  if (config.transportMode === "stdio") {
    logger.info("Starting with stdio transport");
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    logger.info("MCP Server ready (stdio)");
  } else if (config.transportMode === "streamable-http") {
    // HTTP transport with Express
    logger.info("Starting with Streamable HTTP transport", {
      port: config.httpPort,
      host: config.httpHost,
      dnsRebindingProtection: config.httpEnableDnsRebindingProtection,
      allowedHosts: config.httpAllowedHosts,
      allowedOrigins: config.httpAllowedOrigins.length > 0 ? config.httpAllowedOrigins : "any",
    });
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

    // Helper to create a new transport with security features
    const createTransport = (): StreamableHTTPServerTransport => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId: string) => {
          streamableTransports[newSessionId] = transport;
          logger.info(`Session initialized: ${newSessionId}`);
        },
        enableDnsRebindingProtection: config.httpEnableDnsRebindingProtection,
        allowedHosts: config.httpAllowedHosts,
        allowedOrigins:
          config.httpAllowedOrigins.length > 0 ? config.httpAllowedOrigins : undefined,
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && streamableTransports[sid]) {
          logger.info(`Session closed: ${sid}`);
          delete streamableTransports[sid];
        }
      };

      return transport;
    };

    // Helper to send error response
    const sendErrorResponse = (res: Response, error: unknown) => {
      logger.error("Error handling MCP request", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    };

    // MCP endpoint
    app.post("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string;

      try {
        if (sessionId && streamableTransports[sessionId]) {
          await streamableTransports[sessionId].handleRequest(req, res, req.body);
        } else {
          const transport = createTransport();
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, req.body);
        }
      } catch (error) {
        sendErrorResponse(res, error);
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

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
  registerGraphqlTools,
  registerIssueTools,
  registerMergeRequestTools,
  registerMilestoneTools,
  registerNamespaceTools,
  registerPipelineTools,
  registerProjectTools,
  registerReleaseTools,
  registerRepositoryTools,
  registerSearchTools,
  registerUserTools,
  registerWebhookTools,
  registerWikiTools,
  registerWorkItemTools,
} from "../tools/index.js";
import { Logger } from "../utils/logger.js";
import { loadConfig, type ServerConfig } from "./config.js";

/**
 * Creates a fully configured McpServer with all tools registered (disabled)
 * and disclosure meta-tools attached. Each call returns an independent server
 * with its own tool state, ensuring HTTP sessions don't share disclosure state.
 */
function createMcpServer(config: ServerConfig, logger: Logger): McpServer {
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

  const toolsByCategory: ToolsByCategory = new Map();
  toolsByCategory.set("repositories", registerRepositoryTools(mcpServer, logger));
  toolsByCategory.set("merge-requests", registerMergeRequestTools(mcpServer, logger));
  toolsByCategory.set("issues", registerIssueTools(mcpServer, logger));
  toolsByCategory.set("projects", registerProjectTools(mcpServer, logger));
  toolsByCategory.set("commits", registerCommitTools(mcpServer, logger));
  toolsByCategory.set("namespaces", registerNamespaceTools(mcpServer, logger));
  toolsByCategory.set("users", registerUserTools(mcpServer, logger));
  toolsByCategory.set("search", registerSearchTools(mcpServer, logger));
  toolsByCategory.set("releases", registerReleaseTools(mcpServer, logger));
  toolsByCategory.set("webhooks", registerWebhookTools(mcpServer, logger));
  toolsByCategory.set("work-items", registerWorkItemTools(mcpServer, logger));
  toolsByCategory.set("graphql", registerGraphqlTools(mcpServer, logger));

  if (config.useGitlabWiki) {
    toolsByCategory.set("wiki", registerWikiTools(mcpServer, logger));
  }
  if (config.useMilestone) {
    toolsByCategory.set("milestones", registerMilestoneTools(mcpServer, logger));
  }
  if (config.usePipeline) {
    toolsByCategory.set("pipelines", registerPipelineTools(mcpServer, logger));
  }

  const totalTools = Array.from(toolsByCategory.values()).reduce((sum, m) => sum + m.size, 0);
  logger.info(
    `Registered ${totalTools} tools across ${toolsByCategory.size} categories (all disabled)`,
  );

  registerDisclosureTools(mcpServer, toolsByCategory, logger);
  logger.attachMcpServer(mcpServer);

  return mcpServer;
}

async function main() {
  const config = loadConfig();
  const logger = new Logger(config.logLevel, config.logFormat);

  logger.info("Starting GitLab MCP Server", {
    version: config.serverVersion,
    transportMode: config.transportMode,
  });

  if (config.transportMode === "stdio") {
    // Stdio: single server, single client
    const mcpServer = createMcpServer(config, logger);
    logger.info("Starting with stdio transport");
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    logger.info("MCP Server ready (stdio)");
  } else if (config.transportMode === "streamable-http") {
    // HTTP: per-session server for independent disclosure state
    logger.info("Starting with Streamable HTTP transport", {
      port: config.httpPort,
      host: config.httpHost,
      dnsRebindingProtection: config.httpEnableDnsRebindingProtection,
      allowedHosts: config.httpAllowedHosts,
      allowedOrigins: config.httpAllowedOrigins.length > 0 ? config.httpAllowedOrigins : "any",
    });
    const app = express();
    app.use(express.json());

    const sessions: Record<
      string,
      { server: McpServer; transport: StreamableHTTPServerTransport; lastActivity: number }
    > = {};

    // Session cleanup: evict idle sessions based on sessionTimeoutSeconds
    const sessionTimeoutMs = config.sessionTimeoutSeconds * 1000;
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [sid, session] of Object.entries(sessions)) {
        if (now - session.lastActivity > sessionTimeoutMs) {
          logger.info(`Session timed out: ${sid}`);
          session.transport.close().catch(() => {});
          delete sessions[sid];
        }
      }
    }, 30_000);
    cleanupInterval.unref();

    // Health check endpoint
    app.get("/health", (_req: Request, res: Response) => {
      res.json({
        status: "healthy",
        server: {
          name: config.serverName,
          version: config.serverVersion,
        },
        activeSessions: Object.keys(sessions).length,
      });
    });

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

    // Create a new session with its own server + tool state
    const createSession = async () => {
      const sessionServer = createMcpServer(config, logger);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId: string) => {
          sessions[newSessionId] = {
            server: sessionServer,
            transport,
            lastActivity: Date.now(),
          };
          logger.info(`Session initialized: ${newSessionId}`);
        },
        enableDnsRebindingProtection: config.httpEnableDnsRebindingProtection,
        allowedHosts: config.httpAllowedHosts,
        allowedOrigins:
          config.httpAllowedOrigins.length > 0 ? config.httpAllowedOrigins : undefined,
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && sessions[sid]) {
          logger.info(`Session closed: ${sid}`);
          delete sessions[sid];
        }
      };

      await sessionServer.connect(transport);
      return transport;
    };

    // MCP endpoint — each new session gets its own server + tool state
    app.post("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string;

      try {
        if (sessionId && sessions[sessionId]) {
          sessions[sessionId].lastActivity = Date.now();
          await sessions[sessionId].transport.handleRequest(req, res, req.body);
        } else {
          if (config.maxSessions > 0 && Object.keys(sessions).length >= config.maxSessions) {
            res.status(503).json({
              jsonrpc: "2.0",
              error: { code: -32000, message: "Maximum sessions reached" },
              id: null,
            });
            return;
          }

          const transport = await createSession();
          await transport.handleRequest(req, res, req.body);
        }
      } catch (error) {
        sendErrorResponse(res, error);
      }
    });

    // GET SSE streams not supported in this implementation
    app.get("/mcp", (_req: Request, res: Response) => {
      res
        .status(405)
        .set("Allow", "POST, DELETE")
        .json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed. Use POST." },
          id: null,
        });
    });

    // Delete session endpoint
    app.delete("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string;

      if (!sessionId) {
        res.status(400).json({ error: "mcp-session-id header is required" });
        return;
      }

      const session = sessions[sessionId];
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      try {
        await session.transport.close();
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

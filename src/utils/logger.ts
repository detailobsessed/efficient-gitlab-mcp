/**
 * Logger utility for the GitLab MCP server
 *
 * Supports both console logging and MCP protocol logging.
 * When an MCP server is attached, logs are also sent to connected clients
 * for agent observability.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "json" | "pretty";

export interface LogContext {
  [key: string]: unknown;
}

// Map our log levels to MCP logging levels
const mcpLogLevelMap: Record<LogLevel, "debug" | "info" | "warning" | "error"> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

export class Logger {
  private level: LogLevel;
  private format: LogFormat;
  private mcpServer: McpServer | null = null;
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(level: LogLevel = "info", format: LogFormat = "pretty") {
    this.level = level;
    this.format = format;
  }

  /**
   * Attach an MCP server to enable protocol logging.
   * When attached, logs will be sent to connected clients.
   */
  attachMcpServer(server: McpServer): void {
    this.mcpServer = server;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.level];
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();

    if (this.format === "json") {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...context,
      });
    }

    // Pretty format
    const levelColors: Record<LogLevel, string> = {
      debug: "\x1b[36m", // cyan
      info: "\x1b[32m", // green
      warn: "\x1b[33m", // yellow
      error: "\x1b[31m", // red
    };
    const reset = "\x1b[0m";
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";

    return `${levelColors[level]}[${level.toUpperCase()}]${reset} ${timestamp} ${message}${contextStr}`;
  }

  /**
   * Send log to MCP client if server is attached.
   * This enables agent observability - LLMs can see what the server is doing.
   */
  private sendToMcpClient(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.mcpServer) return;

    const data = context ? { message, ...context } : message;

    // Fire and forget - don't block on MCP logging
    this.mcpServer.server
      .sendLoggingMessage({
        level: mcpLogLevelMap[level],
        logger: "gitlab-mcp",
        data,
      })
      .catch(() => {
        // Silently ignore MCP logging errors to avoid infinite loops
      });
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message, context));
      this.sendToMcpClient("debug", message, context);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message, context));
      this.sendToMcpClient("info", message, context);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, context));
      this.sendToMcpClient("warn", message, context);
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message, context));
      this.sendToMcpClient("error", message, context);
    }
  }
}

/**
 * Simple logger utility for the GitLab MCP server
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "json" | "pretty";

export interface LogContext {
  [key: string]: unknown;
}

export class Logger {
  private level: LogLevel;
  private format: LogFormat;
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

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, context));
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message, context));
    }
  }
}

// Default logger instance
let defaultLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!defaultLogger) {
    const level = (process.env.LOG_LEVEL as LogLevel) || "info";
    const format = (process.env.LOG_FORMAT as LogFormat) || "pretty";
    defaultLogger = new Logger(level, format);
  }
  return defaultLogger;
}

export function setLogger(logger: Logger): void {
  defaultLogger = logger;
}

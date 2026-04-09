/**
 * Server configuration
 */

import { readFileSync } from "node:fs";
import { config as dotenvConfig } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Find project root by walking up from __dirname to locate our package.json. */
function findProjectRoot(): { root: string; version: string } {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
      if (pkg.name === "efficient-gitlab-mcp-server") return { root: dir, version: pkg.version };
    } catch {
      // not found at this level, keep walking
    }
    dir = dirname(dir);
  }
  return { root: process.cwd(), version: "0.0.0" };
}

const { root: PROJECT_ROOT, version: PKG_VERSION } = findProjectRoot();
dotenvConfig({ path: join(PROJECT_ROOT, ".env") });

type TransportMode = "stdio" | "sse" | "streamable-http";
type LogLevel = "debug" | "info" | "warn" | "error";
type LogFormat = "json" | "pretty";

export interface ServerConfig {
  // Server identity
  serverName: string;
  serverVersion: string;

  // Transport
  transportMode: TransportMode;
  httpPort: number;
  httpHost: string;

  // HTTP Transport Security
  httpAllowedHosts: string[];
  httpAllowedOrigins: string[];
  httpEnableDnsRebindingProtection: boolean;

  // GitLab API
  gitlabApiUrl: string;
  gitlabPersonalAccessToken?: string;
  ciJobToken?: string;
  gitlabUseOAuth: boolean;
  gitlabIsOld: boolean;
  gitlabReadOnlyMode: boolean;
  gitlabProjectId?: string;
  gitlabAllowedProjectIds: string[];

  // Remote authorization
  remoteAuthorization: boolean;
  enableDynamicApiUrl: boolean;
  sessionTimeoutSeconds: number;
  maxSessions: number;
  maxRequestsPerMinute: number;

  // Proxy
  httpProxy?: string;
  httpsProxy?: string;
  rejectUnauthorized: boolean;
  caCertPath?: string;

  // Logging
  logLevel: LogLevel;
  logFormat: LogFormat;
}

function normalizeGitLabApiUrl(url: string): string {
  if (!url) {
    return "https://gitlab.com/api/v4";
  }
  let normalizedUrl = url.trim();
  if (normalizedUrl.endsWith("/")) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }
  if (!normalizedUrl.endsWith("/api/v4")) {
    normalizedUrl = `${normalizedUrl}/api/v4`;
  }
  return normalizedUrl;
}

function determineTransportMode(): TransportMode {
  if (process.env.STREAMABLE_HTTP === "true") {
    return "streamable-http";
  }
  if (process.env.SSE === "true") {
    return "sse";
  }
  return "stdio";
}

export function loadConfig(): ServerConfig {
  return {
    // Server identity
    serverName: "efficient-gitlab-mcp-server",
    serverVersion: PKG_VERSION,

    // Transport
    transportMode: determineTransportMode(),
    httpPort: parseInt(process.env.PORT || "3002", 10),
    httpHost: process.env.HOST || "127.0.0.1",

    // HTTP Transport Security
    httpAllowedHosts: (process.env.HTTP_ALLOWED_HOSTS || "localhost,127.0.0.1")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
    httpAllowedOrigins: process.env.HTTP_ALLOWED_ORIGINS
      ? process.env.HTTP_ALLOWED_ORIGINS.split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [],
    httpEnableDnsRebindingProtection: process.env.HTTP_ENABLE_DNS_REBINDING_PROTECTION !== "false",

    // GitLab API
    gitlabApiUrl: normalizeGitLabApiUrl(process.env.GITLAB_API_URL || "https://gitlab.com"),
    gitlabPersonalAccessToken: process.env.GITLAB_PERSONAL_ACCESS_TOKEN,
    ciJobToken: process.env.CI_JOB_TOKEN,
    gitlabUseOAuth: process.env.GITLAB_USE_OAUTH === "true",
    gitlabIsOld: process.env.GITLAB_IS_OLD === "true",
    gitlabReadOnlyMode: process.env.GITLAB_READ_ONLY_MODE === "true",
    gitlabProjectId: process.env.GITLAB_PROJECT_ID,
    gitlabAllowedProjectIds:
      process.env.GITLAB_ALLOWED_PROJECT_IDS?.split(",")
        .map((id) => id.trim())
        .filter(Boolean) || [],

    // Remote authorization
    remoteAuthorization: process.env.REMOTE_AUTHORIZATION === "true",
    enableDynamicApiUrl: process.env.ENABLE_DYNAMIC_API_URL === "true",
    sessionTimeoutSeconds: parseInt(process.env.SESSION_TIMEOUT_SECONDS || "3600", 10),
    maxSessions: parseInt(process.env.MAX_SESSIONS || "1000", 10),
    maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || "60", 10),

    // Proxy
    httpProxy: process.env.HTTP_PROXY,
    httpsProxy: process.env.HTTPS_PROXY,
    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
    caCertPath: process.env.GITLAB_CA_CERT_PATH,

    // Logging
    logLevel: (process.env.LOG_LEVEL as LogLevel) || "info",
    logFormat: (process.env.LOG_FORMAT as LogFormat) || "pretty",
  };
}

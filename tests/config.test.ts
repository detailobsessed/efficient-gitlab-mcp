import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { loadConfig } from "../src/server/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("server identity", () => {
    it("should have correct server name", () => {
      const config = loadConfig();
      expect(config.serverName).toBe("efficient-gitlab-mcp-server");
    });

    it("should have a version", () => {
      const config = loadConfig();
      expect(config.serverVersion).toBeDefined();
    });
  });

  describe("transport mode", () => {
    it("should default to stdio", () => {
      delete process.env.SSE;
      delete process.env.STREAMABLE_HTTP;
      const config = loadConfig();
      expect(config.transportMode).toBe("stdio");
    });

    it("should use streamable-http when STREAMABLE_HTTP=true", () => {
      process.env.STREAMABLE_HTTP = "true";
      const config = loadConfig();
      expect(config.transportMode).toBe("streamable-http");
    });

    it("should use sse when SSE=true", () => {
      process.env.SSE = "true";
      delete process.env.STREAMABLE_HTTP;
      const config = loadConfig();
      expect(config.transportMode).toBe("sse");
    });

    it("should prefer streamable-http over sse", () => {
      process.env.SSE = "true";
      process.env.STREAMABLE_HTTP = "true";
      const config = loadConfig();
      expect(config.transportMode).toBe("streamable-http");
    });
  });

  describe("GitLab API configuration", () => {
    it("should default to gitlab.com", () => {
      delete process.env.GITLAB_API_URL;
      const config = loadConfig();
      expect(config.gitlabApiUrl).toBe("https://gitlab.com/api/v4");
    });

    it("should normalize API URL without /api/v4", () => {
      process.env.GITLAB_API_URL = "https://gitlab.example.com";
      const config = loadConfig();
      expect(config.gitlabApiUrl).toBe("https://gitlab.example.com/api/v4");
    });

    it("should not double-append /api/v4", () => {
      process.env.GITLAB_API_URL = "https://gitlab.example.com/api/v4";
      const config = loadConfig();
      expect(config.gitlabApiUrl).toBe("https://gitlab.example.com/api/v4");
    });

    it("should strip trailing slash", () => {
      process.env.GITLAB_API_URL = "https://gitlab.example.com/";
      const config = loadConfig();
      expect(config.gitlabApiUrl).toBe("https://gitlab.example.com/api/v4");
    });
  });

  describe("feature flags", () => {
    it("should default feature flags to false", () => {
      delete process.env.USE_GITLAB_WIKI;
      delete process.env.USE_MILESTONE;
      delete process.env.USE_PIPELINE;
      const config = loadConfig();
      expect(config.useGitlabWiki).toBe(false);
      expect(config.useMilestone).toBe(false);
      expect(config.usePipeline).toBe(false);
    });

    it("should enable feature flags when set to true", () => {
      process.env.USE_GITLAB_WIKI = "true";
      process.env.USE_MILESTONE = "true";
      process.env.USE_PIPELINE = "true";
      const config = loadConfig();
      expect(config.useGitlabWiki).toBe(true);
      expect(config.useMilestone).toBe(true);
      expect(config.usePipeline).toBe(true);
    });
  });

  describe("remote authorization", () => {
    it("should default to disabled", () => {
      delete process.env.REMOTE_AUTHORIZATION;
      const config = loadConfig();
      expect(config.remoteAuthorization).toBe(false);
    });

    it("should enable when set to true", () => {
      process.env.REMOTE_AUTHORIZATION = "true";
      const config = loadConfig();
      expect(config.remoteAuthorization).toBe(true);
    });

    it("should have default session timeout", () => {
      const config = loadConfig();
      expect(config.sessionTimeoutSeconds).toBe(3600);
    });

    it("should parse custom session timeout", () => {
      process.env.SESSION_TIMEOUT_SECONDS = "7200";
      const config = loadConfig();
      expect(config.sessionTimeoutSeconds).toBe(7200);
    });
  });

  describe("allowed project IDs", () => {
    it("should default to empty array", () => {
      delete process.env.GITLAB_ALLOWED_PROJECT_IDS;
      const config = loadConfig();
      expect(config.gitlabAllowedProjectIds).toEqual([]);
    });

    it("should parse comma-separated project IDs", () => {
      process.env.GITLAB_ALLOWED_PROJECT_IDS = "123,456,789";
      const config = loadConfig();
      expect(config.gitlabAllowedProjectIds).toEqual(["123", "456", "789"]);
    });

    it("should trim whitespace from project IDs", () => {
      process.env.GITLAB_ALLOWED_PROJECT_IDS = " 123 , 456 , 789 ";
      const config = loadConfig();
      expect(config.gitlabAllowedProjectIds).toEqual(["123", "456", "789"]);
    });

    it("should filter empty values", () => {
      process.env.GITLAB_ALLOWED_PROJECT_IDS = "123,,456,";
      const config = loadConfig();
      expect(config.gitlabAllowedProjectIds).toEqual(["123", "456"]);
    });
  });

  describe("logging", () => {
    it("should default to info level", () => {
      delete process.env.LOG_LEVEL;
      const config = loadConfig();
      expect(config.logLevel).toBe("info");
    });

    it("should default to pretty format", () => {
      delete process.env.LOG_FORMAT;
      const config = loadConfig();
      expect(config.logFormat).toBe("pretty");
    });

    it("should use custom log level", () => {
      process.env.LOG_LEVEL = "debug";
      const config = loadConfig();
      expect(config.logLevel).toBe("debug");
    });

    it("should use custom log format", () => {
      process.env.LOG_FORMAT = "json";
      const config = loadConfig();
      expect(config.logFormat).toBe("json");
    });
  });

  describe("HTTP configuration", () => {
    it("should default port to 3002", () => {
      delete process.env.PORT;
      const config = loadConfig();
      expect(config.httpPort).toBe(3002);
    });

    it("should default host to 127.0.0.1", () => {
      delete process.env.HOST;
      const config = loadConfig();
      expect(config.httpHost).toBe("127.0.0.1");
    });

    it("should use custom port", () => {
      process.env.PORT = "8080";
      const config = loadConfig();
      expect(config.httpPort).toBe(8080);
    });

    it("should use custom host", () => {
      process.env.HOST = "0.0.0.0";
      const config = loadConfig();
      expect(config.httpHost).toBe("0.0.0.0");
    });
  });
});

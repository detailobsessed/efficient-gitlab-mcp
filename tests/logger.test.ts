import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Logger } from "../src/utils/logger.js";

describe("Logger", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger("debug", "pretty");
  });

  describe("log levels", () => {
    it("should log debug when level is debug", () => {
      const consoleSpy = spyOn(console, "debug").mockImplementation(() => {});
      logger.debug("test message");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should log info when level is info or lower", () => {
      const consoleSpy = spyOn(console, "info").mockImplementation(() => {});
      logger.info("test message");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should log warn when level is warn or lower", () => {
      const consoleSpy = spyOn(console, "warn").mockImplementation(() => {});
      logger.warn("test message");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should log error when level is error or lower", () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      logger.error("test message");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should not log debug when level is info", () => {
      const infoLogger = new Logger("info", "pretty");
      const consoleSpy = spyOn(console, "debug").mockImplementation(() => {});
      infoLogger.debug("test message");
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should not log info when level is warn", () => {
      const warnLogger = new Logger("warn", "pretty");
      const consoleSpy = spyOn(console, "info").mockImplementation(() => {});
      warnLogger.info("test message");
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should not log warn when level is error", () => {
      const errorLogger = new Logger("error", "pretty");
      const consoleSpy = spyOn(console, "warn").mockImplementation(() => {});
      errorLogger.warn("test message");
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("log format", () => {
    it("should format as JSON when format is json", () => {
      const jsonLogger = new Logger("info", "json");
      const consoleSpy = spyOn(console, "info").mockImplementation(() => {});

      jsonLogger.info("test message", { key: "value" });

      expect(consoleSpy).toHaveBeenCalled();
      const loggedMessage = consoleSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(loggedMessage);
      expect(parsed.message).toBe("test message");
      expect(parsed.key).toBe("value");
      expect(parsed.level).toBe("info");
      expect(parsed.timestamp).toBeDefined();

      consoleSpy.mockRestore();
    });

    it("should include context in pretty format", () => {
      const consoleSpy = spyOn(console, "info").mockImplementation(() => {});

      logger.info("test message", { count: 42 });

      expect(consoleSpy).toHaveBeenCalled();
      const loggedMessage = consoleSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain("test message");
      expect(loggedMessage).toContain("42");

      consoleSpy.mockRestore();
    });
  });

  describe("context handling", () => {
    it("should handle undefined context", () => {
      const consoleSpy = spyOn(console, "info").mockImplementation(() => {});
      logger.info("test message");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should handle complex context objects", () => {
      const consoleSpy = spyOn(console, "info").mockImplementation(() => {});

      logger.info("test message", {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

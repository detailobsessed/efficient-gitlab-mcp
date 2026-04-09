import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Logger } from "../src/utils/logger.js";

describe("Logger", () => {
  let logger: Logger;
  let stderrSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logger = new Logger("debug", "pretty");
    stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe("log levels", () => {
    it("should log debug when level is debug", () => {
      logger.debug("test message");
      expect(stderrSpy).toHaveBeenCalled();
    });

    it("should log info when level is info or lower", () => {
      logger.info("test message");
      expect(stderrSpy).toHaveBeenCalled();
    });

    it("should log warn when level is warn or lower", () => {
      logger.warn("test message");
      expect(stderrSpy).toHaveBeenCalled();
    });

    it("should log error when level is error or lower", () => {
      logger.error("test message");
      expect(stderrSpy).toHaveBeenCalled();
    });

    it("should not log debug when level is info", () => {
      stderrSpy.mockRestore();
      const infoLogger = new Logger("info", "pretty");
      stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
      infoLogger.debug("test message");
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("should not log info when level is warn", () => {
      stderrSpy.mockRestore();
      const warnLogger = new Logger("warn", "pretty");
      stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
      warnLogger.info("test message");
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("should not log warn when level is error", () => {
      stderrSpy.mockRestore();
      const errorLogger = new Logger("error", "pretty");
      stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
      errorLogger.warn("test message");
      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });

  describe("log format", () => {
    it("should format as JSON when format is json", () => {
      stderrSpy.mockRestore();
      const jsonLogger = new Logger("info", "json");
      stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);

      jsonLogger.info("test message", { key: "value" });

      expect(stderrSpy).toHaveBeenCalled();
      const loggedMessage = stderrSpy.mock.calls[0][0] as string;
      // Strip trailing newline added by our write call
      const parsed = JSON.parse(loggedMessage.trim());
      expect(parsed.message).toBe("test message");
      expect(parsed.key).toBe("value");
      expect(parsed.level).toBe("info");
      expect(parsed.timestamp).toBeDefined();
    });

    it("should include context in pretty format", () => {
      logger.info("test message", { count: 42 });

      expect(stderrSpy).toHaveBeenCalled();
      const loggedMessage = stderrSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain("test message");
      expect(loggedMessage).toContain("42");
    });
  });

  describe("context handling", () => {
    it("should handle undefined context", () => {
      logger.info("test message");
      expect(stderrSpy).toHaveBeenCalled();
    });

    it("should handle complex context objects", () => {
      logger.info("test message", {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
      });

      expect(stderrSpy).toHaveBeenCalled();
    });
  });
});

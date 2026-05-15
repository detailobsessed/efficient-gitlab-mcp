import { describe, expect, it, mock } from "bun:test";
import { z } from "zod";
import { parseGitLabResponse } from "../../src/schemas/parse.js";
import { Logger } from "../../src/utils/logger.js";

describe("parseGitLabResponse", () => {
  const Schema = z.object({ id: z.number(), name: z.string() }).passthrough();

  it("returns parsed data on success", () => {
    const parsed = parseGitLabResponse(Schema, { id: 1, name: "alpha" }, "ctx");
    expect(parsed.id).toBe(1);
    expect(parsed.name).toBe("alpha");
  });

  it("passes the response through unchanged on schema failure", () => {
    const malformed = { id: "not a number" };
    const result = parseGitLabResponse(Schema, malformed, "ctx");
    // Phase 1 policy: pass through, don't throw.
    expect(result as unknown).toBe(malformed);
  });

  it("logs failures with the message as the first arg and context as the second", () => {
    // Regression: Logger.warn is (message: string, context?: LogContext).
    // Earlier this was called Pino-style (object first), which made the log
    // read "[object Object]" and dropped the issues array.
    const logger = new Logger("warn", "pretty");
    const warnSpy = mock(() => {});
    logger.warn = warnSpy as unknown as Logger["warn"];

    parseGitLabResponse(Schema, { id: "not a number" }, "test_endpoint", logger);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, context] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof message).toBe("string");
    expect(message).toContain("schema validation");
    expect(context.ctx).toBe("test_endpoint");
    expect(Array.isArray(context.issues)).toBe(true);
  });

  it("no-ops the logger call when no logger is provided", () => {
    // Should not throw when logger is undefined and parsing fails.
    expect(() => parseGitLabResponse(Schema, { id: "bad" }, "ctx")).not.toThrow();
  });
});

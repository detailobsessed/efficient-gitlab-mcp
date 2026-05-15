import { describe, expect, it, mock } from "bun:test";
import { closeSession } from "../src/server/index.js";
import type { Logger } from "../src/utils/logger.js";

function makeLogger() {
  const warn = mock(() => {});
  return {
    logger: { warn, info: () => {}, error: () => {}, debug: () => {} } as unknown as Logger,
    warn,
  };
}

describe("closeSession", () => {
  it("closes transport then server in order", async () => {
    const order: string[] = [];
    const transport = { close: mock(async () => void order.push("transport")) };
    const server = { close: mock(async () => void order.push("server")) };
    const { logger } = makeLogger();

    await closeSession("sess-1", { server, transport }, logger);

    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["transport", "server"]);
  });

  it("still closes server when transport.close rejects, and warns", async () => {
    const transport = {
      close: mock(async () => {
        throw new Error("transport boom");
      }),
    };
    const server = { close: mock(async () => {}) };
    const { logger, warn } = makeLogger();

    await closeSession("sess-2", { server, transport }, logger);

    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const [msg, ctx] = warn.mock.calls[0] as [string, { error: string }];
    expect(msg).toContain("transport for session sess-2");
    expect(ctx.error).toBe("transport boom");
  });

  it("warns when server.close rejects, doesn't throw", async () => {
    const transport = { close: mock(async () => {}) };
    const server = {
      close: mock(async () => {
        throw new Error("server boom");
      }),
    };
    const { logger, warn } = makeLogger();

    await closeSession("sess-3", { server, transport }, logger);

    expect(warn).toHaveBeenCalledTimes(1);
    const [msg] = warn.mock.calls[0] as [string];
    expect(msg).toContain("server for session sess-3");
  });

  it("does not throw when both close calls reject", async () => {
    const transport = {
      close: mock(async () => {
        throw new Error("t");
      }),
    };
    const server = {
      close: mock(async () => {
        throw new Error("s");
      }),
    };
    const { logger, warn } = makeLogger();

    await expect(closeSession("sess-4", { server, transport }, logger)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

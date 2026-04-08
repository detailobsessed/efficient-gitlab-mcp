/**
 * PAT Scope Auto-Detection Tests (DET-51, Tier 2)
 *
 * Tests that detectReadOnlyFromScopes correctly inspects GitLab PAT scopes
 * and determines whether the server should operate in read-only mode.
 *
 * Red/green TDD: these tests are written FIRST, before the implementation.
 */

import { describe, expect, it, mock } from "bun:test";
import { Logger } from "../src/utils/logger.js";
import { detectReadOnlyFromScopes } from "../src/utils/token-scopes.js";

const logger = new Logger("error", "pretty");

// Mock GitLab client that returns configurable responses
function createMockClient(response: { status: number; body: unknown } | "error") {
  return {
    get: mock(async () => {
      if (response === "error") {
        throw new Error("Connection refused");
      }
      if (response.status !== 200) {
        throw new Error(`GitLab API error: ${response.status} Not Found`);
      }
      return response.body;
    }),
  };
}

describe("detectReadOnlyFromScopes", () => {
  it("should return true when token has only read_api scope", async () => {
    const client = createMockClient({
      status: 200,
      body: { scopes: ["read_api"] },
    });

    const result = await detectReadOnlyFromScopes(client as never, logger);
    expect(result).toBe(true);
  });

  it("should return true when token has read_api and read_user scopes", async () => {
    const client = createMockClient({
      status: 200,
      body: { scopes: ["read_api", "read_user", "read_repository"] },
    });

    const result = await detectReadOnlyFromScopes(client as never, logger);
    expect(result).toBe(true);
  });

  it("should return false when token has api scope", async () => {
    const client = createMockClient({
      status: 200,
      body: { scopes: ["api"] },
    });

    const result = await detectReadOnlyFromScopes(client as never, logger);
    expect(result).toBe(false);
  });

  it("should return false when token has api among other scopes", async () => {
    const client = createMockClient({
      status: 200,
      body: { scopes: ["api", "read_user", "read_registry"] },
    });

    const result = await detectReadOnlyFromScopes(client as never, logger);
    expect(result).toBe(false);
  });

  it("should return null when the endpoint returns 404", async () => {
    const client = createMockClient({ status: 404, body: "Not Found" });

    const result = await detectReadOnlyFromScopes(client as never, logger);
    expect(result).toBeNull();
  });

  it("should return null when the API call throws (connection error)", async () => {
    const client = createMockClient("error");

    const result = await detectReadOnlyFromScopes(client as never, logger);
    expect(result).toBeNull();
  });

  it("should return null when response has no scopes field", async () => {
    const client = createMockClient({
      status: 200,
      body: { id: 1, name: "test" },
    });

    const result = await detectReadOnlyFromScopes(client as never, logger);
    expect(result).toBeNull();
  });

  it("should call the correct endpoint", async () => {
    const client = createMockClient({
      status: 200,
      body: { scopes: ["api"] },
    });

    await detectReadOnlyFromScopes(client as never, logger);
    expect(client.get).toHaveBeenCalledWith("/personal_access_tokens/self");
  });
});

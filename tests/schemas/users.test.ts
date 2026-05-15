import { describe, expect, it } from "bun:test";
import { GitLabUserSchema } from "../../src/schemas/users.js";
import getCurrentUserFixture from "../fixtures/users/get_current_user.json";
import getUserFixture from "../fixtures/users/get_user.json";

describe("GitLabUserSchema", () => {
  it("parses a real-shape get_current_user response (with identity fields)", () => {
    const result = GitLabUserSchema.safeParse(getCurrentUserFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("ismart");
      expect(result.data.email).toBe("ismart@example.com");
      expect(result.data.two_factor_enabled).toBe(true);
    }
  });

  it("parses a real-shape get_user response (no identity fields)", () => {
    const result = GitLabUserSchema.safeParse(getUserFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("alice");
      expect(result.data.followers).toBe(12);
    }
  });

  it("rejects malformed input (missing required fields)", () => {
    const result = GitLabUserSchema.safeParse({ username: "incomplete" });
    expect(result.success).toBe(false);
  });
});

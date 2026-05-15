import { describe, expect, it } from "bun:test";
import {
  GitLabUserListSchema,
  GitLabUserSchema,
  GitLabUserSlimSchema,
  USER_SLIM_FIELDS,
  UserSlimShape,
} from "../../src/schemas/users.js";
import { projectField } from "../../src/utils/projection.js";
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

describe("GitLabUserSlimSchema (Phase 3b / DOT-560)", () => {
  it("parses the get_user fixture and types every slim field", () => {
    const result = GitLabUserSlimSchema.safeParse(getUserFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      for (const k of Object.keys(UserSlimShape)) {
        if (k in (getUserFixture as Record<string, unknown>)) {
          expect(k in result.data).toBe(true);
        }
      }
    }
  });

  it("USER_SLIM_FIELDS exactly mirrors UserSlimShape keys", () => {
    expect([...USER_SLIM_FIELDS].sort()).toEqual(Object.keys(UserSlimShape).sort());
  });

  it("projectField with USER_SLIM_FIELDS keeps only slim keys at runtime", () => {
    // Use get_current_user fixture (has the admin/2FA fields populated)
    const slim = projectField(
      getCurrentUserFixture as Record<string, unknown>,
      USER_SLIM_FIELDS,
      undefined,
    );
    const allowed = new Set<string>(USER_SLIM_FIELDS);
    for (const k of Object.keys(slim)) {
      expect(allowed.has(k)).toBe(true);
    }
  });

  it("USER_SLIM_FIELDS does NOT include privacy-sensitive fields (guardrail)", () => {
    // Pin the privacy invariant. If a future change adds any of these to
    // UserSlimShape, this test fails loudly and forces a deliberate decision.
    const privacyFields = [
      "email",
      "public_email",
      "last_sign_in_at",
      "confirmed_at",
      "last_activity_on",
      "two_factor_enabled",
      "current_sign_in_at",
      "external",
      "private_profile",
      "is_admin",
      "theme_id",
      "color_scheme_id",
      "projects_limit",
    ];
    const slimSet = new Set<string>(USER_SLIM_FIELDS);
    for (const field of privacyFields) {
      expect(slimSet.has(field)).toBe(false);
    }
  });

  it("projectField on the current-user fixture drops every privacy-sensitive field", () => {
    const slim = projectField(
      getCurrentUserFixture as Record<string, unknown>,
      USER_SLIM_FIELDS,
      undefined,
    ) as Record<string, unknown>;
    for (const field of [
      "email",
      "last_sign_in_at",
      "confirmed_at",
      "last_activity_on",
      "two_factor_enabled",
      "current_sign_in_at",
      "external",
      "private_profile",
      "is_admin",
      "theme_id",
      "color_scheme_id",
      "projects_limit",
    ]) {
      expect(slim[field]).toBeUndefined();
    }
  });

  it("parses an array of users via GitLabUserListSchema", () => {
    const result = GitLabUserListSchema.safeParse([getUserFixture, getCurrentUserFixture]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
  });

  it("token budget: projected user is materially smaller than the full payload", () => {
    const fullBytes = Buffer.byteLength(JSON.stringify(getCurrentUserFixture), "utf8");
    const slim = projectField(
      getCurrentUserFixture as Record<string, unknown>,
      USER_SLIM_FIELDS,
      undefined,
    );
    const slimBytes = Buffer.byteLength(JSON.stringify(slim), "utf8");
    expect(slimBytes).toBeLessThanOrEqual(Math.floor(fullBytes * 0.8));
  });
});

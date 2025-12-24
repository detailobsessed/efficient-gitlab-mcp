import { afterEach, describe, expect, it, mock } from "bun:test";
import { buildQueryString, encodeProjectId, GitLabClient } from "../src/utils/gitlab-client.js";

describe("GitLab Client Utilities", () => {
  describe("encodeProjectId", () => {
    it("should encode simple project ID", () => {
      expect(encodeProjectId("123")).toBe("123");
    });

    it("should encode project path with slash", () => {
      expect(encodeProjectId("group/project")).toBe("group%2Fproject");
    });

    it("should encode nested project path", () => {
      expect(encodeProjectId("org/group/project")).toBe("org%2Fgroup%2Fproject");
    });

    it("should handle special characters", () => {
      expect(encodeProjectId("my-group/my-project")).toBe("my-group%2Fmy-project");
    });
  });

  describe("buildQueryString", () => {
    it("should return empty string for empty params", () => {
      expect(buildQueryString({})).toBe("");
    });

    it("should build query string from simple params", () => {
      const result = buildQueryString({ page: 1, per_page: 20 });
      expect(result).toBe("?page=1&per_page=20");
    });

    it("should skip undefined values", () => {
      const result = buildQueryString({ page: 1, search: undefined });
      expect(result).toBe("?page=1");
    });

    it("should skip null values", () => {
      const result = buildQueryString({ page: 1, search: null });
      expect(result).toBe("?page=1");
    });

    it("should handle boolean values", () => {
      const result = buildQueryString({ recursive: true, archived: false });
      expect(result).toBe("?recursive=true&archived=false");
    });

    it("should handle string values", () => {
      const result = buildQueryString({ search: "test query" });
      expect(result).toBe("?search=test+query");
    });

    it("should handle array values", () => {
      const result = buildQueryString({ labels: ["bug", "feature"] });
      expect(result).toContain("labels%5B%5D=bug");
      expect(result).toContain("labels%5B%5D=feature");
    });
  });
});

describe("GitLabClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    it("should use default API URL when not provided", () => {
      const client = new GitLabClient();
      expect(client.getApiUrl()).toBe("https://gitlab.com/api/v4");
    });

    it("should use custom API URL when provided", () => {
      const client = new GitLabClient("https://gitlab.example.com/api/v4");
      expect(client.getApiUrl()).toBe("https://gitlab.example.com/api/v4");
    });
  });

  describe("get", () => {
    it("should make GET request and return JSON", async () => {
      const mockResponse = { id: 1, name: "test-project" };
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResponse)),
        } as Response),
      );

      const client = new GitLabClient("https://gitlab.example.com/api/v4", "test-token");
      const result = await client.get("/projects/1");

      expect(result).toEqual(mockResponse);
    });

    it("should throw error on non-ok response", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: () => Promise.resolve("Project not found"),
        } as Response),
      );

      const client = new GitLabClient("https://gitlab.example.com/api/v4", "test-token");

      expect(client.get("/projects/999")).rejects.toThrow("GitLab API error: 404 Not Found");
    });

    it("should throw rate limit error on 403 with rate limit message", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          text: () => Promise.resolve("Rate limit exceeded"),
        } as Response),
      );

      const client = new GitLabClient("https://gitlab.example.com/api/v4", "test-token");

      expect(client.get("/projects")).rejects.toThrow("GitLab API Rate Limit Exceeded");
    });
  });

  describe("post", () => {
    it("should make POST request with body", async () => {
      const mockResponse = { id: 2, name: "new-project" };
      let capturedOptions: RequestInit | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResponse)),
        } as Response);
      });

      const client = new GitLabClient("https://gitlab.example.com/api/v4", "test-token");
      const result = await client.post("/projects", { name: "new-project" });

      expect(result).toEqual(mockResponse);
      expect(capturedOptions?.method).toBe("POST");
      expect(capturedOptions?.body).toBe('{"name":"new-project"}');
    });
  });

  describe("put", () => {
    it("should make PUT request with body", async () => {
      const mockResponse = { id: 1, name: "updated-project" };
      let capturedOptions: RequestInit | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResponse)),
        } as Response);
      });

      const client = new GitLabClient("https://gitlab.example.com/api/v4", "test-token");
      const result = await client.put("/projects/1", { name: "updated-project" });

      expect(result).toEqual(mockResponse);
      expect(capturedOptions?.method).toBe("PUT");
    });
  });

  describe("delete", () => {
    it("should make DELETE request", async () => {
      let capturedOptions: RequestInit | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("{}"),
        } as Response);
      });

      const client = new GitLabClient("https://gitlab.example.com/api/v4", "test-token");
      await client.delete("/projects/1");

      expect(capturedOptions?.method).toBe("DELETE");
    });

    it("should handle 204 No Content response", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 204,
        } as Response),
      );

      const client = new GitLabClient("https://gitlab.example.com/api/v4", "test-token");
      const result = await client.delete("/projects/1/issues/1");

      expect(result).toEqual({});
    });

    it("should handle empty body response", async () => {
      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(""),
        } as Response),
      );

      const client = new GitLabClient("https://gitlab.example.com/api/v4", "test-token");
      const result = await client.delete("/projects/1/labels/bug");

      expect(result).toEqual({});
    });
  });
});

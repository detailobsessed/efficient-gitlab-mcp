import { afterEach, describe, expect, it, mock } from "bun:test";
import { createRegistryAdapter } from "../src/registry/tool-adapter.js";
import { ToolRegistry } from "../src/registry/tool-registry.js";
import { registerRepositoryTools } from "../src/tools/repositories.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Repository Tools Handlers", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("create_or_update_file", () => {
    it("should use POST when file does not exist", async () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "repositories");
      registerRepositoryTools(adapter, logger);

      let requestMethod: string | undefined;
      let requestUrl: string | undefined;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        // First call is GET to check if file exists - return 404
        if (options?.method === "GET" || !options?.method) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: "Not Found",
            text: () => Promise.resolve("File not found"),
          } as Response);
        }

        // Second call is POST to create
        requestMethod = options?.method;
        requestUrl = url;
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve('{"file_path": "test.txt", "branch": "main"}'),
        } as Response);
      });

      const handler = registry.getHandler("create_or_update_file");
      expect(handler).not.toBeNull();

      await handler?.({
        project_id: "my-group/my-project",
        file_path: "test.txt",
        branch: "main",
        content: "Hello World",
        commit_message: "Add test file",
      });

      expect(requestMethod).toBe("POST");
      expect(requestUrl).toContain("/repository/files/");
    });

    it("should use PUT when file already exists", async () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "repositories");
      registerRepositoryTools(adapter, logger);

      let requestMethod: string | undefined;
      let callCount = 0;

      // @ts-expect-error - mock doesn't need full fetch signature
      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        callCount++;

        // First call is GET to check if file exists - return 200 (exists)
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('{"file_name": "test.txt", "content": "old content"}'),
          } as Response);
        }

        // Second call should be PUT to update
        requestMethod = options?.method;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"file_path": "test.txt", "branch": "main"}'),
        } as Response);
      });

      const handler = registry.getHandler("create_or_update_file");
      expect(handler).not.toBeNull();

      await handler?.({
        project_id: "my-group/my-project",
        file_path: "test.txt",
        branch: "main",
        content: "Updated content",
        commit_message: "Update test file",
      });

      expect(requestMethod).toBe("PUT");
      expect(callCount).toBe(2); // GET to check, then PUT to update
    });
  });
});

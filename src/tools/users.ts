import { z } from "zod";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { buildQueryString, defaultClient } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const GetUsersSchema = z.object({
  usernames: z.array(z.string()).describe("List of usernames to look up"),
});

const GetUserSchema = z.object({
  user_id: z.number().describe("User ID"),
});

const SearchUsersSchema = z.object({
  search: z.string().describe("Search query"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

export function registerUserTools(target: ToolRegistrationTarget, logger: Logger): void {
  logger.debug("Registering user tools");

  target.registerTool(
    "get_users",
    {
      title: "Get Users",
      description: "Get GitLab user details by usernames",
      inputSchema: {
        usernames: z.array(z.string()).describe("List of usernames to look up"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetUsersSchema.parse(params);
      const results: Record<string, unknown> = {};

      for (const username of args.usernames) {
        const query = buildQueryString({ username });
        const users = await defaultClient.get<unknown[]>(`/users${query}`);
        if (users.length > 0) {
          results[username] = users[0];
        }
      }

      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  target.registerTool(
    "get_user",
    {
      title: "Get User",
      description: "Get details of a specific user by ID",
      inputSchema: {
        user_id: z.number().describe("User ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetUserSchema.parse(params);
      const user = await defaultClient.get(`/users/${args.user_id}`);
      return { content: [{ type: "text", text: JSON.stringify(user, null, 2) }] };
    },
  );

  target.registerTool(
    "search_users",
    {
      title: "Search Users",
      description: "Search for GitLab users",
      inputSchema: {
        search: z.string().describe("Search query"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = SearchUsersSchema.parse(params);
      const query = buildQueryString(args);

      const users = await defaultClient.get(`/users${query}`);
      return { content: [{ type: "text", text: JSON.stringify(users, null, 2) }] };
    },
  );

  logger.debug("User tools registered", { count: 3 });
}

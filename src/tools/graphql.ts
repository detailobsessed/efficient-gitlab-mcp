import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defaultClient } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const ExecuteGraphQLSchema = z.object({
  query: z.string().describe("GraphQL query string"),
  variables: z.record(z.any()).optional().describe("Variables object for the GraphQL query"),
});

export function registerGraphqlTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering GraphQL tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef1 = server.registerTool(
    "execute_graphql",
    {
      title: "Execute GraphQL",
      description: "Execute a GraphQL query against the GitLab GraphQL API",
      annotations: { destructiveHint: false },
      inputSchema: {
        query: z.string().describe("GraphQL query string"),
        variables: z.record(z.any()).optional().describe("Variables object for the GraphQL query"),
      },
    },
    async (params) => {
      const args = ExecuteGraphQLSchema.parse(params);
      logger.info("execute_graphql request");

      try {
        const result = await defaultClient.graphql(args.query, args.variables || {});
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `GraphQL request failed: ${message}` }, null, 2),
            },
          ],
        };
      }
    },
  );
  toolRef1.disable();
  tools.set("execute_graphql", toolRef1);

  logger.debug("GraphQL tools registered", { count: tools.size });
  return tools;
}

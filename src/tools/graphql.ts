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
      inputSchema: {
        query: z.string().describe("GraphQL query string"),
        variables: z.record(z.any()).optional().describe("Variables object for the GraphQL query"),
      },
    },
    async (params) => {
      const args = ExecuteGraphQLSchema.parse(params);

      // Derive the GraphQL endpoint from the REST API URL
      const apiUrl = defaultClient.getApiUrl();
      const idx = apiUrl.lastIndexOf("/api/v4");
      const prefix = idx >= 0 ? apiUrl.slice(0, idx) : apiUrl;
      const graphqlUrl = process.env.GITLAB_GRAPHQL_URL || `${prefix}/api/graphql`;

      logger.info("execute_graphql request", { endpoint: graphqlUrl });

      // Use the client's fetch method to leverage auth headers, but POST to graphql endpoint
      try {
        const result = await defaultClient.post(graphqlUrl, {
          query: args.query,
          variables: args.variables || {},
        });
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

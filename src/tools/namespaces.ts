import { z } from "zod";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { buildQueryString, defaultClient } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const ListNamespacesSchema = z.object({
  search: z.string().optional().describe("Search query"),
  owned: z.boolean().optional().describe("Only owned namespaces"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetNamespaceSchema = z.object({
  namespace_id: z.union([z.string(), z.number()]).describe("Namespace ID or path"),
});

const VerifyNamespaceSchema = z.object({
  path: z.string().describe("Namespace path to verify"),
});

export function registerNamespaceTools(target: ToolRegistrationTarget, logger: Logger): void {
  logger.debug("Registering namespace tools");

  target.registerTool(
    "list_namespaces",
    {
      title: "List Namespaces",
      description: "List all namespaces available to the current user",
      inputSchema: {
        search: z.string().optional().describe("Search query"),
        owned: z.boolean().optional().describe("Only owned namespaces"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListNamespacesSchema.parse(params);
      const query = buildQueryString(args);

      const namespaces = await defaultClient.get(`/namespaces${query}`);
      return { content: [{ type: "text", text: JSON.stringify(namespaces, null, 2) }] };
    },
  );

  target.registerTool(
    "get_namespace",
    {
      title: "Get Namespace",
      description: "Get details of a namespace by ID or path",
      inputSchema: {
        namespace_id: z.union([z.string(), z.number()]).describe("Namespace ID or path"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetNamespaceSchema.parse(params);
      const namespaceId = encodeURIComponent(String(args.namespace_id));

      const namespace = await defaultClient.get(`/namespaces/${namespaceId}`);
      return { content: [{ type: "text", text: JSON.stringify(namespace, null, 2) }] };
    },
  );

  target.registerTool(
    "verify_namespace",
    {
      title: "Verify Namespace",
      description: "Verify if a namespace path exists",
      inputSchema: {
        path: z.string().describe("Namespace path to verify"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = VerifyNamespaceSchema.parse(params);
      const path = encodeURIComponent(args.path);

      const result = await defaultClient.get(`/namespaces/${path}/exists`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  logger.debug("Namespace tools registered", { count: 3 });
}

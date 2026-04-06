import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQueryString, defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const ListWebhooksSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path. Provide either project_id or group_id, not both."),
  group_id: z
    .string()
    .optional()
    .describe("Group ID or URL-encoded path. Provide either project_id or group_id, not both."),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const ListWebhookEventsSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path. Provide either project_id or group_id, not both."),
  group_id: z
    .string()
    .optional()
    .describe("Group ID or URL-encoded path. Provide either project_id or group_id, not both."),
  hook_id: z.number().describe("ID of the webhook"),
  status: z
    .union([z.number(), z.string()])
    .optional()
    .describe(
      "Filter by response status code (e.g. 200, 500) or category: successful, client_failure, server_failure",
    ),
  summary: z
    .boolean()
    .optional()
    .describe("If true, return only summary fields without full request/response payloads."),
  page: z.number().optional().describe("Page number for pagination"),
  per_page: z.number().max(20).optional().describe("Number of events per page (max: 20)"),
});

const GetWebhookEventSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path. Provide either project_id or group_id, not both."),
  group_id: z
    .string()
    .optional()
    .describe("Group ID or URL-encoded path. Provide either project_id or group_id, not both."),
  hook_id: z.number().describe("ID of the webhook"),
  event_id: z.number().describe("ID of the webhook event to retrieve"),
  page: z
    .number()
    .optional()
    .describe(
      "If known, the page where the event is located. Skips auto-pagination and fetches only this page.",
    ),
});

function buildWebhookBasePath(args: { project_id?: string; group_id?: string }): string {
  if (args.project_id) {
    return `/projects/${encodeProjectId(args.project_id)}/hooks`;
  }
  if (args.group_id) {
    return `/groups/${encodeURIComponent(args.group_id)}/hooks`;
  }
  throw new Error("Provide exactly one of project_id or group_id");
}

export function registerWebhookTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering webhook tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef1 = server.registerTool(
    "list_webhooks",
    {
      title: "List Webhooks",
      description: "List webhooks for a project or group",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe(
            "Project ID or URL-encoded path. Provide either project_id or group_id, not both.",
          ),
        group_id: z
          .string()
          .optional()
          .describe(
            "Group ID or URL-encoded path. Provide either project_id or group_id, not both.",
          ),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListWebhooksSchema.parse(params);
      const basePath = buildWebhookBasePath(args);
      const query = buildQueryString({ page: args.page, per_page: args.per_page });

      const webhooks = await defaultClient.get(`${basePath}${query}`);
      return { content: [{ type: "text", text: JSON.stringify(webhooks, null, 2) }] };
    },
  );
  toolRef1.disable();
  tools.set("list_webhooks", toolRef1);

  const toolRef2 = server.registerTool(
    "list_webhook_events",
    {
      title: "List Webhook Events",
      description: "List recent events for a specific webhook",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe(
            "Project ID or URL-encoded path. Provide either project_id or group_id, not both.",
          ),
        group_id: z
          .string()
          .optional()
          .describe(
            "Group ID or URL-encoded path. Provide either project_id or group_id, not both.",
          ),
        hook_id: z.number().describe("ID of the webhook"),
        status: z
          .union([z.number(), z.string()])
          .optional()
          .describe("Filter by response status code or category"),
        summary: z
          .boolean()
          .optional()
          .describe("If true, return only summary fields without full payloads."),
        page: z.number().optional().describe("Page number for pagination"),
        per_page: z.number().max(20).optional().describe("Number of events per page (max: 20)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListWebhookEventsSchema.parse(params);
      const basePath = buildWebhookBasePath(args);
      const query = buildQueryString({
        status: args.status,
        page: args.page,
        per_page: args.per_page,
      });

      const events = await defaultClient.get<unknown[]>(
        `${basePath}/${args.hook_id}/events${query}`,
      );

      if (args.summary) {
        const summaryEvents = (events as Array<Record<string, unknown>>).map((e) => ({
          id: e.id,
          url: e.url,
          trigger: e.trigger,
          response_status: e.response_status,
          execution_duration: e.execution_duration,
        }));
        return { content: [{ type: "text", text: JSON.stringify(summaryEvents, null, 2) }] };
      }

      return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
    },
  );
  toolRef2.disable();
  tools.set("list_webhook_events", toolRef2);

  const toolRef3 = server.registerTool(
    "get_webhook_event",
    {
      title: "Get Webhook Event",
      description: "Get details of a specific webhook event",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe(
            "Project ID or URL-encoded path. Provide either project_id or group_id, not both.",
          ),
        group_id: z
          .string()
          .optional()
          .describe(
            "Group ID or URL-encoded path. Provide either project_id or group_id, not both.",
          ),
        hook_id: z.number().describe("ID of the webhook"),
        event_id: z.number().describe("ID of the webhook event to retrieve"),
        page: z
          .number()
          .optional()
          .describe("If known, the page where the event is located. Skips auto-pagination."),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetWebhookEventSchema.parse(params);
      const basePath = buildWebhookBasePath(args);

      // If a specific page is provided, only search that page
      if (args.page) {
        const query = buildQueryString({ page: args.page, per_page: 20 });
        const events = await defaultClient.get<Array<Record<string, unknown>>>(
          `${basePath}/${args.hook_id}/events${query}`,
        );
        const event = events.find((e) => e.id === args.event_id);
        if (event) {
          return { content: [{ type: "text", text: JSON.stringify(event, null, 2) }] };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Webhook event ${args.event_id} not found on page ${args.page}` },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Auto-paginate through recent events to find the specific event
      const maxPages = 25; // 25 pages * 20 per page = 500 events
      for (let page = 1; page <= maxPages; page++) {
        const query = buildQueryString({ page, per_page: 20 });
        const events = await defaultClient.get<Array<Record<string, unknown>>>(
          `${basePath}/${args.hook_id}/events${query}`,
        );

        if (!events || events.length === 0) break;

        const event = events.find((e) => e.id === args.event_id);
        if (event) {
          return { content: [{ type: "text", text: JSON.stringify(event, null, 2) }] };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: `Webhook event ${args.event_id} not found in the 500 most recent events` },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
  toolRef3.disable();
  tools.set("get_webhook_event", toolRef3);

  logger.debug("Webhook tools registered", { count: tools.size });
  return tools;
}

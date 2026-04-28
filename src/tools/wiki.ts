import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQueryString, defaultClient, resolveProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const ListWikiPagesSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  with_content: z.coerce.boolean().optional().describe("Include content of the wiki pages"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetWikiPageSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
});

const CreateWikiPageSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  title: z.string().describe("Title of the wiki page"),
  content: z.string().describe("Content of the wiki page"),
  format: z.string().optional().describe("Content format, e.g., markdown, rdoc"),
});

const UpdateWikiPageSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
  title: z.string().optional().describe("New title of the wiki page"),
  content: z.string().optional().describe("New content of the wiki page"),
  format: z.string().optional().describe("Content format, e.g., markdown, rdoc"),
});

const DeleteWikiPageSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
});

const ListGroupWikiPagesSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  with_content: z.coerce.boolean().optional().describe("Include content of the wiki pages"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetGroupWikiPageSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
});

const CreateGroupWikiPageSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  title: z.string().describe("Title of the wiki page"),
  content: z.string().describe("Content of the wiki page"),
  format: z.string().optional().describe("Content format, e.g., markdown, rdoc"),
});

const UpdateGroupWikiPageSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
  title: z.string().optional().describe("New title of the wiki page"),
  content: z.string().optional().describe("New content of the wiki page"),
  format: z.string().optional().describe("Content format, e.g., markdown, rdoc"),
});

const DeleteGroupWikiPageSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
});

export function registerWikiTools(server: McpServer, logger: Logger): Map<string, RegisteredTool> {
  logger.debug("Registering wiki tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef1 = server.registerTool(
    "list_wiki_pages",
    {
      title: "List Wiki Pages",
      description: "List wiki pages for a project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        with_content: z.coerce.boolean().optional().describe("Include content of the wiki pages"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = ListWikiPagesSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const wikiPages = await defaultClient.get(`/projects/${projectId}/wikis${query}`);
      return { content: [{ type: "text", text: JSON.stringify(wikiPages, null, 2) }] };
    },
  );
  toolRef1.disable();
  tools.set("list_wiki_pages", toolRef1);

  const toolRef2 = server.registerTool(
    "get_wiki_page",
    {
      title: "Get Wiki Page",
      description: "Get a specific wiki page by its slug",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = GetWikiPageSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const slug = encodeURIComponent(args.slug);

      const wikiPage = await defaultClient.get(`/projects/${projectId}/wikis/${slug}`);
      return { content: [{ type: "text", text: JSON.stringify(wikiPage, null, 2) }] };
    },
  );
  toolRef2.disable();
  tools.set("get_wiki_page", toolRef2);

  const toolRef3 = server.registerTool(
    "create_wiki_page",
    {
      title: "Create Wiki Page",
      description: "Create a new wiki page in a project",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        title: z.string().describe("Title of the wiki page"),
        content: z.string().describe("Content of the wiki page"),
        format: z.string().optional().describe("Content format, e.g., markdown, rdoc"),
      },
    },
    async (params) => {
      const args = CreateWikiPageSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...body } = args;

      const wikiPage = await defaultClient.post(`/projects/${projectId}/wikis`, body);
      return { content: [{ type: "text", text: JSON.stringify(wikiPage, null, 2) }] };
    },
  );
  toolRef3.disable();
  tools.set("create_wiki_page", toolRef3);

  const toolRef4 = server.registerTool(
    "update_wiki_page",
    {
      title: "Update Wiki Page",
      description: "Update an existing wiki page in a project",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
        title: z.string().optional().describe("New title of the wiki page"),
        content: z.string().optional().describe("New content of the wiki page"),
        format: z.string().optional().describe("Content format, e.g., markdown, rdoc"),
      },
    },
    async (params) => {
      const args = UpdateWikiPageSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const slug = encodeURIComponent(args.slug);
      const { project_id: _, slug: _s, ...body } = args;

      const wikiPage = await defaultClient.put(`/projects/${projectId}/wikis/${slug}`, body);
      return { content: [{ type: "text", text: JSON.stringify(wikiPage, null, 2) }] };
    },
  );
  toolRef4.disable();
  tools.set("update_wiki_page", toolRef4);

  const toolRef5 = server.registerTool(
    "delete_wiki_page",
    {
      title: "Delete Wiki Page",
      description: "Delete a wiki page from a project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = DeleteWikiPageSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const slug = encodeURIComponent(args.slug);

      await defaultClient.delete(`/projects/${projectId}/wikis/${slug}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { status: "success", message: "Wiki page deleted successfully" },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
  toolRef5.disable();
  tools.set("delete_wiki_page", toolRef5);

  const toolRef6 = server.registerTool(
    "list_group_wiki_pages",
    {
      title: "List Group Wiki Pages",
      description: "List wiki pages for a group",
      inputSchema: {
        group_id: z.string().describe("Group ID or URL-encoded path"),
        with_content: z.coerce.boolean().optional().describe("Include content of the wiki pages"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = ListGroupWikiPagesSchema.parse(params);
      const groupId = encodeURIComponent(args.group_id);
      const { group_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const wikiPages = await defaultClient.get(`/groups/${groupId}/wikis${query}`);
      return { content: [{ type: "text", text: JSON.stringify(wikiPages, null, 2) }] };
    },
  );
  toolRef6.disable();
  tools.set("list_group_wiki_pages", toolRef6);

  const toolRef7 = server.registerTool(
    "get_group_wiki_page",
    {
      title: "Get Group Wiki Page",
      description: "Get a specific wiki page from a group by its slug",
      inputSchema: {
        group_id: z.string().describe("Group ID or URL-encoded path"),
        slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = GetGroupWikiPageSchema.parse(params);
      const groupId = encodeURIComponent(args.group_id);
      const slug = encodeURIComponent(args.slug);

      const wikiPage = await defaultClient.get(`/groups/${groupId}/wikis/${slug}`);
      return { content: [{ type: "text", text: JSON.stringify(wikiPage, null, 2) }] };
    },
  );
  toolRef7.disable();
  tools.set("get_group_wiki_page", toolRef7);

  const toolRef8 = server.registerTool(
    "create_group_wiki_page",
    {
      title: "Create Group Wiki Page",
      description: "Create a new wiki page in a group",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        group_id: z.string().describe("Group ID or URL-encoded path"),
        title: z.string().describe("Title of the wiki page"),
        content: z.string().describe("Content of the wiki page"),
        format: z.string().optional().describe("Content format, e.g., markdown, rdoc"),
      },
    },
    async (params) => {
      const args = CreateGroupWikiPageSchema.parse(params);
      const groupId = encodeURIComponent(args.group_id);
      const { group_id: _, ...body } = args;

      const wikiPage = await defaultClient.post(`/groups/${groupId}/wikis`, body);
      return { content: [{ type: "text", text: JSON.stringify(wikiPage, null, 2) }] };
    },
  );
  toolRef8.disable();
  tools.set("create_group_wiki_page", toolRef8);

  const toolRef9 = server.registerTool(
    "update_group_wiki_page",
    {
      title: "Update Group Wiki Page",
      description: "Update an existing wiki page in a group",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        group_id: z.string().describe("Group ID or URL-encoded path"),
        slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
        title: z.string().optional().describe("New title of the wiki page"),
        content: z.string().optional().describe("New content of the wiki page"),
        format: z.string().optional().describe("Content format, e.g., markdown, rdoc"),
      },
    },
    async (params) => {
      const args = UpdateGroupWikiPageSchema.parse(params);
      const groupId = encodeURIComponent(args.group_id);
      const slug = encodeURIComponent(args.slug);
      const { group_id: _, slug: _s, ...body } = args;

      const wikiPage = await defaultClient.put(`/groups/${groupId}/wikis/${slug}`, body);
      return { content: [{ type: "text", text: JSON.stringify(wikiPage, null, 2) }] };
    },
  );
  toolRef9.disable();
  tools.set("update_group_wiki_page", toolRef9);

  const toolRef10 = server.registerTool(
    "delete_group_wiki_page",
    {
      title: "Delete Group Wiki Page",
      description: "Delete a wiki page from a group",
      inputSchema: {
        group_id: z.string().describe("Group ID or URL-encoded path"),
        slug: z.string().describe("Slug of the wiki page (will be URL-encoded internally)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const args = DeleteGroupWikiPageSchema.parse(params);
      const groupId = encodeURIComponent(args.group_id);
      const slug = encodeURIComponent(args.slug);

      await defaultClient.delete(`/groups/${groupId}/wikis/${slug}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { status: "success", message: "Group wiki page deleted successfully" },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
  toolRef10.disable();
  tools.set("delete_group_wiki_page", toolRef10);

  logger.debug("Wiki tools registered", { count: tools.size });
  return tools;
}

import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQueryString, defaultClient, resolveProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const ListReleasesSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  order_by: z
    .enum(["released_at", "created_at"])
    .optional()
    .describe("The field to use as order. Either released_at (default) or created_at."),
  sort: z
    .enum(["desc", "asc"])
    .optional()
    .describe("The direction of the order. Either desc (default) or asc."),
  include_html_description: z
    .boolean()
    .optional()
    .describe("If true, a response includes HTML rendered Markdown of the release description."),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetReleaseSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  tag_name: z.string().describe("The Git tag the release is associated with"),
  include_html_description: z
    .boolean()
    .optional()
    .describe("If true, a response includes HTML rendered Markdown of the release description."),
});

const CreateReleaseSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  tag_name: z.string().describe("The tag where the release is created from"),
  name: z.string().optional().describe("The release name"),
  tag_message: z.string().optional().describe("Message to use if creating a new annotated tag"),
  description: z
    .string()
    .optional()
    .describe("The description of the release. You can use Markdown."),
  ref: z
    .string()
    .optional()
    .describe(
      "If a tag specified in tag_name doesn't exist, the release is created from ref and tagged with tag_name. It can be a commit SHA, another tag name, or a branch name.",
    ),
  milestones: z
    .array(z.string())
    .optional()
    .describe("The title of each milestone the release is associated with."),
  assets: z
    .object({
      links: z
        .array(
          z.object({
            name: z
              .string()
              .describe("The name of the link. Link names must be unique within the release."),
            url: z
              .string()
              .describe("The URL of the link. Link URLs must be unique within the release."),
            direct_asset_path: z
              .string()
              .optional()
              .describe("Optional path for a direct asset link."),
            link_type: z
              .enum(["other", "runbook", "image", "package"])
              .optional()
              .describe("The type of the link: other, runbook, image, package. Defaults to other."),
          }),
        )
        .optional(),
    })
    .optional()
    .describe("An array of assets links"),
  released_at: z
    .string()
    .optional()
    .describe("Date and time for the release. Expected in ISO 8601 format (2019-03-15T08:00:00Z)."),
});

const UpdateReleaseSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  tag_name: z.string().describe("The Git tag the release is associated with"),
  name: z.string().optional().describe("The release name"),
  description: z
    .string()
    .optional()
    .describe("The description of the release. You can use Markdown."),
  milestones: z
    .array(z.string())
    .optional()
    .describe("The title of each milestone to associate with the release."),
  released_at: z
    .string()
    .optional()
    .describe(
      "The date when the release is/was ready. Expected in ISO 8601 format (2019-03-15T08:00:00Z).",
    ),
});

const DeleteReleaseSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  tag_name: z.string().describe("The Git tag the release is associated with"),
});

const CreateReleaseEvidenceSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  tag_name: z.string().describe("The Git tag the release is associated with"),
});

const DownloadReleaseAssetSchema = z.object({
  project_id: z
    .string()
    .optional()
    .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
  tag_name: z.string().describe("The Git tag the release is associated with"),
  direct_asset_path: z
    .string()
    .describe("Path to the release asset file as specified when creating or updating its link"),
});

export function registerReleaseTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering release tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef1 = server.registerTool(
    "list_releases",
    {
      title: "List Releases",
      description: "List releases for a project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        order_by: z
          .enum(["released_at", "created_at"])
          .optional()
          .describe("The field to use as order."),
        sort: z.enum(["desc", "asc"]).optional().describe("The direction of the order."),
        include_html_description: z
          .boolean()
          .optional()
          .describe("If true, include HTML rendered Markdown of the release description."),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListReleasesSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const releases = await defaultClient.get(`/projects/${projectId}/releases${query}`);
      return { content: [{ type: "text", text: JSON.stringify(releases, null, 2) }] };
    },
  );
  toolRef1.disable();
  tools.set("list_releases", toolRef1);

  const toolRef2 = server.registerTool(
    "get_release",
    {
      title: "Get Release",
      description: "Get a specific release by tag name",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        tag_name: z.string().describe("The Git tag the release is associated with"),
        include_html_description: z
          .boolean()
          .optional()
          .describe("If true, include HTML rendered Markdown of the release description."),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetReleaseSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const tagName = encodeURIComponent(args.tag_name);
      const query = buildQueryString({
        include_html_description: args.include_html_description,
      });

      const release = await defaultClient.get(`/projects/${projectId}/releases/${tagName}${query}`);
      return { content: [{ type: "text", text: JSON.stringify(release, null, 2) }] };
    },
  );
  toolRef2.disable();
  tools.set("get_release", toolRef2);

  const toolRef3 = server.registerTool(
    "create_release",
    {
      title: "Create Release",
      description: "Create a new release for a project",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        tag_name: z.string().describe("The tag where the release is created from"),
        name: z.string().optional().describe("The release name"),
        tag_message: z
          .string()
          .optional()
          .describe("Message to use if creating a new annotated tag"),
        description: z
          .string()
          .optional()
          .describe("The description of the release. You can use Markdown."),
        ref: z
          .string()
          .optional()
          .describe("Commit SHA, tag name, or branch name to create the release from."),
        milestones: z
          .array(z.string())
          .optional()
          .describe("The title of each milestone the release is associated with."),
        assets: z
          .object({
            links: z
              .array(
                z.object({
                  name: z.string().describe("The name of the link."),
                  url: z.string().describe("The URL of the link."),
                  direct_asset_path: z
                    .string()
                    .optional()
                    .describe("Optional path for a direct asset link."),
                  link_type: z
                    .enum(["other", "runbook", "image", "package"])
                    .optional()
                    .describe("The type of the link."),
                }),
              )
              .optional(),
          })
          .optional()
          .describe("An array of assets links"),
        released_at: z
          .string()
          .optional()
          .describe("Date and time for the release in ISO 8601 format."),
      },
    },
    async (params) => {
      const args = CreateReleaseSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const { project_id: _, ...body } = args;

      const release = await defaultClient.post(`/projects/${projectId}/releases`, body);
      return { content: [{ type: "text", text: JSON.stringify(release, null, 2) }] };
    },
  );
  toolRef3.disable();
  tools.set("create_release", toolRef3);

  const toolRef4 = server.registerTool(
    "update_release",
    {
      title: "Update Release",
      description: "Update an existing release",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        tag_name: z.string().describe("The Git tag the release is associated with"),
        name: z.string().optional().describe("The release name"),
        description: z
          .string()
          .optional()
          .describe("The description of the release. You can use Markdown."),
        milestones: z
          .array(z.string())
          .optional()
          .describe("The title of each milestone to associate with the release."),
        released_at: z
          .string()
          .optional()
          .describe("The date when the release is/was ready in ISO 8601 format."),
      },
    },
    async (params) => {
      const args = UpdateReleaseSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const tagName = encodeURIComponent(args.tag_name);
      const { project_id: _, tag_name: _t, ...body } = args;

      const release = await defaultClient.put(`/projects/${projectId}/releases/${tagName}`, body);
      return { content: [{ type: "text", text: JSON.stringify(release, null, 2) }] };
    },
  );
  toolRef4.disable();
  tools.set("update_release", toolRef4);

  const toolRef5 = server.registerTool(
    "delete_release",
    {
      title: "Delete Release",
      description: "Delete a release",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        tag_name: z.string().describe("The Git tag the release is associated with"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = DeleteReleaseSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const tagName = encodeURIComponent(args.tag_name);

      const release = await defaultClient.delete(`/projects/${projectId}/releases/${tagName}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { status: "success", message: "Release deleted successfully", release },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
  toolRef5.disable();
  tools.set("delete_release", toolRef5);

  const toolRef6 = server.registerTool(
    "create_release_evidence",
    {
      title: "Create Release Evidence",
      description: "Create evidence for an existing release",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        tag_name: z.string().describe("The Git tag the release is associated with"),
      },
    },
    async (params) => {
      const args = CreateReleaseEvidenceSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const tagName = encodeURIComponent(args.tag_name);

      await defaultClient.post(`/projects/${projectId}/releases/${tagName}/evidence`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { status: "success", message: "Release evidence created successfully" },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
  toolRef6.disable();
  tools.set("create_release_evidence", toolRef6);

  const toolRef7 = server.registerTool(
    "download_release_asset",
    {
      title: "Download Release Asset",
      description: "Download an asset from a release by its direct asset path",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID or URL-encoded path (defaults to GITLAB_PROJECT_ID if set)"),
        tag_name: z.string().describe("The Git tag the release is associated with"),
        direct_asset_path: z
          .string()
          .describe(
            "Path to the release asset file as specified when creating or updating its link",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = DownloadReleaseAssetSchema.parse(params);
      const projectId = resolveProjectId(args.project_id);
      const tagName = encodeURIComponent(args.tag_name);

      // First get the release to find the asset link
      const release = await defaultClient.get<{
        assets?: {
          links?: Array<{ direct_asset_url?: string; direct_asset_path?: string; url?: string }>;
        };
      }>(`/projects/${projectId}/releases/${tagName}`);

      const link = release.assets?.links?.find(
        (l) => l.direct_asset_path === args.direct_asset_path,
      );

      if (!link) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: `Asset with path "${args.direct_asset_path}" not found in release ${args.tag_name}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const assetUrl = link.direct_asset_url || link.url;
      if (!assetUrl) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Asset link has no URL" }, null, 2),
            },
          ],
        };
      }

      // Only send auth headers to same-origin URLs to prevent token leakage
      const isInternal =
        !assetUrl.startsWith("http") ||
        new URL(assetUrl).origin === new URL(defaultClient.getApiUrl()).origin;
      const response = isInternal ? await defaultClient.rawFetch(assetUrl) : await fetch(assetUrl);
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Failed to fetch asset: ${response.status} ${response.statusText}` },
                null,
                2,
              ),
            },
          ],
        };
      }
      const assetContent = await response.text();
      return {
        content: [
          {
            type: "text",
            text: assetContent,
          },
        ],
      };
    },
  );
  toolRef7.disable();
  tools.set("download_release_asset", toolRef7);

  logger.debug("Release tools registered", { count: tools.size });
  return tools;
}

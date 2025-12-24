import { z } from "zod";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { buildQueryString, defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const ListPipelinesSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  scope: z.enum(["running", "pending", "finished", "branches", "tags"]).optional(),
  status: z
    .enum([
      "created",
      "waiting_for_resource",
      "preparing",
      "pending",
      "running",
      "success",
      "failed",
      "canceled",
      "skipped",
      "manual",
      "scheduled",
    ])
    .optional(),
  ref: z.string().optional().describe("Branch or tag name"),
  sha: z.string().optional().describe("Commit SHA"),
  yaml_errors: z.boolean().optional().describe("Filter by YAML errors"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetPipelineSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  pipeline_id: z.number().describe("Pipeline ID"),
});

const CreatePipelineSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  ref: z.string().describe("Branch or tag name"),
  variables: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
        variable_type: z.enum(["env_var", "file"]).optional(),
      }),
    )
    .optional()
    .describe("Pipeline variables"),
});

const RetryPipelineSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  pipeline_id: z.number().describe("Pipeline ID"),
});

const CancelPipelineSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  pipeline_id: z.number().describe("Pipeline ID"),
});

const ListPipelineJobsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  pipeline_id: z.number().describe("Pipeline ID"),
  scope: z
    .enum(["created", "pending", "running", "failed", "success", "canceled", "skipped", "manual"])
    .optional(),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetPipelineJobOutputSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  job_id: z.number().describe("Job ID"),
});

const PlayPipelineJobSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  job_id: z.number().describe("Job ID"),
  job_variables_attributes: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    )
    .optional()
    .describe("Job variables"),
});

const RetryPipelineJobSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  job_id: z.number().describe("Job ID"),
});

const CancelPipelineJobSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  job_id: z.number().describe("Job ID"),
});

export function registerPipelineTools(target: ToolRegistrationTarget, logger: Logger): void {
  logger.debug("Registering pipeline tools");

  target.registerTool(
    "list_pipelines",
    {
      title: "List Pipelines",
      description: "List pipelines in a GitLab project with filtering options",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        scope: z.enum(["running", "pending", "finished", "branches", "tags"]).optional(),
        status: z
          .enum([
            "created",
            "pending",
            "running",
            "success",
            "failed",
            "canceled",
            "skipped",
            "manual",
            "scheduled",
          ])
          .optional(),
        ref: z.string().optional().describe("Branch or tag name"),
        sha: z.string().optional().describe("Commit SHA"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListPipelinesSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const pipelines = await defaultClient.get(`/projects/${projectId}/pipelines${query}`);
      return { content: [{ type: "text", text: JSON.stringify(pipelines, null, 2) }] };
    },
  );

  target.registerTool(
    "get_pipeline",
    {
      title: "Get Pipeline",
      description: "Get details of a specific pipeline in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        pipeline_id: z.number().describe("Pipeline ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetPipelineSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const pipeline = await defaultClient.get(
        `/projects/${projectId}/pipelines/${args.pipeline_id}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(pipeline, null, 2) }] };
    },
  );

  target.registerTool(
    "create_pipeline",
    {
      title: "Create Pipeline",
      description: "Create a new pipeline for a branch or tag",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        ref: z.string().describe("Branch or tag name"),
        variables: z
          .array(
            z.object({
              key: z.string(),
              value: z.string(),
              variable_type: z.enum(["env_var", "file"]).optional(),
            }),
          )
          .optional()
          .describe("Pipeline variables"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = CreatePipelineSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const pipeline = await defaultClient.post(`/projects/${projectId}/pipeline`, {
        ref: args.ref,
        variables: args.variables,
      });
      return { content: [{ type: "text", text: JSON.stringify(pipeline, null, 2) }] };
    },
  );

  target.registerTool(
    "retry_pipeline",
    {
      title: "Retry Pipeline",
      description: "Retry a failed or canceled pipeline",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        pipeline_id: z.number().describe("Pipeline ID"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = RetryPipelineSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const pipeline = await defaultClient.post(
        `/projects/${projectId}/pipelines/${args.pipeline_id}/retry`,
      );
      return { content: [{ type: "text", text: JSON.stringify(pipeline, null, 2) }] };
    },
  );

  target.registerTool(
    "cancel_pipeline",
    {
      title: "Cancel Pipeline",
      description: "Cancel a running pipeline",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        pipeline_id: z.number().describe("Pipeline ID"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = CancelPipelineSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const pipeline = await defaultClient.post(
        `/projects/${projectId}/pipelines/${args.pipeline_id}/cancel`,
      );
      return { content: [{ type: "text", text: JSON.stringify(pipeline, null, 2) }] };
    },
  );

  target.registerTool(
    "list_pipeline_jobs",
    {
      title: "List Pipeline Jobs",
      description: "List all jobs in a specific pipeline",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        pipeline_id: z.number().describe("Pipeline ID"),
        scope: z
          .enum([
            "created",
            "pending",
            "running",
            "failed",
            "success",
            "canceled",
            "skipped",
            "manual",
          ])
          .optional(),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListPipelineJobsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({
        scope: args.scope,
        page: args.page,
        per_page: args.per_page,
      });

      const jobs = await defaultClient.get(
        `/projects/${projectId}/pipelines/${args.pipeline_id}/jobs${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(jobs, null, 2) }] };
    },
  );

  target.registerTool(
    "get_pipeline_job_output",
    {
      title: "Get Pipeline Job Output",
      description: "Get the output/trace of a GitLab pipeline job",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        job_id: z.number().describe("Job ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetPipelineJobOutputSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const response = await fetch(
        `${defaultClient.getApiUrl()}/projects/${projectId}/jobs/${args.job_id}/trace`,
        {
          headers: {
            "PRIVATE-TOKEN": process.env.GITLAB_PERSONAL_ACCESS_TOKEN ?? "",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to get job output: ${response.status}`);
      }

      const trace = await response.text();
      return { content: [{ type: "text", text: trace }] };
    },
  );

  target.registerTool(
    "play_pipeline_job",
    {
      title: "Play Pipeline Job",
      description: "Run a manual pipeline job",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        job_id: z.number().describe("Job ID"),
        job_variables_attributes: z
          .array(
            z.object({
              key: z.string(),
              value: z.string(),
            }),
          )
          .optional()
          .describe("Job variables"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = PlayPipelineJobSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const job = await defaultClient.post(`/projects/${projectId}/jobs/${args.job_id}/play`, {
        job_variables_attributes: args.job_variables_attributes,
      });
      return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
    },
  );

  target.registerTool(
    "retry_pipeline_job",
    {
      title: "Retry Pipeline Job",
      description: "Retry a failed or canceled pipeline job",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        job_id: z.number().describe("Job ID"),
      },
      annotations: { destructiveHint: false },
    },
    async (params) => {
      const args = RetryPipelineJobSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const job = await defaultClient.post(`/projects/${projectId}/jobs/${args.job_id}/retry`);
      return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
    },
  );

  target.registerTool(
    "cancel_pipeline_job",
    {
      title: "Cancel Pipeline Job",
      description: "Cancel a running pipeline job",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        job_id: z.number().describe("Job ID"),
      },
      annotations: { destructiveHint: true },
    },
    async (params) => {
      const args = CancelPipelineJobSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const job = await defaultClient.post(`/projects/${projectId}/jobs/${args.job_id}/cancel`);
      return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
    },
  );

  logger.debug("Pipeline tools registered", { count: 10 });
}

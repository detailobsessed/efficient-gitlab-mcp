import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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

const ListDeploymentsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  environment: z.string().optional().describe("Filter by environment name"),
  ref: z.string().optional().describe("Filter by ref"),
  sha: z.string().optional().describe("Filter by commit SHA"),
  status: z.string().optional().describe("Filter by deployment status"),
  updated_after: z
    .string()
    .optional()
    .describe("Return deployments updated after the specified date"),
  updated_before: z
    .string()
    .optional()
    .describe("Return deployments updated before the specified date"),
  order_by: z
    .enum(["id", "iid", "created_at", "updated_at", "ref", "status", "environment"])
    .optional()
    .describe("Order deployments by"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort deployments"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetDeploymentSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  deployment_id: z.number().describe("The ID of the deployment"),
});

const ListEnvironmentsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  name: z.string().optional().describe("Return environments with this exact name"),
  search: z.string().optional().describe("Search environments by name"),
  states: z.enum(["available", "stopped"]).optional().describe("Filter environments by state"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetEnvironmentSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  environment_id: z.number().describe("The ID of the environment"),
});

const ListPipelineTriggerJobsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  pipeline_id: z.number().describe("The ID of the pipeline"),
  scope: z
    .enum([
      "canceled",
      "canceling",
      "created",
      "failed",
      "manual",
      "pending",
      "preparing",
      "running",
      "scheduled",
      "skipped",
      "success",
      "waiting_for_resource",
    ])
    .optional()
    .describe("The scope of trigger jobs to show"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const GetPipelineJobSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  job_id: z.number().describe("The ID of the job"),
});

const ListJobArtifactsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  job_id: z.number().describe("The ID of the job"),
  path: z
    .string()
    .optional()
    .describe("Directory path within the artifacts archive (defaults to root)"),
  recursive: z.boolean().optional().describe("Whether to list artifacts recursively"),
});

const DownloadJobArtifactsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  job_id: z.number().describe("The ID of the job"),
});

const GetJobArtifactFileSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  job_id: z.number().describe("The ID of the job"),
  artifact_path: z.string().describe("Path to the file within the artifacts archive"),
});

export function registerPipelineTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering pipeline tools");
  const tools = new Map<string, RegisteredTool>();

  const toolRef = server.registerTool(
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
  toolRef.disable();
  tools.set("list_pipelines", toolRef);

  const toolRef2 = server.registerTool(
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
  toolRef2.disable();
  tools.set("get_pipeline", toolRef2);

  const toolRef3 = server.registerTool(
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
  toolRef3.disable();
  tools.set("create_pipeline", toolRef3);

  const toolRef4 = server.registerTool(
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
  toolRef4.disable();
  tools.set("retry_pipeline", toolRef4);

  const toolRef5 = server.registerTool(
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
  toolRef5.disable();
  tools.set("cancel_pipeline", toolRef5);

  const toolRef6 = server.registerTool(
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
  toolRef6.disable();
  tools.set("list_pipeline_jobs", toolRef6);

  const toolRef7 = server.registerTool(
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

      const response = await defaultClient.rawFetch(
        `/projects/${projectId}/jobs/${args.job_id}/trace`,
      );

      const trace = await response.text();
      return { content: [{ type: "text", text: trace }] };
    },
  );
  toolRef7.disable();
  tools.set("get_pipeline_job_output", toolRef7);

  const toolRef8 = server.registerTool(
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
  toolRef8.disable();
  tools.set("play_pipeline_job", toolRef8);

  const toolRef9 = server.registerTool(
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
  toolRef9.disable();
  tools.set("retry_pipeline_job", toolRef9);

  const toolRef10 = server.registerTool(
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
  toolRef10.disable();
  tools.set("cancel_pipeline_job", toolRef10);

  const toolRef11 = server.registerTool(
    "list_deployments",
    {
      title: "List Deployments",
      description: "List deployments in a GitLab project with filtering options",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        environment: z.string().optional().describe("Filter by environment name"),
        ref: z.string().optional().describe("Filter by ref"),
        sha: z.string().optional().describe("Filter by commit SHA"),
        status: z.string().optional().describe("Filter by deployment status"),
        updated_after: z
          .string()
          .optional()
          .describe("Return deployments updated after the specified date"),
        updated_before: z
          .string()
          .optional()
          .describe("Return deployments updated before the specified date"),
        order_by: z
          .enum(["id", "iid", "created_at", "updated_at", "ref", "status", "environment"])
          .optional()
          .describe("Order deployments by"),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort deployments"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListDeploymentsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const deployments = await defaultClient.get(`/projects/${projectId}/deployments${query}`);
      return { content: [{ type: "text", text: JSON.stringify(deployments, null, 2) }] };
    },
  );
  toolRef11.disable();
  tools.set("list_deployments", toolRef11);

  const toolRef12 = server.registerTool(
    "get_deployment",
    {
      title: "Get Deployment",
      description: "Get details of a specific deployment in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        deployment_id: z.number().describe("The ID of the deployment"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetDeploymentSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const deployment = await defaultClient.get(
        `/projects/${projectId}/deployments/${args.deployment_id}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(deployment, null, 2) }] };
    },
  );
  toolRef12.disable();
  tools.set("get_deployment", toolRef12);

  const toolRef13 = server.registerTool(
    "list_environments",
    {
      title: "List Environments",
      description: "List environments in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        name: z.string().optional().describe("Return environments with this exact name"),
        search: z.string().optional().describe("Search environments by name"),
        states: z
          .enum(["available", "stopped"])
          .optional()
          .describe("Filter environments by state"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListEnvironmentsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const environments = await defaultClient.get(`/projects/${projectId}/environments${query}`);
      return { content: [{ type: "text", text: JSON.stringify(environments, null, 2) }] };
    },
  );
  toolRef13.disable();
  tools.set("list_environments", toolRef13);

  const toolRef14 = server.registerTool(
    "get_environment",
    {
      title: "Get Environment",
      description: "Get details of a specific environment in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        environment_id: z.number().describe("The ID of the environment"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetEnvironmentSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const environment = await defaultClient.get(
        `/projects/${projectId}/environments/${args.environment_id}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(environment, null, 2) }] };
    },
  );
  toolRef14.disable();
  tools.set("get_environment", toolRef14);

  const toolRef15 = server.registerTool(
    "list_pipeline_trigger_jobs",
    {
      title: "List Pipeline Trigger Jobs",
      description:
        "List all trigger jobs (bridges) in a specific pipeline that trigger downstream pipelines",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        pipeline_id: z.number().describe("The ID of the pipeline"),
        scope: z
          .enum([
            "canceled",
            "canceling",
            "created",
            "failed",
            "manual",
            "pending",
            "preparing",
            "running",
            "scheduled",
            "skipped",
            "success",
            "waiting_for_resource",
          ])
          .optional()
          .describe("The scope of trigger jobs to show"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListPipelineTriggerJobsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({
        scope: args.scope,
        page: args.page,
        per_page: args.per_page,
      });

      const triggerJobs = await defaultClient.get(
        `/projects/${projectId}/pipelines/${args.pipeline_id}/bridges${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(triggerJobs, null, 2) }] };
    },
  );
  toolRef15.disable();
  tools.set("list_pipeline_trigger_jobs", toolRef15);

  const toolRef16 = server.registerTool(
    "get_pipeline_job",
    {
      title: "Get Pipeline Job",
      description: "Get details of a GitLab pipeline job number",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        job_id: z.number().describe("The ID of the job"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetPipelineJobSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const job = await defaultClient.get(`/projects/${projectId}/jobs/${args.job_id}`);
      return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
    },
  );
  toolRef16.disable();
  tools.set("get_pipeline_job", toolRef16);

  const toolRef17 = server.registerTool(
    "list_job_artifacts",
    {
      title: "List Job Artifacts",
      description:
        "List artifact files in a job's artifacts archive. Returns file names, paths, types, and sizes.",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        job_id: z.number().describe("The ID of the job"),
        path: z
          .string()
          .optional()
          .describe("Directory path within the artifacts archive (defaults to root)"),
        recursive: z.boolean().optional().describe("Whether to list artifacts recursively"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = ListJobArtifactsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({
        path: args.path,
        recursive: args.recursive,
      });

      const artifacts = await defaultClient.get(
        `/projects/${projectId}/jobs/${args.job_id}/artifacts/tree${query}`,
      );
      return { content: [{ type: "text", text: JSON.stringify(artifacts, null, 2) }] };
    },
  );
  toolRef17.disable();
  tools.set("list_job_artifacts", toolRef17);

  const toolRef18 = server.registerTool(
    "download_job_artifacts",
    {
      title: "Download Job Artifacts",
      description:
        "Download the entire artifact archive (zip) for a job. Returns the artifact archive content.",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        job_id: z.number().describe("The ID of the job"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = DownloadJobArtifactsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const response = await defaultClient.rawFetch(
        `/projects/${projectId}/jobs/${args.job_id}/artifacts`,
      );

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return {
        content: [
          {
            type: "text",
            text: `Artifact archive (${buffer.byteLength} bytes, base64-encoded):\n${base64}`,
          },
        ],
      };
    },
  );
  toolRef18.disable();
  tools.set("download_job_artifacts", toolRef18);

  const toolRef19 = server.registerTool(
    "get_job_artifact_file",
    {
      title: "Get Job Artifact File",
      description:
        "Get the content of a single file from a job's artifacts by its path within the archive",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        job_id: z.number().describe("The ID of the job"),
        artifact_path: z.string().describe("Path to the file within the artifacts archive"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const args = GetJobArtifactFileSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const encodedArtifactPath = args.artifact_path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

      const response = await defaultClient.rawFetch(
        `/projects/${projectId}/jobs/${args.job_id}/artifacts/${encodedArtifactPath}`,
      );

      const text = await response.text();
      return { content: [{ type: "text", text }] };
    },
  );
  toolRef19.disable();
  tools.set("get_job_artifact_file", toolRef19);

  logger.debug("Pipeline tools registered", { count: tools.size });
  return tools;
}

import { z } from "zod";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { buildQueryString, defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

const SearchRepositoriesSchema = z.object({
  search: z.string().describe("Search query"),
  page: z.number().optional().describe("Page number for pagination"),
  per_page: z.number().optional().describe("Number of results per page"),
});

const GetFileContentsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  file_path: z.string().describe("Path to the file in the repository"),
  ref: z.string().optional().describe("Branch, tag, or commit SHA"),
});

const CreateRepositorySchema = z.object({
  name: z.string().describe("Name of the new project"),
  description: z.string().optional().describe("Project description"),
  visibility: z.enum(["private", "internal", "public"]).optional().describe("Project visibility"),
  initialize_with_readme: z.boolean().optional().describe("Initialize with README"),
  namespace_id: z.number().optional().describe("Namespace ID for the project"),
});

const ForkRepositorySchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path to fork"),
  namespace_id: z.number().optional().describe("Target namespace ID"),
  name: z.string().optional().describe("New project name"),
  path: z.string().optional().describe("New project path"),
});

const CreateBranchSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  branch: z.string().describe("Name of the new branch"),
  ref: z.string().describe("Source branch or commit SHA"),
});

const GetRepositoryTreeSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  path: z.string().optional().describe("Path inside repository"),
  ref: z.string().optional().describe("Branch, tag, or commit SHA"),
  recursive: z.boolean().optional().describe("Get tree recursively"),
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page"),
});

const CreateOrUpdateFileSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  file_path: z.string().describe("Path to the file"),
  branch: z.string().describe("Target branch"),
  content: z.string().describe("File content"),
  commit_message: z.string().describe("Commit message"),
  author_email: z.string().optional().describe("Author email"),
  author_name: z.string().optional().describe("Author name"),
});

const PushFilesSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  branch: z.string().describe("Target branch"),
  commit_message: z.string().describe("Commit message"),
  files: z
    .array(
      z.object({
        file_path: z.string(),
        content: z.string(),
        action: z.enum(["create", "update", "delete"]).optional(),
      }),
    )
    .describe("Files to push"),
  start_branch: z.string().optional().describe("Source branch if creating new branch"),
});

const GetBranchDiffsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
  from: z.string().describe("Source branch or commit"),
  to: z.string().describe("Target branch or commit"),
  straight: z.boolean().optional().describe("Use straight comparison"),
});

export function registerRepositoryTools(target: ToolRegistrationTarget, logger: Logger): void {
  logger.debug("Registering repository tools");

  target.registerTool(
    "search_repositories",
    {
      title: "Search Repositories",
      description: "Search for GitLab projects",
      inputSchema: {
        search: z.string().describe("Search query"),
        page: z.number().optional().describe("Page number for pagination"),
        per_page: z.number().optional().describe("Number of results per page"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      const args = SearchRepositoriesSchema.parse(params);
      const query = buildQueryString({
        search: args.search,
        page: args.page,
        per_page: args.per_page,
      });

      const projects = await defaultClient.get(`/projects${query}`);
      return {
        content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
      };
    },
  );

  target.registerTool(
    "get_file_contents",
    {
      title: "Get File Contents",
      description: "Get the contents of a file or directory from a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        file_path: z.string().describe("Path to the file in the repository"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      const args = GetFileContentsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const filePath = encodeURIComponent(args.file_path);
      const query = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : "";

      const file = await defaultClient.get(
        `/projects/${projectId}/repository/files/${filePath}${query}`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(file, null, 2) }],
      };
    },
  );

  target.registerTool(
    "create_repository",
    {
      title: "Create Repository",
      description: "Create a new GitLab project",
      inputSchema: {
        name: z.string().describe("Name of the new project"),
        description: z.string().optional().describe("Project description"),
        visibility: z
          .enum(["private", "internal", "public"])
          .optional()
          .describe("Project visibility"),
        initialize_with_readme: z.boolean().optional().describe("Initialize with README"),
        namespace_id: z.number().optional().describe("Namespace ID for the project"),
      },
      annotations: {
        destructiveHint: false,
      },
    },
    async (params) => {
      const args = CreateRepositorySchema.parse(params);
      const project = await defaultClient.post("/projects", args);
      return {
        content: [{ type: "text", text: JSON.stringify(project, null, 2) }],
      };
    },
  );

  target.registerTool(
    "fork_repository",
    {
      title: "Fork Repository",
      description: "Fork a GitLab project to your account or specified namespace",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path to fork"),
        namespace_id: z.number().optional().describe("Target namespace ID"),
        name: z.string().optional().describe("New project name"),
        path: z.string().optional().describe("New project path"),
      },
      annotations: {
        destructiveHint: false,
      },
    },
    async (params) => {
      const args = ForkRepositorySchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...body } = args;

      const fork = await defaultClient.post(`/projects/${projectId}/fork`, body);
      return {
        content: [{ type: "text", text: JSON.stringify(fork, null, 2) }],
      };
    },
  );

  target.registerTool(
    "create_branch",
    {
      title: "Create Branch",
      description: "Create a new branch in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        branch: z.string().describe("Name of the new branch"),
        ref: z.string().describe("Source branch or commit SHA"),
      },
      annotations: {
        destructiveHint: false,
      },
    },
    async (params) => {
      const args = CreateBranchSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const branch = await defaultClient.post(`/projects/${projectId}/repository/branches`, {
        branch: args.branch,
        ref: args.ref,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(branch, null, 2) }],
      };
    },
  );

  target.registerTool(
    "get_repository_tree",
    {
      title: "Get Repository Tree",
      description: "Get the repository tree for a GitLab project (list files and directories)",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        path: z.string().optional().describe("Path inside repository"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA"),
        recursive: z.boolean().optional().describe("Get tree recursively"),
        page: z.number().optional().describe("Page number"),
        per_page: z.number().optional().describe("Results per page"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      const args = GetRepositoryTreeSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const { project_id: _, ...queryParams } = args;
      const query = buildQueryString(queryParams);

      const tree = await defaultClient.get(`/projects/${projectId}/repository/tree${query}`);
      return {
        content: [{ type: "text", text: JSON.stringify(tree, null, 2) }],
      };
    },
  );

  target.registerTool(
    "create_or_update_file",
    {
      title: "Create or Update File",
      description: "Create or update a single file in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        file_path: z.string().describe("Path to the file"),
        branch: z.string().describe("Target branch"),
        content: z.string().describe("File content"),
        commit_message: z.string().describe("Commit message"),
        author_email: z.string().optional().describe("Author email"),
        author_name: z.string().optional().describe("Author name"),
      },
      annotations: {
        destructiveHint: true,
      },
    },
    async (params) => {
      const args = CreateOrUpdateFileSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const filePath = encodeURIComponent(args.file_path);

      const body = {
        branch: args.branch,
        content: Buffer.from(args.content).toString("base64"),
        commit_message: args.commit_message,
        encoding: "base64",
        author_email: args.author_email,
        author_name: args.author_name,
      };

      // Check if file exists to determine POST (create) vs PUT (update)
      let fileExists = false;
      try {
        const ref = args.branch ? `?ref=${encodeURIComponent(args.branch)}` : "";
        await defaultClient.get(`/projects/${projectId}/repository/files/${filePath}${ref}`);
        fileExists = true;
      } catch {
        // File doesn't exist, will create
      }

      const endpoint = `/projects/${projectId}/repository/files/${filePath}`;
      const result = fileExists
        ? await defaultClient.put(endpoint, body)
        : await defaultClient.post(endpoint, body);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  target.registerTool(
    "push_files",
    {
      title: "Push Files",
      description: "Push multiple files to a GitLab project in a single commit",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        branch: z.string().describe("Target branch"),
        commit_message: z.string().describe("Commit message"),
        files: z
          .array(
            z.object({
              file_path: z.string(),
              content: z.string(),
              action: z.enum(["create", "update", "delete"]).optional(),
            }),
          )
          .describe("Files to push"),
        start_branch: z.string().optional().describe("Source branch if creating new branch"),
      },
      annotations: {
        destructiveHint: true,
      },
    },
    async (params) => {
      const args = PushFilesSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);

      const actions = args.files.map((file) => ({
        action: file.action ?? "create",
        file_path: file.file_path,
        content: file.content,
      }));

      const result = await defaultClient.post(`/projects/${projectId}/repository/commits`, {
        branch: args.branch,
        commit_message: args.commit_message,
        actions,
        start_branch: args.start_branch,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  target.registerTool(
    "get_branch_diffs",
    {
      title: "Get Branch Diffs",
      description: "Get the changes/diffs between two branches or commits in a GitLab project",
      inputSchema: {
        project_id: z.string().describe("Project ID or URL-encoded path"),
        from: z.string().describe("Source branch or commit"),
        to: z.string().describe("Target branch or commit"),
        straight: z.boolean().optional().describe("Use straight comparison"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      const args = GetBranchDiffsSchema.parse(params);
      const projectId = encodeProjectId(args.project_id);
      const query = buildQueryString({
        from: args.from,
        to: args.to,
        straight: args.straight,
      });

      const diffs = await defaultClient.get(`/projects/${projectId}/repository/compare${query}`);
      return {
        content: [{ type: "text", text: JSON.stringify(diffs, null, 2) }],
      };
    },
  );

  logger.debug("Repository tools registered", { count: 9 });
}

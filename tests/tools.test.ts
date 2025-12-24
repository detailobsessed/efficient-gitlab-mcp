import { describe, expect, it } from "bun:test";
import { createRegistryAdapter } from "../src/registry/tool-adapter.js";
import { ToolRegistry } from "../src/registry/tool-registry.js";
import { registerCommitTools } from "../src/tools/commits.js";
import { registerIssueTools } from "../src/tools/issues.js";
import { registerMergeRequestTools } from "../src/tools/merge-requests.js";
import { registerNamespaceTools } from "../src/tools/namespaces.js";
import { registerPipelineTools } from "../src/tools/pipelines.js";
import { registerProjectTools } from "../src/tools/projects.js";
import { registerRepositoryTools } from "../src/tools/repositories.js";
import { registerSearchTools } from "../src/tools/search.js";
import { registerUserTools } from "../src/tools/users.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

describe("Tool Registration", () => {
  describe("registerRepositoryTools", () => {
    it("should register all repository tools", () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "repositories");

      registerRepositoryTools(adapter, logger);

      const tools = registry.listTools("repositories");
      expect(tools.length).toBe(9);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("search_repositories");
      expect(toolNames).toContain("get_file_contents");
      expect(toolNames).toContain("create_repository");
      expect(toolNames).toContain("fork_repository");
      expect(toolNames).toContain("create_branch");
      expect(toolNames).toContain("get_repository_tree");
      expect(toolNames).toContain("create_or_update_file");
      expect(toolNames).toContain("push_files");
      expect(toolNames).toContain("get_branch_diffs");
    });

    it("should register tools with correct annotations", () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "repositories");

      registerRepositoryTools(adapter, logger);

      const searchSchema = registry.getToolSchema("search_repositories");
      expect(searchSchema).not.toBeNull();
      expect(searchSchema?.title).toBe("Search Repositories");
    });
  });

  describe("registerMergeRequestTools", () => {
    it("should register all merge request tools", () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "merge-requests");

      registerMergeRequestTools(adapter, logger);

      const tools = registry.listTools("merge-requests");
      expect(tools.length).toBe(13);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("get_merge_request");
      expect(toolNames).toContain("list_merge_requests");
      expect(toolNames).toContain("create_merge_request");
      expect(toolNames).toContain("update_merge_request");
      expect(toolNames).toContain("merge_merge_request");
      expect(toolNames).toContain("get_merge_request_diffs");
      expect(toolNames).toContain("mr_discussions");
    });
  });

  describe("registerIssueTools", () => {
    it("should register all issue tools", () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "issues");

      registerIssueTools(adapter, logger);

      const tools = registry.listTools("issues");
      expect(tools.length).toBe(12);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("create_issue");
      expect(toolNames).toContain("list_issues");
      expect(toolNames).toContain("my_issues");
      expect(toolNames).toContain("get_issue");
      expect(toolNames).toContain("update_issue");
      expect(toolNames).toContain("delete_issue");
      expect(toolNames).toContain("list_issue_links");
      expect(toolNames).toContain("create_issue_link");
    });
  });

  describe("registerProjectTools", () => {
    it("should register all project tools", () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "projects");

      registerProjectTools(adapter, logger);

      const tools = registry.listTools("projects");
      expect(tools.length).toBe(9);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("get_project");
      expect(toolNames).toContain("list_projects");
      expect(toolNames).toContain("list_project_members");
      expect(toolNames).toContain("list_labels");
      expect(toolNames).toContain("get_label");
      expect(toolNames).toContain("create_label");
      expect(toolNames).toContain("update_label");
      expect(toolNames).toContain("delete_label");
      expect(toolNames).toContain("list_group_projects");
    });
  });

  describe("registerPipelineTools", () => {
    it("should register all pipeline tools", () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "pipelines");

      registerPipelineTools(adapter, logger);

      const tools = registry.listTools("pipelines");
      expect(tools.length).toBe(10);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("list_pipelines");
      expect(toolNames).toContain("get_pipeline");
      expect(toolNames).toContain("create_pipeline");
      expect(toolNames).toContain("retry_pipeline");
      expect(toolNames).toContain("cancel_pipeline");
      expect(toolNames).toContain("list_pipeline_jobs");
      expect(toolNames).toContain("get_pipeline_job_output");
      expect(toolNames).toContain("play_pipeline_job");
      expect(toolNames).toContain("retry_pipeline_job");
      expect(toolNames).toContain("cancel_pipeline_job");
    });
  });

  describe("registerCommitTools", () => {
    it("should register all commit tools", () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "commits");

      registerCommitTools(adapter, logger);

      const tools = registry.listTools("commits");
      expect(tools.length).toBe(3);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("list_commits");
      expect(toolNames).toContain("get_commit");
      expect(toolNames).toContain("get_commit_diff");
    });
  });

  describe("registerNamespaceTools", () => {
    it("should register all namespace tools", () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "namespaces");

      registerNamespaceTools(adapter, logger);

      const tools = registry.listTools("namespaces");
      expect(tools.length).toBe(3);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("list_namespaces");
      expect(toolNames).toContain("get_namespace");
      expect(toolNames).toContain("verify_namespace");
    });
  });

  describe("registerUserTools", () => {
    it("should register all user tools", () => {
      const registry = new ToolRegistry();
      const adapter = createRegistryAdapter(registry, "users");

      registerUserTools(adapter, logger);

      const tools = registry.listTools("users");
      expect(tools.length).toBe(3);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("get_users");
      expect(toolNames).toContain("get_user");
      expect(toolNames).toContain("search_users");
    });
  });

  describe("All tools combined", () => {
    it("should register 52 tools across 7 categories (without pipelines)", () => {
      const registry = new ToolRegistry();

      registerRepositoryTools(createRegistryAdapter(registry, "repositories"), logger);
      registerMergeRequestTools(createRegistryAdapter(registry, "merge-requests"), logger);
      registerIssueTools(createRegistryAdapter(registry, "issues"), logger);
      registerProjectTools(createRegistryAdapter(registry, "projects"), logger);
      registerCommitTools(createRegistryAdapter(registry, "commits"), logger);
      registerNamespaceTools(createRegistryAdapter(registry, "namespaces"), logger);
      registerUserTools(createRegistryAdapter(registry, "users"), logger);
      registerSearchTools(createRegistryAdapter(registry, "search"), logger);

      const allTools = registry.getAllToolNames();
      expect(allTools.length).toBe(55);

      const categories = registry.listCategories();
      expect(categories.length).toBe(8);
    });

    it("should register 62 tools with pipelines enabled", () => {
      const registry = new ToolRegistry();

      registerRepositoryTools(createRegistryAdapter(registry, "repositories"), logger);
      registerMergeRequestTools(createRegistryAdapter(registry, "merge-requests"), logger);
      registerIssueTools(createRegistryAdapter(registry, "issues"), logger);
      registerProjectTools(createRegistryAdapter(registry, "projects"), logger);
      registerCommitTools(createRegistryAdapter(registry, "commits"), logger);
      registerNamespaceTools(createRegistryAdapter(registry, "namespaces"), logger);
      registerUserTools(createRegistryAdapter(registry, "users"), logger);
      registerSearchTools(createRegistryAdapter(registry, "search"), logger);
      registerPipelineTools(createRegistryAdapter(registry, "pipelines"), logger);

      const allTools = registry.getAllToolNames();
      expect(allTools.length).toBe(65);

      const categories = registry.listCategories();
      expect(categories.length).toBe(9);
    });

    it("should make all tools searchable", () => {
      const registry = new ToolRegistry();

      registerRepositoryTools(createRegistryAdapter(registry, "repositories"), logger);
      registerMergeRequestTools(createRegistryAdapter(registry, "merge-requests"), logger);
      registerIssueTools(createRegistryAdapter(registry, "issues"), logger);

      const mergeResults = registry.searchTools("merge");
      expect(mergeResults.length).toBeGreaterThan(0);
      expect(mergeResults.some((t) => t.name.includes("merge"))).toBe(true);

      const issueResults = registry.searchTools("issue");
      expect(issueResults.length).toBeGreaterThan(0);

      const repoResults = registry.searchTools("repository");
      expect(repoResults.length).toBeGreaterThan(0);
    });
  });
});

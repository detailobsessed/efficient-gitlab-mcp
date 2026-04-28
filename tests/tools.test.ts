import { describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCommitTools } from "../src/tools/commits.js";
import { registerGraphqlTools } from "../src/tools/graphql.js";
import { registerIssueTools } from "../src/tools/issues.js";
import { registerMergeRequestTools } from "../src/tools/merge-requests.js";
import { registerMilestoneTools } from "../src/tools/milestones.js";
import { registerNamespaceTools } from "../src/tools/namespaces.js";
import { registerPipelineTools } from "../src/tools/pipelines.js";
import { registerProjectTools } from "../src/tools/projects.js";
import { registerReactionTools } from "../src/tools/reactions.js";
import { registerReleaseTools } from "../src/tools/releases.js";
import { registerRepositoryTools } from "../src/tools/repositories.js";
import { registerSearchTools } from "../src/tools/search.js";
import { registerUserTools } from "../src/tools/users.js";
import { registerWebhookTools } from "../src/tools/webhooks.js";
import { registerWikiTools } from "../src/tools/wiki.js";
import { registerWorkItemTools } from "../src/tools/work-items.js";
import { Logger } from "../src/utils/logger.js";

const logger = new Logger("error", "pretty");

function createTestServer(): McpServer {
  return new McpServer(
    { name: "test", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } },
  );
}

describe("Tool Registration", () => {
  describe("registerRepositoryTools", () => {
    it("should register all repository tools and return map", () => {
      const server = createTestServer();
      const tools = registerRepositoryTools(server, logger);

      expect(tools.size).toBe(11);
      expect(tools.has("search_repositories")).toBe(true);
      expect(tools.has("get_file_contents")).toBe(true);
      expect(tools.has("create_repository")).toBe(true);
      expect(tools.has("fork_repository")).toBe(true);
      expect(tools.has("create_branch")).toBe(true);
      expect(tools.has("list_branches")).toBe(true);
      expect(tools.has("get_branch")).toBe(true);
      expect(tools.has("get_repository_tree")).toBe(true);
      expect(tools.has("create_or_update_file")).toBe(true);
      expect(tools.has("push_files")).toBe(true);
      expect(tools.has("get_branch_diffs")).toBe(true);
    });

    it("should register all tools as disabled", () => {
      const server = createTestServer();
      const tools = registerRepositoryTools(server, logger);

      for (const [, tool] of tools) {
        expect(tool.enabled).toBe(false);
      }
    });
  });

  describe("registerMergeRequestTools", () => {
    it("should register all merge request tools", () => {
      const server = createTestServer();
      const tools = registerMergeRequestTools(server, logger);

      expect(tools.size).toBe(33);
      expect(tools.has("get_merge_request")).toBe(true);
      expect(tools.has("list_merge_requests")).toBe(true);
      expect(tools.has("create_merge_request")).toBe(true);
      expect(tools.has("merge_merge_request")).toBe(true);
      expect(tools.has("mr_discussions")).toBe(true);
      expect(tools.has("approve_merge_request")).toBe(true);
      expect(tools.has("list_draft_notes")).toBe(true);
    });
  });

  describe("registerIssueTools", () => {
    it("should register all issue tools", () => {
      const server = createTestServer();
      const tools = registerIssueTools(server, logger);

      expect(tools.size).toBe(14);
      expect(tools.has("create_issue")).toBe(true);
      expect(tools.has("list_issues")).toBe(true);
      expect(tools.has("my_issues")).toBe(true);
      expect(tools.has("get_issue")).toBe(true);
      expect(tools.has("update_issue")).toBe(true);
      expect(tools.has("delete_issue")).toBe(true);
      expect(tools.has("get_issue_link")).toBe(true);
      expect(tools.has("create_note")).toBe(true);
    });
  });

  describe("registerProjectTools", () => {
    it("should register all project tools", () => {
      const server = createTestServer();
      const tools = registerProjectTools(server, logger);

      expect(tools.size).toBe(10);
      expect(tools.has("get_project")).toBe(true);
      expect(tools.has("list_labels")).toBe(true);
      expect(tools.has("list_group_iterations")).toBe(true);
    });
  });

  describe("registerPipelineTools", () => {
    it("should register all pipeline tools", () => {
      const server = createTestServer();
      const tools = registerPipelineTools(server, logger);

      expect(tools.size).toBe(19);
      expect(tools.has("list_pipelines")).toBe(true);
      expect(tools.has("create_pipeline")).toBe(true);
      expect(tools.has("list_deployments")).toBe(true);
      expect(tools.has("list_environments")).toBe(true);
    });
  });

  describe("registerCommitTools", () => {
    it("should register all commit tools", () => {
      const server = createTestServer();
      const tools = registerCommitTools(server, logger);

      expect(tools.size).toBe(3);
      expect(tools.has("list_commits")).toBe(true);
      expect(tools.has("get_commit")).toBe(true);
      expect(tools.has("get_commit_diff")).toBe(true);
    });
  });

  describe("registerNamespaceTools", () => {
    it("should register all namespace tools", () => {
      const server = createTestServer();
      const tools = registerNamespaceTools(server, logger);

      expect(tools.size).toBe(3);
    });
  });

  describe("registerUserTools", () => {
    it("should register all user tools", () => {
      const server = createTestServer();
      const tools = registerUserTools(server, logger);

      expect(tools.size).toBe(8);
      expect(tools.has("get_current_user")).toBe(true);
    });
  });

  describe("registerSearchTools", () => {
    it("should register all search tools", () => {
      const server = createTestServer();
      const tools = registerSearchTools(server, logger);

      expect(tools.size).toBe(6);
    });
  });

  describe("registerReactionTools", () => {
    it("should register all 18 emoji-reaction tools", () => {
      const server = createTestServer();
      const tools = registerReactionTools(server, logger);

      expect(tools.size).toBe(18);
      // MR-level reactions
      expect(tools.has("list_merge_request_emoji_reactions")).toBe(true);
      expect(tools.has("create_merge_request_emoji_reaction")).toBe(true);
      expect(tools.has("delete_merge_request_emoji_reaction")).toBe(true);
      // MR-note reactions
      expect(tools.has("list_merge_request_note_emoji_reactions")).toBe(true);
      expect(tools.has("create_merge_request_note_emoji_reaction")).toBe(true);
      expect(tools.has("delete_merge_request_note_emoji_reaction")).toBe(true);
      // Issue-level reactions
      expect(tools.has("list_issue_emoji_reactions")).toBe(true);
      expect(tools.has("create_issue_emoji_reaction")).toBe(true);
      expect(tools.has("delete_issue_emoji_reaction")).toBe(true);
      // Issue-note reactions
      expect(tools.has("list_issue_note_emoji_reactions")).toBe(true);
      expect(tools.has("create_issue_note_emoji_reaction")).toBe(true);
      expect(tools.has("delete_issue_note_emoji_reaction")).toBe(true);
      // Work-item (GraphQL) reactions
      expect(tools.has("list_work_item_emoji_reactions")).toBe(true);
      expect(tools.has("create_work_item_emoji_reaction")).toBe(true);
      expect(tools.has("delete_work_item_emoji_reaction")).toBe(true);
      // Work-item note (GraphQL) reactions
      expect(tools.has("list_work_item_note_emoji_reactions")).toBe(true);
      expect(tools.has("create_work_item_note_emoji_reaction")).toBe(true);
      expect(tools.has("delete_work_item_note_emoji_reaction")).toBe(true);
    });
  });

  describe("All tools combined", () => {
    it("should register all tools across all categories (without pipelines)", () => {
      const server = createTestServer();
      let total = 0;

      total += registerRepositoryTools(server, logger).size;
      total += registerMergeRequestTools(server, logger).size;
      total += registerIssueTools(server, logger).size;
      total += registerProjectTools(server, logger).size;
      total += registerCommitTools(server, logger).size;
      total += registerNamespaceTools(server, logger).size;
      total += registerUserTools(server, logger).size;
      total += registerSearchTools(server, logger).size;
      total += registerWikiTools(server, logger).size;
      total += registerMilestoneTools(server, logger).size;
      total += registerReleaseTools(server, logger).size;
      total += registerWebhookTools(server, logger).size;
      total += registerWorkItemTools(server, logger).size;
      total += registerGraphqlTools(server, logger).size;
      total += registerReactionTools(server, logger).size;

      expect(total).toBe(148);
    });

    it("should register all tools with pipelines enabled", () => {
      const server = createTestServer();
      let total = 0;

      total += registerRepositoryTools(server, logger).size;
      total += registerMergeRequestTools(server, logger).size;
      total += registerIssueTools(server, logger).size;
      total += registerProjectTools(server, logger).size;
      total += registerCommitTools(server, logger).size;
      total += registerNamespaceTools(server, logger).size;
      total += registerUserTools(server, logger).size;
      total += registerSearchTools(server, logger).size;
      total += registerPipelineTools(server, logger).size;
      total += registerWikiTools(server, logger).size;
      total += registerMilestoneTools(server, logger).size;
      total += registerReleaseTools(server, logger).size;
      total += registerWebhookTools(server, logger).size;
      total += registerWorkItemTools(server, logger).size;
      total += registerGraphqlTools(server, logger).size;
      total += registerReactionTools(server, logger).size;

      expect(total).toBe(167);
    });

    it("should all start disabled", () => {
      const server = createTestServer();
      const allTools = [
        ...registerRepositoryTools(server, logger).values(),
        ...registerIssueTools(server, logger).values(),
        ...registerSearchTools(server, logger).values(),
      ];

      for (const tool of allTools) {
        expect(tool.enabled).toBe(false);
      }
    });

    it("should be enableable via RegisteredTool.enable()", () => {
      const server = createTestServer();
      const tools = registerRepositoryTools(server, logger);

      const searchRepo = tools.get("search_repositories");
      expect(searchRepo?.enabled).toBe(false);

      searchRepo?.enable();
      expect(searchRepo?.enabled).toBe(true);
    });
  });
});

/**
 * Emoji reaction tools — added on top of GitLab's `/award_emoji` REST family
 * (for MRs and issues) and the `awardEmoji*` GraphQL mutations (for work items).
 *
 * Scaffolding only at this point (DOT-521.1). Tools are added in subsequent
 * subtasks:
 *   - DOT-521.2: REST tools for merge_request reactions (6 tools)
 *   - DOT-521.3: REST tools for issue reactions (6 tools)
 *   - DOT-521.4: GraphQL tools for work_item reactions (6 tools)
 *   - DOT-521.5: read-only mode integration + tool-count regression updates
 */

import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../utils/logger.js";

export function registerReactionTools(
  _server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering emoji-reaction tools (scaffolding — no tools yet)");
  const tools = new Map<string, RegisteredTool>();
  return tools;
}

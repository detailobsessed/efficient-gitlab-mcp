/**
 * PAT Scope Auto-Detection
 *
 * Inspects the current GitLab Personal Access Token's scopes via
 * GET /personal_access_tokens/self to determine if the server should
 * operate in read-only mode.
 */

import type { GitLabClient } from "./gitlab-client.js";
import type { Logger } from "./logger.js";

interface TokenSelfResponse {
  scopes?: string[];
}

/**
 * Detect whether the current PAT is read-only by checking its scopes.
 *
 * @returns `true` if the token lacks the `api` scope (read-only),
 *          `false` if it has the `api` scope (full access),
 *          `null` if detection failed (endpoint unavailable, CI job token, etc.)
 */
export async function detectReadOnlyFromScopes(
  client: GitLabClient,
  logger: Logger,
): Promise<boolean | null> {
  try {
    const response = await client.get<TokenSelfResponse>("/personal_access_tokens/self");

    if (!response?.scopes || !Array.isArray(response.scopes)) {
      logger.debug("PAT scope detection: no scopes in response");
      return null;
    }

    const hasFullApi = response.scopes.includes("api");
    logger.debug("PAT scope detection", { scopes: response.scopes, hasFullApi });
    return !hasFullApi;
  } catch {
    logger.debug("PAT scope detection unavailable (endpoint may not be supported)");
    return null;
  }
}

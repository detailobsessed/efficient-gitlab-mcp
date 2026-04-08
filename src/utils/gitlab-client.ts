import { loadConfig } from "../server/config.js";
import { Logger } from "./logger.js";

const config = loadConfig();
const logger = new Logger(config.logLevel, config.logFormat);

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

const SCOPE_GUIDANCE =
  "This may indicate insufficient token scopes. " +
  "Check your Personal Access Token scopes at GitLab > Settings > Access Tokens. " +
  "Required scope for write operations: 'api'. Read operations need 'read_api'.";

function throwIfForbidden(status: number, errorBody: string, prefix: string): void {
  if (status !== 403) return;
  if (errorBody.includes("Rate limit")) {
    logger.error("GitLab API Rate Limit Exceeded", { error: errorBody });
    throw new Error(`GitLab API Rate Limit Exceeded: ${errorBody}`);
  }
  throw new Error(`${prefix} permission denied (403): ${errorBody}\n\n${SCOPE_GUIDANCE}`);
}

export class GitLabClient {
  private apiUrl: string;
  private token: string;
  private tokenHeader: "PRIVATE-TOKEN" | "JOB-TOKEN";

  constructor(apiUrl?: string, token?: string) {
    this.apiUrl = apiUrl ?? config.gitlabApiUrl;

    const pat = token ?? config.gitlabPersonalAccessToken;
    const jobToken = config.ciJobToken;

    if (pat) {
      this.token = pat;
      this.tokenHeader = "PRIVATE-TOKEN";
    } else if (jobToken) {
      this.token = jobToken;
      this.tokenHeader = "JOB-TOKEN";
    } else {
      this.token = "";
      this.tokenHeader = "PRIVATE-TOKEN";
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.token) {
      headers[this.tokenHeader] = this.token;
    }

    return headers;
  }

  async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.apiUrl}${endpoint}`;

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
      body: options.body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throwIfForbidden(response.status, errorBody, "GitLab API");
      throw new Error(`GitLab API error: ${response.status} ${response.statusText}\n${errorBody}`);
    }

    // Handle 204 No Content or empty responses (common for DELETE)
    if (response.status === 204) {
      return {} as T;
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.fetch<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.fetch<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.fetch<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.fetch<T>(endpoint, { method: "DELETE" });
  }

  /**
   * Raw fetch that returns the Response object directly.
   * Use for binary downloads, streaming, or multipart uploads
   * where the JSON-parsing fetch() method isn't appropriate.
   */
  async rawFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.apiUrl}${endpoint}`;

    const headers = new Headers(options.headers);
    if (this.token && !headers.has(this.tokenHeader)) {
      headers.set(this.tokenHeader, this.token);
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const errorBody = await response.text();
      throwIfForbidden(response.status, errorBody, "GitLab API");
      throw new Error(`GitLab API error: ${response.status} ${response.statusText}\n${errorBody}`);
    }

    return response;
  }

  async graphql<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const idx = this.apiUrl.lastIndexOf("/api/v4");
    const prefix = idx >= 0 ? this.apiUrl.slice(0, idx) : this.apiUrl;
    const graphqlUrl = process.env.GITLAB_GRAPHQL_URL || `${prefix}/api/graphql`;

    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throwIfForbidden(response.status, errorBody, "GraphQL");
      throw new Error(`GraphQL request failed (${response.status}): ${errorBody}`);
    }

    const json = (await response.json()) as { data: T; errors?: Array<{ message: string }> };
    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`);
    }
    return json.data;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }
}

export const defaultClient = new GitLabClient();

export function encodeProjectId(projectId: string): string {
  return encodeURIComponent(projectId);
}

/**
 * Resolve the effective project ID from an explicit parameter, env-based defaults,
 * and the allowed-projects security list.
 *
 * Two modes (mutually exclusive):
 * - With GITLAB_ALLOWED_PROJECT_IDS: explicit param (validated) > single-allowed default > error
 * - Without: explicit param > GITLAB_PROJECT_ID fallback > error
 *
 * Uses exact string matching — allowed list format must match what callers provide
 * (e.g., numeric ID vs namespace path).
 */
export function getEffectiveProjectId(
  paramProjectId?: string,
  configOverride?: { gitlabProjectId?: string; gitlabAllowedProjectIds: string[] },
): string {
  const { gitlabAllowedProjectIds, gitlabProjectId } = configOverride ?? config;

  if (gitlabAllowedProjectIds.length > 0) {
    if (paramProjectId) {
      if (!gitlabAllowedProjectIds.includes(paramProjectId)) {
        throw new Error(`Project "${paramProjectId}" is not in GITLAB_ALLOWED_PROJECT_IDS`);
      }
      return paramProjectId;
    }
    if (gitlabAllowedProjectIds.length === 1) {
      return gitlabAllowedProjectIds[0];
    }
    throw new Error("project_id is required when multiple allowed projects are configured");
  }

  if (paramProjectId) return paramProjectId;
  if (gitlabProjectId) return gitlabProjectId;

  throw new Error("project_id is required (or set GITLAB_PROJECT_ID / GITLAB_ALLOWED_PROJECT_IDS)");
}

/** Resolve effective project ID and URL-encode it for API paths. */
export function resolveProjectId(paramProjectId?: string): string {
  return encodeProjectId(getEffectiveProjectId(paramProjectId));
}

export function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        for (const item of value) {
          searchParams.append(`${key}[]`, String(item));
        }
      } else {
        searchParams.append(key, String(value));
      }
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

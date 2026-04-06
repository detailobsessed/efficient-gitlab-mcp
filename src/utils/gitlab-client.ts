import { loadConfig } from "../server/config.js";
import { Logger } from "./logger.js";

const config = loadConfig();
const logger = new Logger(config.logLevel, config.logFormat);

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export class GitLabClient {
  private apiUrl: string;
  private token: string;

  constructor(apiUrl?: string, token?: string) {
    this.apiUrl = apiUrl ?? config.gitlabApiUrl;
    this.token = token ?? process.env.GITLAB_PERSONAL_ACCESS_TOKEN ?? "";
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.token) {
      headers["PRIVATE-TOKEN"] = this.token;
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
      if (response.status === 403 && errorBody.includes("Rate limit")) {
        logger.error("GitLab API Rate Limit Exceeded", { error: errorBody });
        throw new Error(`GitLab API Rate Limit Exceeded: ${errorBody}`);
      }
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
    if (this.token && !headers.has("PRIVATE-TOKEN")) {
      headers.set("PRIVATE-TOKEN", this.token);
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const errorBody = await response.text();
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

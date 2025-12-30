import { loadConfig } from "../server/config.js";
import { Logger } from "./logger.js";

const config = loadConfig();
const logger = new Logger(config.logLevel, config.logFormat);

export interface FetchOptions {
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

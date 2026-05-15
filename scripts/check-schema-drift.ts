#!/usr/bin/env bun
/**
 * Schema-drift CI gate (DOT-559).
 *
 * Calls every response-schema-bearing GitLab REST endpoint against a real
 * GitLab instance and asserts the live response still matches its declared
 * Zod schema.
 *
 * Phase 1 (DOT-556) made the runtime `parseGitLabResponse` lenient on purpose
 * (.safeParse + log warning + pass-through) so users aren't blocked by minor
 * drift. This script is the strict counterpart: it calls `.parse()` directly,
 * collects every Zod error across endpoints, prints a structured summary, and
 * exits non-zero on any mismatch.
 *
 * Discovery: each list endpoint is checked first, the first record's ID is
 * harvested, and the singular endpoint is then exercised with that ID. No
 * per-endpoint fixture env vars.
 *
 * Env vars (re-uses runtime config from src/server/config.ts):
 *   GITLAB_API_URL                — defaults to https://gitlab.com
 *   GITLAB_PERSONAL_ACCESS_TOKEN  — read_api scope is sufficient
 *   GITLAB_PROJECT_ID             — fixture project; must have ≥ 1 MR,
 *                                   commit, issue, and pipeline reachable
 *                                   via the token. Lists that come back
 *                                   empty are recorded as skips (not
 *                                   failures) so the gate stays useful even
 *                                   for partially-populated fixtures.
 */

import { ZodError, type ZodTypeAny } from "zod";
import {
  GitLabCommitListSchema,
  GitLabCommitSchema,
} from "../src/schemas/commits.js";
import {
  GitLabIssueListSchema,
  GitLabIssueSchema,
} from "../src/schemas/issues.js";
import {
  GitLabMergeRequestListSchema,
  GitLabMergeRequestSchema,
} from "../src/schemas/merge-requests.js";
import {
  GitLabPipelineListSchema,
  GitLabPipelineSchema,
} from "../src/schemas/pipelines.js";
import {
  GitLabProjectListSchema,
  GitLabProjectSchema,
} from "../src/schemas/projects.js";
import { GitLabTreeListSchema } from "../src/schemas/repositories.js";
import {
  GitLabUserListSchema,
  GitLabUserSchema,
} from "../src/schemas/users.js";
import { loadConfig } from "../src/server/config.js";
import { GitLabClient } from "../src/utils/gitlab-client.js";

const SLEEP_MS = 250;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1000;

interface DriftFailure {
  endpoint: string;
  schema: string;
  issues: Array<{ path: string; code: string; message: string }>;
}

interface DriftSkip {
  endpoint: string;
  reason: string;
}

interface CheckContext {
  client: GitLabClient;
  failures: DriftFailure[];
  skips: DriftSkip[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (/GitLab API error: 5\d\d\b/.test(message)) return true;
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed/i.test(message)) return true;
  return false;
}

async function fetchWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === MAX_RETRIES) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${label}] transient error, retry ${attempt + 1}/${MAX_RETRIES}: ${message}`);
      await sleep(RETRY_BACKOFF_MS);
    }
  }
  throw lastErr;
}

function parseStrict<S extends ZodTypeAny>(
  label: string,
  schemaName: string,
  schema: S,
  value: unknown,
  failures: DriftFailure[],
): boolean {
  try {
    schema.parse(value);
    console.log(`✓ ${label}  [${schemaName}]`);
    return true;
  } catch (err) {
    if (err instanceof ZodError) {
      failures.push({
        endpoint: label,
        schema: schemaName,
        issues: err.issues.map((i) => ({
          path: i.path.join(".") || "<root>",
          code: i.code,
          message: i.message,
        })),
      });
      console.error(`✗ ${label}  [${schemaName}] — ${err.issues.length} issue(s)`);
      return false;
    }
    throw err;
  }
}

async function checkEndpoint<S extends ZodTypeAny>(
  ctx: CheckContext,
  label: string,
  path: string,
  schema: S,
  schemaName: string,
): Promise<unknown> {
  return fetchWithRetry(label, async () => {
    const resp = await ctx.client.get<unknown>(path);
    parseStrict(label, schemaName, schema, resp, ctx.failures);
    await sleep(SLEEP_MS);
    return resp;
  });
}

/**
 * Hit a list endpoint, then use the first record's `idKey` to hit the
 * matching singular endpoint. Records a skip if the list is empty.
 */
async function checkListAndSingle<L extends ZodTypeAny, S extends ZodTypeAny>(args: {
  ctx: CheckContext;
  listPath: string;
  listLabel: string;
  listSchema: L;
  listSchemaName: string;
  idKey: string;
  singlePath: (id: string | number) => string;
  singleLabel: (id: string | number) => string;
  singleSchema: S;
  singleSchemaName: string;
}): Promise<void> {
  const { ctx } = args;
  const list = await checkEndpoint(
    ctx,
    args.listLabel,
    args.listPath,
    args.listSchema,
    args.listSchemaName,
  );

  if (!Array.isArray(list) || list.length === 0) {
    ctx.skips.push({
      endpoint: args.singleLabel("<n/a>"),
      reason: `list ${args.listLabel} returned 0 records`,
    });
    return;
  }

  const first = list[0] as Record<string, unknown>;
  const id = first[args.idKey];
  if (typeof id !== "string" && typeof id !== "number") {
    ctx.skips.push({
      endpoint: args.singleLabel("<n/a>"),
      reason: `first record from ${args.listLabel} has no "${args.idKey}" field`,
    });
    return;
  }

  await checkEndpoint(
    ctx,
    args.singleLabel(id),
    args.singlePath(id),
    args.singleSchema,
    args.singleSchemaName,
  );
}

async function runChecks(client: GitLabClient, projectId: string): Promise<{ failures: DriftFailure[]; skips: DriftSkip[] }> {
  const ctx: CheckContext = { client, failures: [], skips: [] };
  const enc = encodeURIComponent(projectId);

  // projects
  await checkEndpoint(ctx, `GET /projects/${projectId}`, `/projects/${enc}`, GitLabProjectSchema, "GitLabProjectSchema");
  await checkEndpoint(ctx, "GET /projects", "/projects?per_page=5", GitLabProjectListSchema, "GitLabProjectListSchema");

  // merge requests
  await checkListAndSingle({
    ctx,
    listPath: `/projects/${enc}/merge_requests?state=all&per_page=1`,
    listLabel: `GET /projects/${projectId}/merge_requests`,
    listSchema: GitLabMergeRequestListSchema,
    listSchemaName: "GitLabMergeRequestListSchema",
    idKey: "iid",
    singlePath: (id) => `/projects/${enc}/merge_requests/${id}`,
    singleLabel: (id) => `GET /projects/${projectId}/merge_requests/${id}`,
    singleSchema: GitLabMergeRequestSchema,
    singleSchemaName: "GitLabMergeRequestSchema",
  });

  // commits
  await checkListAndSingle({
    ctx,
    listPath: `/projects/${enc}/repository/commits?per_page=1`,
    listLabel: `GET /projects/${projectId}/repository/commits`,
    listSchema: GitLabCommitListSchema,
    listSchemaName: "GitLabCommitListSchema",
    idKey: "id",
    singlePath: (sha) => `/projects/${enc}/repository/commits/${sha}`,
    singleLabel: (sha) => `GET /projects/${projectId}/repository/commits/${sha}`,
    singleSchema: GitLabCommitSchema,
    singleSchemaName: "GitLabCommitSchema",
  });

  // issues
  await checkListAndSingle({
    ctx,
    listPath: `/projects/${enc}/issues?state=all&per_page=1`,
    listLabel: `GET /projects/${projectId}/issues`,
    listSchema: GitLabIssueListSchema,
    listSchemaName: "GitLabIssueListSchema",
    idKey: "iid",
    singlePath: (iid) => `/projects/${enc}/issues/${iid}`,
    singleLabel: (iid) => `GET /projects/${projectId}/issues/${iid}`,
    singleSchema: GitLabIssueSchema,
    singleSchemaName: "GitLabIssueSchema",
  });

  // pipelines
  await checkListAndSingle({
    ctx,
    listPath: `/projects/${enc}/pipelines?per_page=1`,
    listLabel: `GET /projects/${projectId}/pipelines`,
    listSchema: GitLabPipelineListSchema,
    listSchemaName: "GitLabPipelineListSchema",
    idKey: "id",
    singlePath: (id) => `/projects/${enc}/pipelines/${id}`,
    singleLabel: (id) => `GET /projects/${projectId}/pipelines/${id}`,
    singleSchema: GitLabPipelineSchema,
    singleSchemaName: "GitLabPipelineSchema",
  });

  // users — current user, list, and one looked up by id
  await checkEndpoint(ctx, "GET /user", "/user", GitLabUserSchema, "GitLabUserSchema");
  await checkListAndSingle({
    ctx,
    listPath: "/users?per_page=1",
    listLabel: "GET /users",
    listSchema: GitLabUserListSchema,
    listSchemaName: "GitLabUserListSchema",
    idKey: "id",
    singlePath: (id) => `/users/${id}`,
    singleLabel: (id) => `GET /users/${id}`,
    singleSchema: GitLabUserSchema,
    singleSchemaName: "GitLabUserSchema",
  });

  // repository tree
  await checkEndpoint(
    ctx,
    `GET /projects/${projectId}/repository/tree`,
    `/projects/${enc}/repository/tree?per_page=10`,
    GitLabTreeListSchema,
    "GitLabTreeListSchema",
  );

  return { failures: ctx.failures, skips: ctx.skips };
}

function printSummary(failures: DriftFailure[], skips: DriftSkip[]): void {
  console.log("");
  console.log("---");
  console.log(`Schema-drift summary: ${failures.length} failure(s), ${skips.length} skip(s).`);

  if (skips.length > 0) {
    console.log("");
    console.log("Skipped:");
    for (const s of skips) {
      console.log(`  • ${s.endpoint} — ${s.reason}`);
    }
  }

  if (failures.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const f of failures) {
      console.log(`  ✗ ${f.endpoint}  [${f.schema}]`);
      for (const i of f.issues) {
        console.log(`      path=${i.path}  code=${i.code}  msg=${i.message}`);
      }
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.gitlabPersonalAccessToken && !config.ciJobToken) {
    console.error("GITLAB_PERSONAL_ACCESS_TOKEN (or CI_JOB_TOKEN) must be set.");
    process.exit(2);
  }

  const projectId = config.gitlabProjectId;
  if (!projectId) {
    console.error("GITLAB_PROJECT_ID must be set (the fixture project the gate exercises).");
    process.exit(2);
  }

  console.log(`Schema-drift check against ${config.gitlabApiUrl}, project ${projectId}`);
  console.log("");

  const client = new GitLabClient();
  const { failures, skips } = await runChecks(client, projectId);
  printSummary(failures, skips);

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error during schema-drift check:");
  console.error(err);
  process.exit(2);
});

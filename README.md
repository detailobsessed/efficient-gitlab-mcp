# Efficient GitLab MCP

[![npm version](https://img.shields.io/npm/v/efficient-gitlab-mcp-server.svg)](https://www.npmjs.com/package/efficient-gitlab-mcp-server)
[![npm downloads](https://img.shields.io/npm/dw/efficient-gitlab-mcp-server?logo=npm&color=cb3837)](https://www.npmjs.com/package/efficient-gitlab-mcp-server)
[![CI](https://github.com/detailobsessed/efficient-gitlab-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/detailobsessed/efficient-gitlab-mcp/actions/workflows/ci.yml)
[![Tools](https://img.shields.io/badge/tools-167-2563EB)](#available-categories)
[![Categories](https://img.shields.io/badge/categories-16-10B981)](#available-categories)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun&logoColor=f9f1e1)](https://bun.sh/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-8B5CF6?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDgtMy41OSA4LTggOHoiLz48L3N2Zz4=)](https://modelcontextprotocol.io/)
[![GitLab](https://img.shields.io/badge/GitLab-API-FC6D26?logo=gitlab&logoColor=white)](https://docs.gitlab.com/ee/api/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Biome](https://img.shields.io/badge/Biome-Strict-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)

**Token-efficient GitLab MCP server.** A fork of [zereight/gitlab-mcp](https://github.com/zereight/gitlab-mcp) re-architected for agent context budgets: **167 tools delivered through 3 meta-tools**, with field projection on every list endpoint, server-side file trimming, and keyset pagination on large directories.

If your agent's first turn against an MCP server costs ~20K tokens of tool definitions before you've asked anything, this fork is for you.

---

## Quick Start

### Prerequisites

- A GitLab Personal Access Token with `api` scope (or `read_api` for read-only). [Create one →](https://gitlab.com/-/user_settings/personal_access_tokens)
- Node.js 18+ (for `npx`) or [Bun](https://bun.sh/) 1.0+ (for `bunx`)

### MCP client config (recommended for most users)

Add this to your MCP client config — Claude Desktop, Cursor, Claude Code, IDE extensions, etc.:

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "npx",
      "args": ["efficient-gitlab-mcp-server@latest"],
      "env": {
        "GITLAB_PERSONAL_ACCESS_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
        "GITLAB_API_URL": "https://gitlab.com"
      }
    }
  }
}
```

Restart your client. The server is live with 3 meta-tools (`list_categories`, `activate_tools`, `deactivate_tools`). Your agent discovers GitLab tools by activating categories on demand — see [How It Works](#how-it-works) for a worked example.

> Prefer `bun`? Replace `"command": "npx"` with `"command": "bunx"`.

### Variants

**Self-hosted GitLab** — point at your instance's base URL (the server appends `/api/v4` itself):

```json
"env": {
  "GITLAB_PERSONAL_ACCESS_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
  "GITLAB_API_URL": "https://gitlab.your-company.com"
}
```

**Pinned to a single project** — agents don't need to repeat `project_id`; it's used as a default:

```json
"env": {
  "GITLAB_PERSONAL_ACCESS_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
  "GITLAB_API_URL": "https://gitlab.com",
  "GITLAB_PROJECT_ID": "12345"
}
```

**Restricted to multiple projects** — every call must specify a `project_id` from the allow-list:

```json
"env": {
  "GITLAB_PERSONAL_ACCESS_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
  "GITLAB_API_URL": "https://gitlab.com",
  "GITLAB_ALLOWED_PROJECT_IDS": "12345,67890,123"
}
```

**Read-only (auto-detected)** — use a PAT with only `read_api` scope; the server detects the limited scope at startup and only exposes the 93 read tools. No extra config needed.

**Read-only (forced)** — keep your `api`-scope PAT but force read-only mode at the server level:

```json
"env": {
  "GITLAB_PERSONAL_ACCESS_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
  "GITLAB_API_URL": "https://gitlab.com",
  "GITLAB_READ_ONLY_MODE": "true"
}
```

### Other entry points

**Claude Code CLI** (one-liner add):

```bash
claude mcp add -s user gitlab \
  -e GITLAB_PERSONAL_ACCESS_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx \
  -e GITLAB_API_URL=https://gitlab.com \
  -- npx efficient-gitlab-mcp-server@latest
```

**GitLab CI runner** — `CI_JOB_TOKEN` is auto-detected if no PAT is set. Use `GITLAB_PROJECT_ID: $CI_PROJECT_ID` to scope to the running project. No extra setup.

**From source** (development):

```bash
git clone https://github.com/detailobsessed/efficient-gitlab-mcp.git
cd efficient-gitlab-mcp
bun install
bun run build
bun start
```

Hit a snag? See [Troubleshooting](#troubleshooting). Need to tune more env vars? See [full Configuration reference](#configuration).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Why this fork?](#why-this-fork)
- [Token Efficiency](#token-efficiency)
  - [Progressive Disclosure](#progressive-disclosure)
  - [Field Projection](#field-projection)
  - [Server-Side File Trimming](#server-side-file-trimming)
  - [Keyset Pagination](#keyset-pagination)
- [What's Different From Upstream?](#whats-different-from-upstream)
- [Available Categories](#available-categories)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Features](#features)
  - [Read-Only Mode & PAT Safety](#read-only-mode--pat-safety)
  - [Secret Redaction](#secret-redaction)
  - [Tool Annotations](#tool-annotations)
  - [MCP Protocol Logging](#mcp-protocol-logging)
  - [HTTP Transport Security](#http-transport-security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Upstream Tracking](#upstream-tracking)
- [Security](#security)
- [Acknowledgments](#acknowledgments)
- [License](#license)

---

## Why this fork?

GitLab's API surface is huge, and the upstream MCP server reflects that — every tool is exposed at startup, all the time. For an agent on a context budget, that's wasteful in three places:

1. **Tool definitions at startup.** Hundreds of tool schemas are forced into the prompt before the first user turn.
2. **List-endpoint responses.** GitLab list endpoints return objects with 100+ fields per row by default; relevant signal is usually <10 fields.
3. **File contents and large directories.** Reading a single file can pull in thousands of irrelevant lines; listing a large repository tree returns everything at once.

This fork addresses all three: progressive disclosure for tool definitions, field projection for list responses, and trimming + keyset pagination for content.

---

## Token Efficiency

### Progressive Disclosure

Instead of exposing 167 individual tools, the server exposes **3 meta-tools**:

| Meta-Tool | Purpose |
|-----------|---------|
| `list_categories` | Discover available tool categories and their activation status |
| `activate_tools` | Enable all tools in one or more categories |
| `deactivate_tools` | Disable a category once you're done — frees the tokens back |

| Approach | Tools Exposed | Approximate Token Cost |
|----------|---------------|------------------------|
| Traditional | 167 tools | ~20,000+ tokens |
| Progressive Disclosure | 3 meta-tools | ~1,500 tokens |

**~90% reduction in tool-definition tokens at startup.** Tools are registered with the MCP SDK but kept disabled (`tool.disable()`) until the LLM activates a category — activation triggers a `tools/list_changed` notification so the client picks them up live.

### Field Projection

List endpoints return a curated, allow-listed default set of fields per resource. Callers can opt into the full payload with `fields: "all"` or pick their own list with `fields: ["id", "name"]`.

Currently applied to:

- `list_projects`, `list_group_projects`
- `list_issues`, `my_issues`
- `list_merge_requests`
- `list_pipelines`
- `list_releases`
- `list_commits`

A spike measurement against `list_projects` with 5 owned projects went from **~32 KB → ~3 KB** by switching to the compact default. Because it's allow-list based, the compact output stays compact when GitLab adds new fields upstream.

### Server-Side File Trimming

`get_file_contents` accepts trim parameters so agents don't have to pull whole files into context just to read a function:

| Parameter | Purpose |
|-----------|---------|
| `head: N` | Return only the first N lines |
| `tail: N` | Return only the last N lines |
| `range: "start-end"` | Return a specific line range |
| `max_bytes: N` | Hard byte cap (composes with line-based trims) |

Truncated responses include a note like `Showing lines 100-200 of 5234`, so a follow-up call can target a different range without re-fetching to count lines first.

### Keyset Pagination

`get_repository_tree` supports keyset pagination (`pagination=keyset`) and returns an envelope:

```json
{
  "items": [...],
  "pagination_note": "Next page available — call again with pagination=keyset&page_token=..."
}
```

Large monorepos no longer dump 10K entries into a single response. The server reads the cursor from `X-Next-Page-Token` (or falls back to `X-Next-Page` on older GitLab instances) and surfaces it inline.

---

## What's Different From Upstream?

This fork builds on [zereight/gitlab-mcp](https://github.com/zereight/gitlab-mcp) with a redesigned architecture focused on token efficiency and maintainability. We regularly review upstream commits and selectively port new features and bugfixes — we don't blindly rebase, since the codebases have structurally diverged.

### Architecture at a Glance

| Area | Upstream | This Fork |
|------|----------|-----------|
| **Architecture** | Single `index.ts` (~10K lines) | Modular `src/` with 16 tool modules |
| **Tool Discovery** | All 140+ tools exposed at once | SDK-native progressive disclosure (3 meta-tools) |
| **List Responses** | Full GitLab payload (100+ fields/row) | Field projection: compact default + opt-in `fields` |
| **File Contents** | Whole-file fetch | Server-side `head` / `tail` / `range` / `max_bytes` trimming |
| **Tree Listing** | Offset pagination only | Offset + keyset (`pagination=keyset`) with cursor envelope |
| **Tool Annotations** | Partial | Complete: `readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint` on every tool |
| **Configuration** | Flat individual exports | Typed `ServerConfig` interface with `loadConfig()` |
| **Logging** | `console.log` | Structured MCP protocol logger for agent observability |
| **Runtime** | Node.js + npm | Bun (faster builds, native TypeScript) |
| **Linting** | ESLint + Prettier | Strict Biome rules (`noExplicitAny`, `noNonNullAssertion`, cognitive complexity cap) |
| **CI/CD** | Basic | GitHub Actions (lint, build, test, semantic-release) |
| **Pre-commit** | None | prek hooks (typos, formatting, build verification) |
| **Feature Flags** | `USE_PIPELINE`, `USE_MILESTONE`, `USE_GITLAB_WIKI` required | None — all categories registered, dormant until activated |

### Other Improvements

- **Read-Only Mode & PAT Safety** — Automatic PAT scope detection, explicit read-only mode, and actionable 403 error messages.
- **Secret redaction** — `runners_token` is redacted from project responses by default; opt back in with `include_secrets: true`.
- **Robust schema coercion** — Booleans, numeric IDs, and stringified arrays are all coerced defensively (LLMs serialize inconsistently).
- **HTTP transport security** — DNS rebinding protection, configurable allowed hosts/origins.
- **Comprehensive test suite** — 280+ tests covering registry, config, logger, MCP integration, read-only mode, projection, and meta-tools.
- **Strict code quality** — Zero `any` types, no non-null assertions, enforced cognitive complexity limits.
- **Automated releases** — Semantic versioning with conventional commits.

---

## Available Categories

All GitLab operations are organized into **16 categories** totaling **167 tools**. All categories are registered at startup but dormant — activate the ones you need.

| Category | Tools | Description |
|----------|------:|-------------|
| `repositories` | 11 | Search, create, fork repos. Get/push files, manage branches, list tree |
| `merge-requests` | 33 | Create, update, merge MRs. Discussions, threads, diffs |
| `issues` | 14 | Create, update, delete issues. Links, discussions |
| `pipelines` | 19 | List, create, retry, cancel pipelines. Job output |
| `projects` | 10 | Project details, list, members, labels |
| `commits` | 3 | List commits, get commits, get diffs |
| `namespaces` | 3 | List, get, verify namespaces |
| `users` | 8 | User details, search, audit/project events, file uploads, current user (whoami) |
| `search` | 6 | Global, project, and group search across code, issues, MRs, commits |
| `wiki` | 10 | Wiki page management for projects and groups |
| `milestones` | 9 | Create, edit, delete milestones. Burndown events |
| `releases` | 7 | List, create, update, delete releases. Download assets |
| `webhooks` | 3 | List project webhooks and recent events |
| `work-items` | 12 | GraphQL work items: create, update, hierarchy, notes, incidents |
| `graphql` | 1 | Execute arbitrary GraphQL queries |
| `emoji-reactions` | 18 | Add, remove, and list emoji reactions on MRs / issues / work items / notes (REST + GraphQL) |

---

## How It Works

A typical agent session uses three phases — **discover**, **activate**, **work** — and optionally cleans up with **deactivate** once a category is no longer needed.

### 1. Discover (~1.5K tokens)

When the MCP client connects, the server only exposes 3 meta-tools. The agent calls `list_categories` to see what's available:

```jsonc
> list_categories()

{
  "categories": [
    { "name": "repositories",    "tools": 11, "active": false, "description": "Search, create, fork repos. Get/push files, manage branches, list tree" },
    { "name": "merge-requests",  "tools": 33, "active": false, "description": "Create, update, merge MRs. Discussions, threads, diffs" },
    { "name": "issues",          "tools": 14, "active": false, "description": "Create, update, delete issues. Links, discussions" },
    // ... 13 more, 167 tools total
  ]
}
```

### 2. Activate

The agent decides what it needs and activates a category:

```jsonc
> activate_tools({ categories: ["merge-requests"] })

"Activated 33 tools in category 'merge-requests'."
```

The server fires a `tools/list_changed` notification so the client picks up the 33 new tool definitions live.

> **Claude Code latency note**: tools activated mid-turn become callable starting from the *next* turn (Claude Code rebuilds its deferred-tool index between turns). Other clients can be eager.

### 3. Work

```jsonc
> create_merge_request({
    project_id: "123",
    title: "Fix bug",
    source_branch: "fix",
    target_branch: "main"
  })

{ "id": 7891, "iid": 42, "title": "Fix bug", "state": "opened", ... }
```

### 4. Deactivate (optional)

When the agent is done with this category, it can free the tokens back:

```jsonc
> deactivate_tools({ categories: ["merge-requests"] })

"Deactivated 33 tools in category 'merge-requests'."
```

This is especially useful in long agent sessions where context is at a premium — pull only what you need, drop it when you're done, then pull a different category.

---

## Configuration

### Core Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITLAB_PERSONAL_ACCESS_TOKEN` | Yes\* | - | GitLab personal access token (takes priority over CI_JOB_TOKEN) |
| `CI_JOB_TOKEN` | No | - | GitLab CI job token (auto-detected in CI pipelines) |
| `GITLAB_API_URL` | No | `https://gitlab.com` | GitLab instance URL |
| `GITLAB_PROJECT_ID` | No | - | Default project ID when tools omit `project_id` |
| `GITLAB_ALLOWED_PROJECT_IDS` | No | - | Restrict tools to these projects (comma-separated). With a single project, acts as default. With multiple, `project_id` is required per call |
| `GITLAB_READ_ONLY_MODE` | No | `false` | Only expose read-only tools. Auto-detected from PAT scopes if not set |
| `GITLAB_IS_OLD` | No | `false` | For older GitLab instances |

\*PAT is recommended. `CI_JOB_TOKEN` is auto-detected in GitLab CI pipelines when no PAT is set. OAuth support is planned (see [OAuth Setup Guide](./docs/oauth-setup.md)).

### Transport Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STREAMABLE_HTTP` | No | `false` | Enable HTTP transport |
| `SSE` | No | `false` | Enable SSE transport |
| `PORT` | No | `3002` | HTTP server port |
| `HOST` | No | `127.0.0.1` | HTTP server host |

### Logging & Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | No | `pretty` | `json`, `pretty` |
| `HTTP_ALLOWED_HOSTS` | No | `localhost,127.0.0.1` | Allowed Host headers |
| `HTTP_ALLOWED_ORIGINS` | No | (any) | Allowed Origin headers |
| `HTTP_ENABLE_DNS_REBINDING_PROTECTION` | No | `true` | Enable DNS rebinding attack protection |

### Remote Authorization (Multi-tenant)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REMOTE_AUTHORIZATION` | No | `false` | Enable remote auth |
| `ENABLE_DYNAMIC_API_URL` | No | `false` | Allow dynamic GitLab URLs |
| `SESSION_TIMEOUT_SECONDS` | No | `3600` | Session timeout |
| `MAX_SESSIONS` | No | `1000` | Maximum concurrent sessions |
| `MAX_REQUESTS_PER_MINUTE` | No | `60` | Rate limit per session |

---

## Features

### Read-Only Mode & PAT Safety

The server provides three layers of protection for users with limited-scope Personal Access Tokens:

**1. Explicit read-only mode** — Set `GITLAB_READ_ONLY_MODE=true` to restrict the server to read-only tools. Write tools won't appear in `list_categories` counts and can't be activated. This is driven by the `readOnlyHint` annotation on every tool.

**2. Automatic PAT scope detection** — On startup, the server calls GitLab's `GET /personal_access_tokens/self` to inspect your token's scopes. If the token lacks the `api` scope (e.g., only has `read_api`), read-only mode is automatically enabled. No configuration needed — it just works.

**3. Actionable 403 error messages** — If a tool call hits a 403 Forbidden error, the error message includes specific guidance about which PAT scopes are needed, so the LLM can inform the user rather than retrying blindly.

```
# Explicit read-only mode
GITLAB_READ_ONLY_MODE=true

# Or just use a read_api token — auto-detected!
GITLAB_PERSONAL_ACCESS_TOKEN=glpat-your-read-only-token
```

### Secret Redaction

GitLab project responses include a `runners_token` field by default — anyone with that token can register CI runners against the project. The server **redacts `runners_token` by default** on `get_project` and `list_projects` responses. To opt back in (e.g. when an agent specifically needs to manage runner registration), pass `include_secrets: true`.

### Tool Annotations

Every tool declares a complete set of [MCP tool annotations](https://modelcontextprotocol.io/specification/draft/server/tools/#tool-annotations) so MCP-aware clients can offer per-action confirmation, distinguish destructive operations from idempotent updates, and filter by side-effect profile:

| Tool kind | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
|-----------|---------------|-------------------|-----------------|-----------------|
| Read-only (list/get) | `true` | _(omit)_ | _(omit)_ | `true` |
| Create | `false` | `false` | `false` | `true` |
| Update | `false` | `true` | `true` | `true` |
| Delete | `false` | `true` | `true` | `true` |

`openWorldHint` is always `true` because every tool talks to GitLab's API. The annotation matrix is enforced by an invariants test.

### MCP Protocol Logging

The server supports MCP protocol logging for agent observability. When connected, LLM clients can receive structured log messages showing what the server is doing:

- Tool execution logs
- GitLab API call details
- Error information with context

This helps agents understand server behavior and debug issues — instead of opaque `console.log` output that only the developer sees.

### HTTP Transport Security

When using HTTP transport (`STREAMABLE_HTTP=true`), the server includes security features:

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `HTTP_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated list of allowed Host headers |
| `HTTP_ALLOWED_ORIGINS` | (any) | Comma-separated list of allowed Origin headers |
| `HTTP_ENABLE_DNS_REBINDING_PROTECTION` | `true` | Enable DNS rebinding attack protection |

Example for production:

```bash
HTTP_ALLOWED_HOSTS=api.example.com,localhost \
HTTP_ALLOWED_ORIGINS=https://app.example.com \
STREAMABLE_HTTP=true \
bun start
```

---

## Troubleshooting

### My agent activated a category but can't see the new tools

Your MCP client needs to support the [`tools/list_changed` notification](https://modelcontextprotocol.io/specification/draft/server/tools/#tool-list-update-notifications) for runtime activations to be picked up. Most modern clients do.

In **Claude Code** specifically, activated tools become callable starting from the **next** turn — the client rebuilds its deferred-tool index between turns, not synchronously inside one. So calling `activate_tools(["issues"])` and then `list_issues()` in the same turn won't work; the next turn will. Other clients (Claude Desktop, Cursor) tend to be eager.

### "403 Forbidden" on a tool I expected to work

The server returns actionable 403s — the error message tells you which PAT scopes are missing. Common cause: your PAT only has `read_api` scope (read-only) but the tool you called requires `api`. Either regenerate a PAT with `api` scope, or stay in read-only mode and use the read tools.

### `project_id` keeps getting rejected

If `GITLAB_ALLOWED_PROJECT_IDS` is set with **multiple** comma-separated IDs, every tool call needs an explicit `project_id` matching one of them — there's no default. With a **single** ID, that ID is used as the default if no `project_id` is passed. Empty/unset means no restriction (any project ID is allowed).

### Self-hosted GitLab not connecting

`GITLAB_API_URL` should be your instance's **base URL** (`https://gitlab.your-company.com`), not the API path. The server appends `/api/v4` itself. If you use the base path with `/api/v4` already in it, calls will hit `/api/v4/api/v4/...` and 404.

### CI tools don't work in GitLab CI

If `GITLAB_PERSONAL_ACCESS_TOKEN` isn't set, the server falls back to `CI_JOB_TOKEN` automatically (auto-detected from the GitLab CI environment). Set `GITLAB_PROJECT_ID: $CI_PROJECT_ID` in your `.gitlab-ci.yml` so the running pipeline's project is used as the default scope.

### `runners_token` is missing from project responses

It's [redacted by default](#secret-redaction) for safety. To get it back, pass `include_secrets: true` on the call.

### List endpoint returns fewer results than expected

For `list_issues`, `list_merge_requests`, etc.: GitLab's global endpoints (when no `project_id` is supplied) historically defaulted to `scope: created_by_me`. To see everything, pass `scope: "all"` explicitly. If you supply `project_id`, the call routes to the project-scoped endpoint and this default doesn't apply.

---

## Development

```bash
# Install dependencies
bun install

# Run tests (280+ tests, <1s)
bun test

# Run tests with coverage
bun test --coverage

# Lint and format
bun run check

# Build
bun run build
```

---

## Upstream Tracking

We maintain `main` as a read-only mirror of upstream. New features and bugfixes from upstream are reviewed and ported into our architecture as needed — we don't blindly rebase, since the codebases have structurally diverged. If you're looking for a specific upstream feature, check our [releases](https://github.com/detailobsessed/efficient-gitlab-mcp/releases) or open an issue.

---

## Security

- **Never commit tokens** — Use `.env` files (gitignored)
- **Rotate tokens** — Regenerate periodically
- **Least privilege** — Only grant necessary API scopes
- **Audit logs** — Monitor API access
- **Secret redaction** — `runners_token` is redacted by default; see [Secret Redaction](#secret-redaction)

---

## Acknowledgments

This project is a fork of [zereight/gitlab-mcp](https://github.com/zereight/gitlab-mcp). Thanks to the original author for the comprehensive GitLab API implementation.

---

## Resources

- **MCP Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **GitLab API**: [docs.gitlab.com/ee/api](https://docs.gitlab.com/ee/api/)
- **Bun**: [bun.sh](https://bun.sh/)

---

## License

MIT License — See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Efficient GitLab MCP</strong><br>
  AI-Powered GitLab Management with Token Efficiency<br>
  <sub>Built with Bun and the Model Context Protocol</sub>
</p>

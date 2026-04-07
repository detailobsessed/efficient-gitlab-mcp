# Efficient GitLab MCP

[![npm version](https://img.shields.io/npm/v/efficient-gitlab-mcp-server.svg)](https://www.npmjs.com/package/efficient-gitlab-mcp-server)
[![CI](https://github.com/detailobsessed/efficient-gitlab-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/detailobsessed/efficient-gitlab-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun&logoColor=f9f1e1)](https://bun.sh/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-8B5CF6?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDgtMy41OSA4LTggOHoiLz48L3N2Zz4=)](https://modelcontextprotocol.io/)
[![GitLab](https://img.shields.io/badge/GitLab-API-FC6D26?logo=gitlab&logoColor=white)](https://docs.gitlab.com/ee/api/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Biome](https://img.shields.io/badge/Biome-Strict-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)

**Token-Efficient GitLab Server Management** — An enhanced fork of [zereight/gitlab-mcp](https://github.com/zereight/gitlab-mcp) with progressive disclosure pattern for dramatic token savings.

## What's Different From Upstream?

This fork builds on [zereight/gitlab-mcp](https://github.com/zereight/gitlab-mcp) with a redesigned architecture focused on token efficiency and maintainability. We regularly review upstream commits and port new features and bugfixes while keeping our own structure.

### Architecture at a Glance

| Area | Upstream | This Fork |
|------|----------|-----------|
| **Architecture** | Single `index.ts` (~10K lines) | Modular `src/` with 15 tool modules |
| **Tool Discovery** | All 100+ tools exposed at once | SDK-native progressive disclosure (2 meta-tools) |
| **Configuration** | Flat individual exports | Typed `ServerConfig` interface with `loadConfig()` |
| **Logging** | `console.log` | Structured MCP protocol logger for agent observability |
| **Runtime** | Node.js + npm | Bun (faster builds, native TypeScript) |
| **Linting** | ESLint + Prettier | Strict Biome rules (`noExplicitAny`, `noNonNullAssertion`, cognitive complexity) |
| **CI/CD** | Basic | GitHub Actions (lint, build, test, semantic-release) |
| **Pre-commit** | None | prek hooks (typos, formatting, build verification) |

### Key Improvements

- **Progressive Disclosure** — 2 meta-tools instead of 100+ individual tools (~90% token reduction). Uses the MCP SDK's native `enable()`/`disable()` API so tools are registered but hidden until the LLM activates a category.
- **Modular Tool Organization** — Each GitLab domain (issues, merge requests, pipelines, etc.) lives in its own file under `src/tools/`, making it easy to find, test, and extend individual tools without navigating a monolithic file.
- **Typed Configuration** — A `ServerConfig` interface ensures all config values are validated at startup, with IDE autocompletion and compile-time safety.
- **MCP Protocol Logging** — Structured logs sent to LLM clients for agent observability, not just developer console output.
- **HTTP Transport Security** — DNS rebinding protection, configurable allowed hosts/origins.
- **Comprehensive Test Suite** — 120+ tests covering registry, config, logger, MCP integration, and meta-tools.
- **Strict Code Quality** — Zero `any` types, no non-null assertions, enforced cognitive complexity limits.
- **Modern Tooling** — Bun for fast builds, Biome for linting, prek for pre-commit hooks.
- **Automated Releases** — Semantic versioning with conventional commits.

### Upstream Tracking

We maintain `main` as a read-only mirror of upstream. New features and bugfixes from upstream are reviewed and ported into our architecture as needed — we don't blindly rebase, since the codebases have structurally diverged. If you're looking for a specific upstream feature, check our [releases](https://github.com/detailobsessed/efficient-gitlab-mcp/releases) or open an issue.

---

## How It Works

Instead of exposing 100+ individual tools, this server exposes **2 meta-tools**:

| Meta-Tool | Purpose |
|-----------|---------|
| `list_categories` | Discover available tool categories and their activation status |
| `activate_tools` | Enable all tools in one or more categories |

### Token Savings

| Approach | Tools Exposed | Approximate Token Cost |
|----------|---------------|------------------------|
| Traditional | 100+ tools | ~20,000+ tokens |
| Progressive Disclosure | 2 meta-tools | ~1,500 tokens |

**~90% reduction in tool definition tokens!**

### Example Workflow

```
1. LLM calls list_categories() → sees "merge-requests" category (20 tools, 0 active)
2. LLM calls activate_tools(categories: ["merge-requests"]) → 20 tools now appear in tool list
3. LLM calls create_merge_request({project_id: "123", title: "Fix bug", source_branch: "fix", target_branch: "main"})
```

---

## Available Operations

All GitLab operations organized by category:

| Category | Description |
|----------|-------------|
| repositories | Search, create, fork repos. Get files, push files, manage branches |
| merge-requests | Create, update, merge MRs. Discussions, threads, diffs |
| issues | Create, update, delete issues. Links, discussions |
| pipelines | List, create, retry, cancel pipelines. Job output |
| projects | Project details, members, labels |
| commits | List commits, get diffs |
| namespaces | List, get, verify namespaces |
| users | User details, search users, audit/project events, file uploads |
| search | Global, project, and group search across code, issues, MRs, commits |
| wiki | Wiki page management for projects and groups |
| milestones | Create, edit, delete milestones. Burndown events |
| releases | List, create, update, delete releases. Download assets |
| webhooks | List project webhooks and recent events |
| work-items | GraphQL work items: create, update, hierarchy, notes, incidents |
| graphql | Execute arbitrary GraphQL queries |

---

## Quick Start

### Prerequisites

- Node.js 18+ (for `npx`) or [Bun](https://bun.sh/) 1.0+ (for `bunx`)
- A GitLab personal access token with the following scopes:
  - `api` — Full API access (required for most operations)
  - `read_api` — Read-only API access (if you only need read operations)
  - `read_repository` — Read repository files
  - `write_repository` — Push to repositories

### MCP Client Configuration

Add this to your MCP client configuration (e.g., `~/.config/claude/claude_desktop_config.json` for Claude Desktop, or your IDE's MCP settings):

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "npx",
      "args": ["efficient-gitlab-mcp-server"],
      "env": {
        "GITLAB_PERSONAL_ACCESS_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
        "GITLAB_API_URL": "https://gitlab.com"
      }
    }
  }
}
```

Or with Bun:

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "bunx",
      "args": ["efficient-gitlab-mcp-server"],
      "env": {
        "GITLAB_PERSONAL_ACCESS_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
        "GITLAB_API_URL": "https://gitlab.com"
      }
    }
  }
}
```

For **self-hosted GitLab**, update `GITLAB_API_URL` to your instance URL.

### Connect via CLI

```bash
# stdio transport (default)
claude mcp add gitlab-agent -- npx efficient-gitlab-mcp-server

# HTTP transport (requires running from source)
STREAMABLE_HTTP=true npx efficient-gitlab-mcp-server
claude mcp add --transport http gitlab-agent http://localhost:3002/mcp
```

### Install from Source (Development)

```bash
git clone https://github.com/detailobsessed/efficient-gitlab-mcp.git
cd efficient-gitlab-mcp
bun install
bun run build
bun start
```

---

## Features

### MCP Protocol Logging

The server supports MCP protocol logging for agent observability. When connected, LLM clients can receive structured log messages showing what the server is doing:

- Tool execution logs
- GitLab API call details
- Error information with context

This helps agents understand server behavior and debug issues.

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

## Development

```bash
# Run tests
bun test

# Run tests with coverage
bun test --coverage

# Lint and format
bun run check

# Build
bun run build
```

---

## Configuration

### Core Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITLAB_PERSONAL_ACCESS_TOKEN` | Yes* | - | GitLab personal access token |
| `GITLAB_API_URL` | No | `https://gitlab.com` | GitLab instance URL |
| `GITLAB_PROJECT_ID` | No | - | Default project ID |
| `GITLAB_ALLOWED_PROJECT_IDS` | No | - | Comma-separated allowed project IDs |
| `GITLAB_READ_ONLY_MODE` | No | `false` | Disable write operations |
| `GITLAB_IS_OLD` | No | `false` | For older GitLab instances |

### Transport Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STREAMABLE_HTTP` | No | `false` | Enable HTTP transport |
| `SSE` | No | `false` | Enable SSE transport |
| `PORT` | No | `3002` | HTTP server port |
| `HOST` | No | `127.0.0.1` | HTTP server host |

### Feature Flags

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `USE_GITLAB_WIKI` | No | `false` | Enable wiki tools |
| `USE_MILESTONE` | No | `false` | Enable milestone tools |
| `USE_PIPELINE` | No | `false` | Enable pipeline tools |

### Logging & Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | No | `pretty` | `json`, `pretty` |
| `HTTP_ALLOWED_HOSTS` | No | `localhost,127.0.0.1` | Allowed Host headers |
| `HTTP_ALLOWED_ORIGINS` | No | (any) | Allowed Origin headers |

### Remote Authorization (Multi-tenant)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REMOTE_AUTHORIZATION` | No | `false` | Enable remote auth |
| `ENABLE_DYNAMIC_API_URL` | No | `false` | Allow dynamic GitLab URLs |
| `SESSION_TIMEOUT_SECONDS` | No | `3600` | Session timeout |
| `MAX_SESSIONS` | No | `1000` | Maximum concurrent sessions |
| `MAX_REQUESTS_PER_MINUTE` | No | `60` | Rate limit per session |

*Or use OAuth authentication - see [OAuth Setup Guide](./docs/oauth-setup.md)

---

## Security

- **Never commit tokens** — Use `.env` files (gitignored)
- **Rotate tokens** — Regenerate periodically
- **Least privilege** — Only grant necessary API scopes
- **Audit logs** — Monitor API access

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

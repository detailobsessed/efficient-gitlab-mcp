# Efficient GitLab MCP

[![CI](https://github.com/detailobsessed/efficient-gitlab-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/detailobsessed/efficient-gitlab-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun&logoColor=f9f1e1)](https://bun.sh/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-8B5CF6?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDgtMy41OSA4LTggOHoiLz48L3N2Zz4=)](https://modelcontextprotocol.io/)
[![GitLab](https://img.shields.io/badge/GitLab-API-FC6D26?logo=gitlab&logoColor=white)](https://docs.gitlab.com/ee/api/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Biome](https://img.shields.io/badge/Biome-Strict-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)

**Token-Efficient GitLab Server Management** — An enhanced fork of [zereight/gitlab-mcp](https://github.com/zereight/gitlab-mcp) with progressive disclosure pattern for dramatic token savings.

## What's Different From Upstream?

This fork builds on the original GitLab MCP with substantial engineering improvements:

| Area | Upstream | This Fork |
|------|----------|-----------|
| **Runtime** | Node.js + npm | Bun (faster builds, native TypeScript) |
| **Tool Exposure** | 100+ tools directly | 5 meta-tools (progressive disclosure) |
| **Testing** | Basic | Comprehensive test suite |
| **Linting** | ESLint + Prettier | Strict Biome rules (`noExplicitAny`, `noNonNullAssertion`, cognitive complexity) |
| **CI/CD** | Basic | GitHub Actions (lint, build, test) |
| **Pre-commit** | None | prek hooks (typos, formatting, build verification) |

### Key Improvements

- **Progressive Disclosure** — 5 meta-tools instead of 100+ individual tools (~90% token reduction)
- **Comprehensive Test Suite** — Registry, config, logger, and meta-tools tested
- **Strict Code Quality** — Zero `any` types, no non-null assertions, enforced cognitive complexity limits
- **Modern Tooling** — Bun for fast builds, Biome for linting, prek for pre-commit hooks

---

## How It Works

Instead of exposing 100+ individual tools, this server exposes **5 meta-tools**:

| Meta-Tool | Purpose |
|-----------|---------|
| `list_categories` | Discover available tool categories |
| `list_tools` | List tools in a specific category |
| `search_tools` | Search for tools by keyword |
| `get_tool_schema` | Get full parameter schema for a tool |
| `execute_tool` | Execute any GitLab tool by name |

### Token Savings

| Approach | Tools Exposed | Approximate Token Cost |
|----------|---------------|------------------------|
| Traditional | 100+ tools | ~20,000+ tokens |
| Progressive Disclosure | 5 meta-tools | ~1,500 tokens |

**~90% reduction in tool definition tokens!**

### Example Workflow

```
1. LLM calls list_categories() → sees "merge-requests" category
2. LLM calls list_tools("merge-requests") → sees "create_merge_request", "merge_merge_request", etc.
3. LLM calls get_tool_schema("create_merge_request") → sees required params
4. LLM calls execute_tool("create_merge_request", {projectId: "123", title: "Fix bug", sourceBranch: "fix", targetBranch: "main"})
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
| milestones | Create, edit, delete milestones |
| wiki | Wiki page management |
| releases | Release management |
| users | User details |
| notes | Comments on issues and MRs |
| events | User and project activity |
| groups | Group projects and iterations |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) 1.0.0+
- A GitLab personal access token or OAuth setup

### Install

```bash
git clone https://github.com/detailobsessed/efficient-gitlab-mcp.git
cd efficient-gitlab-mcp
bun install
```

### Configure

```bash
cp .env.example .env
# Edit .env and add your GITLAB_PERSONAL_ACCESS_TOKEN
```

### Run

```bash
bun run build
bun start
```

### Connect to Claude Code

```bash
# stdio transport (default)
claude mcp add gitlab-agent -- bun /path/to/efficient-gitlab-mcp/dist/index.js

# HTTP transport
STREAMABLE_HTTP=true bun start
claude mcp add --transport http gitlab-agent http://localhost:3002/mcp
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

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITLAB_PERSONAL_ACCESS_TOKEN` | Yes* | - | GitLab personal access token |
| `GITLAB_API_URL` | No | `https://gitlab.com` | GitLab instance URL |
| `GITLAB_PROJECT_ID` | No | - | Default project ID |
| `GITLAB_ALLOWED_PROJECT_IDS` | No | - | Comma-separated allowed project IDs |
| `STREAMABLE_HTTP` | No | `false` | Enable HTTP transport |
| `PORT` | No | `3002` | HTTP server port |
| `HOST` | No | `127.0.0.1` | HTTP server host |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `USE_GITLAB_WIKI` | No | `false` | Enable wiki tools |
| `USE_MILESTONE` | No | `false` | Enable milestone tools |
| `USE_PIPELINE` | No | `false` | Enable pipeline tools |

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

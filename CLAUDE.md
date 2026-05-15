# Efficient GitLab MCP

An enhanced fork of [zereight/gitlab-mcp](https://github.com/zereight/gitlab-mcp) with progressive disclosure pattern for token-efficient GitLab server management.

## Quick Reference

```bash
bun install          # Install dependencies
bun run build        # Build: src/server/index.ts → dist/
bun test             # Run all tests (Bun test runner)
bun run check        # Lint + format (Biome, auto-fix)
bun run dev          # Build and start
```

## Architecture

```
src/
├── server/
│   ├── index.ts          # MCP server entry point (stdio + streamable-http)
│   └── config.ts         # ServerConfig interface + loadConfig()
├── tools/                # One file per GitLab domain (15 modules)
│   ├── issues.ts
│   ├── merge-requests.ts
│   ├── pipelines.ts
│   └── ...
├── registry/
│   ├── disclosure.ts     # SDK-native progressive disclosure (enable/disable)
│   └── categories.ts     # Tool category definitions
└── utils/
    ├── gitlab-client.ts  # GitLab API client (singleton, supports graphql())
    └── logger.ts         # Structured MCP protocol logger
```

### Progressive Disclosure

Tools start **disabled** (via `toolRef.disable()`). The LLM discovers them via meta-tools (`list_categories`, `activate_tools`), then enables categories on demand. Activation sets `tool.enabled` directly and sends a single batched `notifications/tools/list_changed`.

### Adding a New Tool

1. Add the handler in the appropriate `src/tools/<category>.ts` file
2. Use Zod for input schema validation
3. Register with `server.registerTool()`, then `toolRef.disable()` (starts hidden)
4. Add the tool name to the category's tool map
5. Add tests in `tests/<category>.test.ts`

## Code Style

- **Biome** with strict rules: `noExplicitAny`, `noNonNullAssertion`, `noExcessiveCognitiveComplexity`
- Spaces for indentation, double quotes
- Run `bun run check` to auto-fix

## Testing

- Tests live in `tests/*.test.ts` (17 test files)
- Bun's built-in test runner
- Tests mock the GitLab API client — no live API calls

## Upstream Relationship

This project maintains `main` as a read-only mirror of upstream (`zereight/gitlab-mcp`). The working trunk is `detailobsessed`. New upstream features are reviewed and ported selectively — we do not rebase onto upstream's architecture.

## Branch Workflow

Create every feature branch through git-spice — even single-concern (non-stacked) work. Use the canonical `bc` → `bs` flow; don't fall back to plain `git checkout -b` + `git push` + `gh pr create`. Tracking is free, keeps `git-spice ls` a complete view of in-flight work, and lets a follow-up branch stack on this one without manual re-parenting.

Canonical daily workflow (trunk is `detailobsessed`, not `main`):

```bash
git add src/tools/foo.ts tests/foo.test.ts        # stage explicitly first
git-spice bc port/foo-feature -m "feat(foo): ..." # creates branch, commits, tracks
# iterate:
git add <more-files>
git-spice ca --no-edit                            # amend current branch's commit
# ship:
git-spice branch submit --fill --no-draft         # pushes + opens GitHub PR
```

After review feedback:

```bash
git add <fixes>
git-spice ca --no-edit
git-spice stack submit --update-only              # force-pushes the rebased branch
```

Retroactive tracking (only when a branch was already created with plain `git checkout -b`):

```bash
git-spice branch track <branch> --base detailobsessed
```

This complements — not supersedes — the global rule in `~/.claude/CLAUDE.md` about *when* to actually stack. Stacking is still reserved for multi-step, independently-shippable work; this project's policy is just "always track, regardless."

Always invoke the CLI as `git-spice` (full name), never the `gs` short name — `gs` collides with Ghostscript on the maintainer's machine.

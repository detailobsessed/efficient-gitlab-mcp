# Agent Conventions — efficient-gitlab-mcp

Project-specific conventions that complement `CLAUDE.md`. CLAUDE.md covers
architecture, build, and the progressive disclosure pattern; this file covers
**workflow** (branches, commits, tickets) and **patterns** (test idioms,
schema choices) used inside the codebase.

## Verification commands

Always run before declaring a task done:

```bash
bun test         # 220+ tests, ~500ms — fast enough to run on every change
bun run check    # Biome lint + format, auto-fix
```

`bun run build` is run automatically by the pre-commit hook (via the
`Build` step). Do not skip the hook.

## Git workflow

This repo uses **git-spice** (`git-spice -h`), not raw git for stack management.

- **Trunk** is `detailobsessed`, NOT `main`. `main` is a read-only mirror of
  `zereight/gitlab-mcp` upstream.
- Stack branches are named `port/<short-kebab-description>` (e.g.
  `port/labels-as-array`, `port/get-file-contents-auto-ref`).
- Use `git-spice bc <name> -a -m "<msg>"` to create a new branch on top of the
  current one, staging tracked changes in one step.
- Use `git-spice ca -a --no-edit` to amend the current branch's commit.
- Use `git-spice stack submit --update-only` to push updates after amending.
- Use `git-spice ls` to visualise the stack (top of stack at top, trunk at
  bottom).

## Commit conventions

Conventional commits with these prefixes:

- `feat(<scope>):` new behaviour (tool, feature, capability)
- `fix(<scope>):` bug fix
- `docs(<scope>):` documentation only (including doctring/description text)
- `test(<scope>):` test-only changes
- `chore(<scope>):` infrastructure / non-functional

Scope examples: `tools`, `disclosure`, `schemas`, `users`, `repositories`,
`labels`, `mcp-server`, `projects`, `merge-requests`.

The body should explain **why**, not just what. The bottom should always carry
a `Closes DOT-NNN` (or `Refs DOT-NNN`) line for Linear auto-close on merge.

**Do not** add `Co-Authored-By: Claude` / `Devin` / etc. trailers — `~/.claude/CLAUDE.md`
disables the harness's auto-trailer and we don't want manual ones either.

## Linear ticket conventions

- Team: **Detail Obsessed** (`team: "Detail Obsessed"` when filing).
- Project: **efficient-gitlab-mcp** (always set this when filing — keeps
  tickets out of unrelated projects).
- Issue prefix: `DOT-`.
- Common labels in this project: `enhancement`, `Feature`, `Bug`, `research`,
  `documentation`, `blocked`, `ci`.
- Priorities: `1` Urgent / `2` High / `3` Medium / `4` Low / `0` None.

When a ticket is filed during a task, link it from the commit body
(`Closes DOT-NNN`) so it auto-closes on merge. The keyword line MUST be a bare
`Closes DOT-NNN` — markdown links break Linear's parser.

## Test patterns

Tests use Bun's built-in test runner (`bun:test`) and the in-memory MCP transport.
Two common idioms:

### Response-shape testing (`mockJsonResponse` helper)

Use the file-local `mockJsonResponse(body)` helper at the top of each test file.
It stubs `globalThis.fetch` to return a fixed JSON body with a 200 OK shell.

```ts
mockJsonResponse([{ id: 1, name: "Alpha" }]);
const result = await client.callTool({ name: "list_projects", arguments: {} });
const text = (result.content as TextContent)[0].text;
expect(text).toContain("Alpha");
```

### URL-shape testing (`capturedUrl` pattern)

When the assertion is "did the tool forward the right query string?", use the
inline `capturedUrl` pattern (don't add a global helper for this — it's per-test):

```ts
let capturedUrl: string | undefined;
// @ts-expect-error - mock doesn't need full fetch signature
globalThis.fetch = mock((url: string, _options?: RequestInit) => {
  capturedUrl = url;
  return Promise.resolve({
    ok: true, status: 200, text: () => Promise.resolve("[]"), headers: new Headers(),
  } as Response);
});

await client.callTool({ name: "list_projects", arguments: { topic: "foo" } });
expect(capturedUrl).toContain("topic=foo");
```

For pagination cursors / response headers, return `headers: new Headers({ "x-next-page-token": "..." })`.

## Schema patterns

### Coerce string arrays for label-like fields

`src/utils/schema-helpers.ts` exports `coerceStringArray(description)` —
LLMs sometimes serialise arrays as JSON-stringified strings (`'["a","b"]'`)
instead of native arrays. Use this preprocessor on every label / multi-value
input field. Established pattern from `port/labels-as-array`.

### Boolean coercion

Always use `z.coerce.boolean()`, not `z.boolean()`. LLMs sometimes pass `"true"`
/ `"false"` strings. Zero non-coerced `z.boolean()` should exist in `src/`.

### Tool annotations matrix

Every tool registered via `server.registerTool()` must declare full annotations
per the MCP spec (see `port/full-tool-annotations`):

| Tool kind | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
| -- | -- | -- | -- | -- |
| Read-only | `true` | (omit — spec-undefined) | (omit) | `true` |
| Create / write | `false` | `false` | `false` | `true` |
| Update | `false` | `true` | `true` | `true` |
| Delete | `false` | `true` | `true` | `true` |

`openWorldHint` is always `true` here — every tool calls GitLab's API. The
`tool-annotations.test.ts` invariants enforce this matrix.

## Adding a new GitLab tool

1. Add the Zod schema (e.g. `MyToolSchema`) at the top of the relevant
   `src/tools/<category>.ts`. Use `coerceStringArray` for label-like fields,
   `z.coerce.boolean()` for booleans.
2. Inside `register<Category>Tools`, call `server.registerTool("my_tool", { ... }, async (params) => { ... })`.
3. Mirror the schema fields in the `inputSchema` literal of the registerTool
   call (the SDK reads the literal, not the named schema).
4. Set the full annotations per the matrix above.
5. Call `toolRef.disable()` immediately after registration — tools must start
   hidden so progressive disclosure works.
6. Add `tools.set("my_tool", toolRef)` to register it in the category map.
7. If it's a destructive tool, also exclude it from the read-only mode allow-list.
8. Add tests in `tests/<category>.test.ts` using the patterns above.
9. Update tool-count constants in `tests/tools.test.ts` and
   `tests/mcp-server.test.ts`.

## Upstream sync workflow

`main` mirrors `zereight/gitlab-mcp` upstream — never push to it directly.
When syncing upstream changes:

1. `git fetch upstream main` — pulls latest upstream commits into the mirror.
2. Cross-check `upstream/main` against `detailobsessed` for new feature commits
   since the last sync.
3. For each upstream commit, decide: (a) port directly, (b) adapt to our trunk,
   (c) skip as N/A (e.g. response-schema fixes — we passthrough GitLab JSON).
4. File a Linear issue per upstream feature you're not immediately porting,
   with a link to the upstream commit hash.
5. Each port branches off `detailobsessed` as a new `port/<name>` stack branch.

# Starfetch Agent Guide

This file is contributor guidance for humans and coding agents working on
Starfetch.

## Project Boundary

Starfetch is a TypeScript/npm astronomical data querying project. The main
surfaces are agent-ready TAP/ADQL access through a local MCP server, a
scriptable CLI, and a distributable agent skill. The reusable TypeScript library
powers those surfaces and is available for direct callers.

Keep the package boundaries tight:

- `@starfetch-js/core` owns TAP protocol behavior, VOSI metadata, VOTable
  parsing, output conversion, presets, registry discovery, async jobs, and
  typed errors.
- `@starfetch-js/mcp` is a thin MCP adapter over `@starfetch-js/core`.
- `@starfetch-js/skill` owns packaged static skill files and install helpers.
- `starfetch` is the CLI package and should stay a thin caller over
  `@starfetch-js/core` and `@starfetch-js/skill`.

Do not expand `0.1` into broad VO protocol support, Gaia-only workflows, GUI
workflows, full ADQL parsing, or authenticated TAP flows unless a later issue
explicitly changes scope.

The root `README.md` is the main user guide. Package READMEs are concise npm
package-page summaries. Historical planning docs are not tracked as user
documentation.

## Runtime and Package Policy

The implementation is an npm workspace with TypeScript ESM packages:

- root private workspace package;
- `packages/core` is `@starfetch-js/core`;
- `packages/cli` is `starfetch`;
- `packages/mcp` is `@starfetch-js/mcp`;
- `packages/skill` is `@starfetch-js/skill`.

Target Node.js `>=22` for runtime packages. The root workspace may require a
later Node 22 patch release when development tooling requires it. Preserve Bun
compatibility by using standard web APIs where practical. Prefer `fetch`,
`Response`, `AbortSignal`, `URL`, `URLSearchParams`, and `ArrayBuffer`. Do not
use Bun-only APIs in shared code. Keep Node-only code out of
`@starfetch-js/core` unless the feature explicitly requires it, such as
`TapResult.save(path)`.

The current toolchain is TypeScript, `tsdown`, Vitest, ESLint flat config,
Prettier, and fixed-version Lerna releases. Do not introduce a different
package manager, build system, release tool, or monorepo framework without an
issue that calls for it.

Exact-pin direct dependencies in package manifests and keep `package-lock.json`
committed. Use `npm ci` for reproducible installs and avoid `^` ranges for
direct dependencies unless a later issue explicitly changes this policy.

## Local Skills

For TAP, ADQL, VOSI, VOTable, UWS, TAP output formats, registry discovery, and
protocol behavior, read the local skill:

```text
.codex/skills/tap/SKILL.md
```

The `tap` skill is intentionally general and protocol-oriented. Starfetch
product decisions belong in `README.md`, this file, package READMEs, issues,
and the source.

Do not vendor large external specifications into this repository. Use official
web links from the TAP skill's spec index when protocol details matter.

When available, use general user-installed skills as judgement aids rather than
mandatory steps:

- `codebase-design` before changing public interfaces, choosing seams, or
  making modules deeper;
- `tdd` for behavior changes and bug fixes that can be verified through public
  interfaces;
- `improve-codebase-architecture` for broad refactor discovery before
  selecting a specific candidate;
- `grilling` to stress-test a plan or design before committing to
  implementation;
- `domain-modeling` only when Starfetch domain vocabulary needs clarification;
- `handoff` when stopping with meaningful unfinished context for a later agent.

## Agent Surface Maintenance

Keep agent-facing surfaces aligned with Starfetch behavior:

- when changing CLI behavior, evaluate whether `@starfetch-js/mcp`,
  `@starfetch-js/skill`, examples, README, and package READMEs need matching
  updates;
- MCP should stay a thin adapter over `@starfetch-js/core`, not a duplicate TAP
  implementation;
- skill guidance should describe current behavior and safe usage, not planned
  behavior unless clearly labeled as future work;
- when a CLI/API change deliberately does not apply to MCP or skill guidance,
  name the reason in the issue, docs, or final handoff.

For Codex-facing MCP acceptance, rebuild the package, reload or start a fresh
Codex session so the configured `starfetch-local` MCP server is restarted, then
test through the real surfaced tools such as `mcp__starfetch_local.*`. Do not
use ad hoc stdio harnesses as proof that Codex can use the local MCP server.

## Development Workflow

Work issue-by-issue. Keep each change aligned with the active GitHub issue and
avoid using one issue to implement future roadmap items.

For implementation work:

- update code, tests, and user-facing docs together when behavior changes;
- keep CLI behavior mapped to documented `@starfetch-js/core` APIs;
- keep MCP and skill behavior, docs, and tests current when the corresponding
  agent surface exists;
- prefer fixture-driven tests over live network tests;
- make live TAP tests optional and disabled by default;
- run relevant package scripts before finishing.

Available root checks:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:cli
```

For MCP changes, also run:

```sh
npm --workspace packages/mcp run typecheck
npm --workspace packages/mcp run test
npm --workspace packages/mcp run build
```

Use `npm --workspace packages/mcp run smoke` as a package binary sanity check
when release or packaging behavior is relevant.

For skill package changes, run:

```sh
npm --workspace packages/skill run typecheck
npm --workspace packages/skill run test
npm --workspace packages/skill run build
```

## Examples Maintenance

Keep `examples/` aligned with user-visible functionality:

- when adding or changing CLI/API behavior, update the relevant example if one
  already covers that workflow;
- if behavior is user-visible and no existing example covers it, add a new
  cross-platform example under `examples/`;
- prefer Node-based runners (`run.mjs`) over shell scripts so examples work on
  Windows, macOS, and Linux;
- keep generated outputs under ignored `examples/**/out/` directories;
- when examples change, run the relevant example manually against real TAP data
  when network access is available.

For broad example changes, run:

```sh
npm run build
npm run examples:live
```

Default CI and `npm test` should stay fixture-driven and must not require live
public TAP services.

## TAP Implementation Rules

Important `0.1` rules:

- use POST for `/sync` and `/async` query submission;
- default `LANG=ADQL`;
- send ADQL as `QUERY`;
- prefer `RESPONSEFORMAT` for output requests;
- do not use obsolete `REQUEST=doQuery` by default;
- keep verified preset-specific sync compatibility parameters narrow and out of
  the CLI/API surface unless a preset endpoint is used directly;
- expose TAP `MAXREC`, `RUNID`, and VOTable-only `UPLOAD` support through the
  current CLI/API/MCP surfaces;
- detect auth-only TAP interfaces where possible and fail with
  `TapAuthUnsupportedError`;
- do not implement OAuth, cookies, passwords, tokens, or client certificates in
  `0.1`;
- parse VOTable TABLEDATA, inline base64 BINARY, and inline base64 BINARY2 rows;
- treat VOTable FITS row decoding, remote streams, and compressed streams as
  follow-up work.

## Local LAN Playground

When a task has behavior the user can reasonably verify from a phone, maintain
the temporary LAN playground under `.tmp/playground/`. Keep it gitignored and
out of package scope; do not add dependencies or committed app scaffolding only
for the playground. Reuse and update this same playground instead of creating
issue-specific playground folders.

At the end of each relevant task:

- update `.tmp/playground/` so it exercises the newly implemented behavior;
- use the fixed playground port `5174` by default;
- before starting it, check whether the playground is already running on port
  `5174`; if it is, leave it running and report the existing URL;
- if it is not running, start it on `0.0.0.0:5174`;
- do not auto-increment to another port or leave multiple playground servers
  running unless the user explicitly asks for a different port;
- report the LAN URL and what the user should verify from a phone;
- if the playground cannot be started, state the blocker and provide the
  closest command-based verification instead.

## Repo Safety

Do not revert unrelated user changes. Check `git status --short` before editing
and before finishing. If unrelated local changes exist, leave them alone.

Do not remove prototype or generated files unless the active issue asks for
cleanup. Do not run destructive git commands such as `git reset --hard` or
`git checkout --` without explicit user approval.

Keep documentation concise and implementation-ready. When work is intentionally
scoped out, name it as a future follow-up so later agents do not lose the
intent.

# Starfetch

<p align="center">
  <img src="assets/logo.svg" width="96" alt="Starfetch logo" />
</p>

Starfetch is an agent-ready TAP/ADQL toolkit for public astronomy table data.
It provides a local MCP server, a scriptable CLI, and a distributable agent
skill for inspecting TAP services and running bounded ADQL queries. A reusable
TypeScript library powers those surfaces for callers that want direct API
access.

Starfetch is intentionally TAP-first. It helps agents and humans discover TAP
metadata, query public services, manage explicit async jobs, and convert common
tabular results without hiding the underlying TAP model.

## Contents

- [Install](#install)
- [Agent Setup](#agent-setup)
- [Agent Skill](#agent-skill)
- [CLI Quickstart](#cli-quickstart)
- [Async Jobs](#async-jobs)
- [TypeScript API](#typescript-api)
- [Examples](#examples)
- [Packages](#packages)
- [Development](#development)
- [License](#license)

## Install

Run the MCP server from an agent client:

```sh
npx -y @starfetch-js/mcp
```

Install the CLI:

```sh
npm install -g @starfetch-js/cli
```

Run the CLI once without installing it globally:

```sh
npx -y @starfetch-js/cli tap tables --service gaia
```

Install the TypeScript library when you need direct API access:

```sh
npm install @starfetch-js/core
```

Starfetch requires Node.js 22 or newer at runtime. Workspace development uses
Node.js `>=22.13.0`.

## Agent Setup

MCP clients can launch the packaged stdio server with:

```json
{
  "mcpServers": {
    "starfetch": {
      "command": "npx",
      "args": ["-y", "@starfetch-js/mcp"]
    }
  }
}
```

If the MCP package is installed globally or in an environment where package
bins are available, the executable is:

```sh
starfetch-mcp
```

The MCP server exposes TAP preset, registry, metadata, bounded sync query, and
explicit async job tools:

```text
starfetch_list_presets
starfetch_registry_search
starfetch_tap_availability
starfetch_tap_capabilities
starfetch_tap_tables
starfetch_tap_columns
starfetch_tap_query
starfetch_tap_submit_job
starfetch_tap_job_status
starfetch_tap_job_wait
starfetch_tap_job_fetch
starfetch_tap_job_delete
```

MCP tools return data separately from diagnostics. They do not accept
credentials, do not execute shell commands, and do not write local result files.
`starfetch_tap_query` and `starfetch_tap_submit_job` send TAP `MAXREC=100`
when `maxrec` is omitted.

Example bounded MCP query arguments:

```json
{
  "service": "gaia",
  "query": "SELECT TOP 5 source_id, ra, dec FROM gaiadr3.gaia_source",
  "format": "json"
}
```

Example async MCP submit arguments:

```json
{
  "service": "gaia",
  "query": "SELECT TOP 10 source_id, ra, dec FROM gaiadr3.gaia_source",
  "requestFormat": "votable"
}
```

Use the returned job URL with `starfetch_tap_job_status`,
`starfetch_tap_job_wait`, `starfetch_tap_job_fetch`, and
`starfetch_tap_job_delete`. Absolute job URLs are enough for follow-up job
tools; bare job IDs require a `service` or `url`.

## Agent Skill

The `@starfetch-js/skill` package contains concise guidance for agents using
Starfetch safely: inspect metadata first, keep public-service queries bounded,
prefer JSON or JSONL for agent-readable rows, and report service/query/format
assumptions.

Inspect the packaged skill:

```sh
starfetch skill print
```

Install it for a known local agent target:

```sh
starfetch skill install --target codex
starfetch skill install --target claude-code --scope project
starfetch skill install --target cursor
```

Install into any custom final skill directory:

```sh
starfetch skill install --path ./starfetch-skill
```

Use `--dry-run` to print planned file actions without writing files.

Default install scopes:

- Codex user scope: `~/.codex/skills/starfetch`
- Claude Code user scope: `~/.claude/skills/starfetch`
- Codex project scope: `.codex/skills/starfetch`
- Claude Code project scope: `.claude/skills/starfetch`
- Cursor project scope: `.cursor/rules/starfetch.mdc`

Codex and Claude Code default to user scope. Cursor defaults to project scope
because Cursor project rules are filesystem files under `.cursor/rules`.

## CLI Quickstart

Inspect a public TAP service before writing service-specific ADQL:

```sh
starfetch tap availability --service gaia
starfetch tap tables --service gaia
starfetch tap columns --service gaia --table gaiadr3.gaia_source
```

Run a bounded query:

```sh
starfetch tap query \
  --service gaia \
  --query "SELECT TOP 5 source_id, ra, dec FROM gaiadr3.gaia_source" \
  --format json
```

Read ADQL from a file or stdin:

```sh
starfetch tap query --service gaia --file query.sql --format csv
cat query.sql | starfetch tap query --service gaia --format jsonl
```

Write result data to a file:

```sh
starfetch tap query \
  --url https://gea.esac.esa.int/tap-server/tap \
  --query "SELECT TOP 5 table_name, description FROM TAP_SCHEMA.tables" \
  --format votable \
  --out tables.xml
```

Search VO registry metadata for TAP endpoint candidates:

```sh
starfetch tap registry search gaia --maxrec 5
starfetch tap registry search gaia --format json
```

Use a returned `accessUrl` with `--url`:

```sh
starfetch tap tables --url https://example.org/tap
```

Known presets are `gaia`, `simbad`, `vizier`, `exoplanetarchive`, and `irsa`.
Use `--service` for a preset or `--url` for an explicit TAP base URL. When both
are provided, `--url` is the endpoint; the service name is retained only as
diagnostic context.

## Async Jobs

Submit a TAP async job:

```sh
starfetch tap jobs submit \
  --service gaia \
  --query "SELECT TOP 10 source_id, ra, dec FROM gaiadr3.gaia_source" \
  --maxrec 10
```

Inspect, wait for, fetch, and delete a known job:

```sh
starfetch tap jobs status https://gea.esac.esa.int/tap-server/tap/async/<job-id>

starfetch tap jobs wait \
  --interval 2000 \
  --timeout 120000 \
  https://gea.esac.esa.int/tap-server/tap/async/<job-id>

starfetch tap jobs fetch \
  https://gea.esac.esa.int/tap-server/tap/async/<job-id> \
  --format votable \
  --out result.xml

starfetch tap jobs delete https://gea.esac.esa.int/tap-server/tap/async/<job-id>
```

Bare job IDs require `--url` or `--service` so Starfetch can resolve the TAP
`/async` endpoint.

## TypeScript API

Use `@starfetch-js/core` directly when a script, app, or custom agent adapter
needs TAP access from TypeScript.

```ts
import { registry, tap } from "@starfetch-js/core";

const client = tap("gaia");

const availability = await client.availability();
const columns = await client.columns("gaiadr3.gaia_source");
const result = await client.query(
  "SELECT TOP 5 source_id, ra, dec FROM gaiadr3.gaia_source",
  { format: "votable", maxrec: 5 },
);

console.log(availability.available);
console.log(columns.length);
console.log(await result.json());

const services = await registry().searchTapServices({
  query: "gaia",
  maxrec: 5,
});
console.log(services[0]?.accessUrl);
```

`tap(target)` accepts a known preset, a TAP base URL, or an object with
`service` and/or `url`. Metadata methods read TAP `/availability`,
`/capabilities`, and `/tables`. `query()` submits ADQL to `/sync`; `jobs`
submits and controls explicit TAP `/async` jobs.

Request formats are `votable`, `csv`, and `tsv`. CLI and helper conversions can
produce `json` and `jsonl` from supported VOTable, CSV, or TSV rows. VOTable
TABLEDATA and inline base64 BINARY/BINARY2 rows are decoded for row conversion;
FITS rows, remote streams, and compressed streams remain pass-through or
unsupported for local row conversion.

## Examples

Examples live in `examples/`. Each example includes the ADQL query and expected
columns so you can run the same workflow with the CLI or from this repository.

- `examples/01-gaia-nearby-stars`
- `examples/02-gaia-high-proper-motion`
- `examples/04-simbad-field-object-types`
- `examples/10-irsa-wise-region-query`
- `examples/12-gaia-async-large-query`

With the CLI, run an example query file directly:

```sh
npm install -g @starfetch-js/cli
starfetch tap query \
  --service gaia \
  --file examples/01-gaia-nearby-stars/query.sql \
  --format csv \
  --out nearby-stars.csv
```

From this repository, the example runners use the local CLI build:

```sh
npm run build
node examples/01-gaia-nearby-stars/run.mjs
```

Run every checked-in live example from this repository:

```sh
npm run build
npm run examples:live
```

Live examples contact public TAP services. They are not part of default CI
because remote service availability, rate limits, and network conditions are
outside Starfetch's control.

## Packages

- `@starfetch-js/mcp`: stdio MCP server for Starfetch TAP tools.
- `@starfetch-js/cli`: CLI package that exposes the `starfetch` executable and
  skill commands.
- `@starfetch-js/skill`: distributable agent skill package and install helpers.
- `@starfetch-js/core`: TAP, VOSI, UWS, VOTable, registry, and output-conversion
  primitives used by the MCP server and CLI.

## Development

Install dependencies with the committed lockfile:

```sh
npm ci
```

Root checks:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:cli
```

Package checks for release-sensitive agent surfaces:

```sh
npm --workspace packages/mcp run typecheck
npm --workspace packages/mcp run test
npm --workspace packages/mcp run build
npm --workspace packages/mcp run smoke

npm --workspace packages/skill run typecheck
npm --workspace packages/skill run test
npm --workspace packages/skill run build
```

Default tests use local fixtures and mocks only. They do not require live TAP
services, network access, or secrets. Optional live checks are explicit:

```sh
npm run test:live:tap
npm run examples:live
```

## License

MIT

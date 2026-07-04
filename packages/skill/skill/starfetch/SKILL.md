---
name: starfetch
description: Use when an agent needs to inspect public astronomical TAP services, discover TAP metadata, write bounded ADQL queries, run Starfetch MCP tools or CLI commands, handle TAP async jobs, or choose Starfetch output formats safely.
---

# Starfetch

Use Starfetch to query and inspect public astronomical Table Access Protocol
(TAP) services. Prefer Starfetch MCP tools when available; otherwise use the
`starfetch` CLI or `@starfetch-js/core` library exposed by the project.

## Workflow

1. Identify the TAP service explicitly by preset or URL.
2. Inspect metadata before writing service-specific ADQL.
3. Run bounded queries first with `TOP`, TAP `MAXREC`, or both.
4. Prefer JSON or JSONL for agent-readable rows; use VOTable when VO-native
   metadata matters.
5. Report the service, query, output format, row limit, and assumptions.

## References

- Read `references/tap-workflow.md` for the metadata-first query workflow.
- Read `references/adql-patterns.md` for conservative ADQL patterns.
- Read `references/public-service-etiquette.md` before using public archives.
- Read `references/output-formats.md` when choosing result formats.
- Read `references/safety.md` for operational and interpretation limits.

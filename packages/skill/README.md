# @starfetch-js/skill

An optional agent skill for safe, reproducible queries of Gaia, SIMBAD, VizieR,
the NASA Exoplanet Archive, IRSA, and other public astronomy catalogs. It
teaches agents to select a service, inspect live TAP metadata, construct
bounded ADQL from the discovered schema, recover from failures, and report the
exact query and assumptions used.

Install the canonical skill directly from GitHub through skills.sh:

```sh
npx skills add https://github.com/starfetch-js/starfetch/tree/main/packages/skill/skill/starfetch
```

The skill supplements [@starfetch-js/mcp](https://www.npmjs.com/package/@starfetch-js/mcp);
the MCP server remains usable without filesystem skills. Use the CLI to inspect
or install the packaged guidance:

```sh
npx -y @starfetch-js/cli skill print
npx -y @starfetch-js/cli skill install --target codex
npx -y @starfetch-js/cli skill install --target claude-code --scope project
npx -y @starfetch-js/cli skill install --target cursor
```

Use `--dry-run` before installation to preview file actions. The package is a
static skill asset and install-helper dependency; install
[@starfetch-js/mcp](https://www.npmjs.com/package/@starfetch-js/mcp) to connect
an agent to catalog tools, or [@starfetch-js/cli](https://www.npmjs.com/package/@starfetch-js/cli)
for direct scripted queries.

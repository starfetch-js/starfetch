# @starfetch-js/skill

Distributable Starfetch agent skill package.

The package contains static skill files and install helpers used by
`starfetch skill` commands. The skill teaches agents to inspect TAP metadata
first, select among supported services, construct bounded ADQL from exact table
and column metadata, recover from query failures, and report exact queries and
assumptions. Focused references cover ADQL, TAP metadata, safety, Gaia, SIMBAD,
VizieR, NASA Exoplanet Archive, and IRSA, with reproducible workflow examples.

The skill is recommended for richer multi-interaction agent behavior but is
not required to use the Starfetch MCP server.

```sh
npx -y @starfetch-js/cli skill print
npx -y @starfetch-js/cli skill install --target codex
```

Use `--dry-run` to inspect planned install actions before writing files.

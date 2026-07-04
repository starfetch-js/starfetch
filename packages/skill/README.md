# @starfetch-js/skill

Distributable Starfetch agent skill package.

The package contains static skill files and install helpers used by
`starfetch skill` commands. The skill teaches agents to inspect TAP metadata
first, keep public-service queries bounded, choose agent-readable output
formats, and report query assumptions.

```sh
npm install -g @starfetch-js/cli
starfetch skill print
starfetch skill install --target codex
```

Use `--dry-run` to inspect planned install actions before writing files.

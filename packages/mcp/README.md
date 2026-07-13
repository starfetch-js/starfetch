# @starfetch-js/mcp

Query Gaia, SIMBAD, VizieR, the NASA Exoplanet Archive, IRSA, and other public
astronomy catalogs from an MCP-enabled agent. Starfetch inspects each live TAP
service's schema before querying it, keeps exploratory queries bounded, and
returns the exact ADQL needed to reproduce a result.

Starfetch is listed in the
[official MCP Registry](https://registry.modelcontextprotocol.io/?search=io.github.starfetch-js%2Fstarfetch).

## Install for an agent

Starfetch requires Node.js 22 or newer. Register this stdio server with the
client that will use it, then restart or reload that client.

### Codex

```sh
codex mcp add starfetch -- npx -y @starfetch-js/mcp
codex mcp list
```

### Claude Code

```sh
claude mcp add --scope user --transport stdio starfetch -- npx -y @starfetch-js/mcp
claude mcp get starfetch
```

### Cursor

Add this to `~/.cursor/mcp.json` for global use or `.cursor/mcp.json` for one
project:

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

Other MCP clients can use `npx -y @starfetch-js/mcp` as a stdio server.

## Ask a normal astronomy question

```text
Find the 10 Gaia DR3 sources with the highest proper motion within 0.5 degrees
of the Pleiades center at RA 56.75°, Dec +24.12°. What stands out?
```

Starfetch selects Gaia, checks its metadata, queries
`gaiadr3.gaia_source`, and returns a bounded result with its exact ADQL. A
representative captured result begins:

```text
Service: ESA Gaia Archive
Table: gaiadr3.gaia_source
Rows returned: 10
Query limit: TOP 10 / MAXREC 10

Highest returned proper motions:
- Gaia DR3 66780900298410496: 244.48 mas/yr
- Gaia DR3 66524409149512064: 184.50 mas/yr
```

The server exposes preset discovery, registry search, VOSI metadata inspection,
bounded sync queries, and explicit async jobs. Its packaged prompts, resources,
and optional skill guide metadata-first ADQL and failure-aware reporting; the
server remains usable without installing that skill.

Starfetch is for public TAP services. It does not accept credentials, execute
shell commands, write local files, or provide authoritative astrophysical
interpretation. See the [repository README](https://github.com/starfetch-js/starfetch#readme)
for the exact query, CLI and TypeScript reproduction, and full supported scope.

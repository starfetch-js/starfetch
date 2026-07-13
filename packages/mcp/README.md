# @starfetch-js/mcp

Model Context Protocol stdio server for Starfetch TAP tools.

```sh
npx -y @starfetch-js/mcp
```

Example MCP client configuration:

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

The server exposes TAP presets, registry search, metadata inspection, bounded
sync queries, and explicit async job tools. It also exposes the
`query_astronomy_catalog`, `explore_service`, `run_cone_search`, and
`troubleshoot_adql` prompts plus canonical Markdown resources under the
`starfetch://` scheme. These guidance surfaces are packaged with the server;
users do not need to install the optional filesystem skill.

Tool descriptions independently require explicit service selection,
metadata-first ADQL, bounded requests, and failure-aware reporting. The server
does not accept credentials, execute shell commands, or write local files.

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
sync queries, and explicit async job tools. It does not accept credentials,
execute shell commands, or write local files.

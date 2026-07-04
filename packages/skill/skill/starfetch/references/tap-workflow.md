# TAP Workflow

Use a metadata-first workflow for public TAP services:

1. Choose an explicit service preset or TAP base URL.
2. Check availability when the service may be down or slow.
3. Inspect capabilities for supported languages and output formats.
4. Inspect tables and columns before writing service-specific ADQL.
5. Start with a small bounded query and expand only when the user needs more.

Useful Starfetch MCP tools include `starfetch_list_presets`,
`starfetch_registry_search`, `starfetch_tap_availability`,
`starfetch_tap_capabilities`, `starfetch_tap_tables`,
`starfetch_tap_columns`, `starfetch_tap_query`, and the explicit TAP async job
tools.

For CLI fallback, prefer commands such as:

```sh
starfetch tap tables --service gaia --format json
starfetch tap columns --service gaia --table gaiadr3.gaia_source --format json
starfetch tap query --service gaia --query "SELECT TOP 5 source_id, ra, dec FROM gaiadr3.gaia_source" --format json
```

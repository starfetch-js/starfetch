# TAP metadata

Use metadata to establish facts before querying data.

1. List Starfetch presets when the appropriate service is unknown.
2. Search the VO registry when no preset fits the question.
3. Check `/availability` when a service may be down or in maintenance.
4. Inspect `/capabilities` for languages, formats, limits, and interfaces.
5. Inspect `/tables`, selecting an exact table name from the response.
6. Inspect columns for that exact table before writing ADQL.

Useful MCP tools are `starfetch_list_presets`, `starfetch_registry_search`,
`starfetch_tap_availability`, `starfetch_tap_capabilities`,
`starfetch_tap_tables`, and `starfetch_tap_columns`.

For CLI fallback:

```sh
starfetch tap tables --service gaia --format json
starfetch tap columns --service gaia --table gaiadr3.gaia_source --format json
```

Descriptions, units, UCDs, and datatypes constrain interpretation. A familiar
table or column name from another release or service is not evidence that it
exists on the selected service.

# ADQL Patterns

Write conservative ADQL that follows the service metadata:

- Use exact table and column names discovered from TAP metadata.
- Include `TOP` for exploratory queries unless the user explicitly asks for a
  larger result.
- Select only columns needed for the task.
- Use service-specific schema names only after inspecting tables.
- Avoid claiming an ADQL expression is portable unless it is known to work
  across the target services.

Good first query shape:

```sql
SELECT TOP 5 source_id, ra, dec
FROM gaiadr3.gaia_source
```

Use TAP `MAXREC` separately from ADQL `TOP` when the tool or CLI exposes it.
`TOP` changes the ADQL query; `MAXREC` is a TAP request limit.

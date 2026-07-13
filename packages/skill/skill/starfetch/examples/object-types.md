# SIMBAD object types in a region

Question: Return a small sample of SIMBAD objects and their primary object
types near an ICRS position.

Service: `simbad`

Expected tool sequence:

1. `starfetch_tap_availability`
2. `starfetch_tap_tables`
3. `starfetch_tap_columns` for `basic`
4. `starfetch_tap_query` with `format: "json"` and `maxrec: 20`

Inspect SIMBAD tables and columns before using this service-specific query:

```sql
SELECT TOP 20 main_id, otype, ra, dec
FROM basic
WHERE 1 = CONTAINS(
  POINT('ICRS', ra, dec),
  CIRCLE('ICRS', 10.6847, 41.2687, 0.1)
)
```

Execute with MCP `maxrec: 20`. Report the exact center and radius in degrees,
and describe `otype` only according to the current SIMBAD metadata. If the
query fails, re-inspect the table, columns, and spatial-function support before
retrying.

Schematic response shape (not a captured archive result):

```json
[{ "main_id": "M 31", "otype": "Galaxy", "ra": 10.6847, "dec": 41.2687 }]
```

If the spatial predicate is unsupported, use a metadata-confirmed alternative
supported by SIMBAD. A fallback service must be named and justified rather
than silently substituted because its classifications may not be equivalent.

# Cone search

Question: Which catalog objects lie within a small radius of a supplied ICRS
position?

1. Select the service appropriate to the requested catalog.
2. Inspect tables and the chosen table's coordinate columns.
3. Confirm coordinate units and spatial-function support.
4. Run a bounded query shaped like:

```sql
SELECT TOP 20 object_id, ra, dec
FROM discovered_schema.discovered_table
WHERE 1 = CONTAINS(
  POINT('ICRS', ra, dec),
  CIRCLE('ICRS', :ra_degrees, :dec_degrees, :radius_degrees)
)
```

Replace every placeholder with metadata-backed identifiers and numeric values;
ADQL does not receive the colon placeholders above directly. Report the exact
executed query, coordinate frame, radius in degrees, service, and table.

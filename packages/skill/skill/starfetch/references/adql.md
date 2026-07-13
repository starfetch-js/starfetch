# ADQL

Construct ADQL only after inspecting the target service's tables and columns.
Use exact identifiers and select only the fields required for the question.

## Bounds

Use `TOP` inside ADQL for an explicit query-level row bound. Use TAP `MAXREC`
as a separate request limit. For exploratory work, use both when practical:

```sql
SELECT TOP 10 source_id, ra, dec
FROM gaiadr3.gaia_source
```

ADQL uses `TOP`, not SQL dialects' `LIMIT` syntax.

## Spatial predicates

ADQL spatial functions commonly use degrees:

```sql
CONTAINS(
  POINT('ICRS', ra, dec),
  CIRCLE('ICRS', 56.75, 24.12, 0.1)
) = 1
```

Confirm the service's supported ADQL version and function behavior through
capabilities or service guidance. Confirm coordinate column units through
column metadata. Do not guess coordinate systems, units, or function support.

## Failure recovery

On unknown-table, unknown-column, reserved-identifier, function, join, or
syntax errors, inspect tables, columns, and capabilities again before changing
the query. Do not repeatedly mutate an unverified query from memory.

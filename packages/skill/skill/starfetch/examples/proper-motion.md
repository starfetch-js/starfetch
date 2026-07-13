# Gaia high proper motion

Question: Return a small sample of Gaia sources whose total proper motion is
high.

Service: `gaia`

Expected tool sequence:

1. `starfetch_tap_availability`
2. `starfetch_tap_tables`
3. `starfetch_tap_columns` for the selected Gaia source table
4. `starfetch_tap_query` with `format: "json"` and `maxrec: 20`

After confirming the table and columns in current metadata, a suitable query
is:

```sql
SELECT TOP 20 source_id, ra, dec, pmra, pmdec,
  SQRT(POWER(pmra, 2) + POWER(pmdec, 2)) AS total_pm
FROM gaiadr3.gaia_source
WHERE pmra IS NOT NULL
  AND pmdec IS NOT NULL
  AND SQRT(POWER(pmra, 2) + POWER(pmdec, 2)) > 500
ORDER BY total_pm DESC
```

Report that the threshold and returned proper-motion values use the units
advertised by current column metadata. Do not infer distance from this result.

Schematic response shape (not a captured archive result):

```json
[
  {
    "source_id": "…",
    "ra": 123.4,
    "dec": -45.6,
    "pmra": 612.3,
    "pmdec": -81.2,
    "total_pm": 617.7
  }
]
```

If the table, columns, functions, or ordering expression is rejected, inspect
current metadata and capabilities before retrying. If Gaia is unavailable,
report that condition; do not substitute a different catalog silently.

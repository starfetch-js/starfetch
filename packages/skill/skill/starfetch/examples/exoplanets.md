# Short-period exoplanets

Question: Return a small sample of confirmed planets with short orbital
periods.

Service: `exoplanetarchive`

Expected tool sequence:

1. `starfetch_tap_availability`
2. `starfetch_tap_tables`
3. `starfetch_tap_columns` for the selected confirmed-planet table
4. `starfetch_tap_query` with `format: "json"` and `maxrec: 20`

Inspect tables and columns first. Select the confirmed-planet table that
contains the planet name, orbital period, and relevant solution/status fields.
Then run a query bounded with both `TOP` and MCP `maxrec`:

```sql
SELECT TOP 20 pl_name, hostname, pl_orbper
FROM pscomppars
WHERE pl_orbper IS NOT NULL
  AND pl_orbper < 10
ORDER BY pl_orbper ASC
```

The table and fields above must be reconfirmed before execution. Report the
period unit from metadata and avoid interpreting missing periods as physically
periodless planets.

Schematic response shape (not a captured archive result):

```json
[{ "pl_name": "Example b", "hostname": "Example", "pl_orbper": 2.5 }]
```

If `pscomppars` or a selected field is unavailable, re-inspect metadata and
choose the current confirmed-planet product deliberately. If the archive is
unavailable, report the service failure rather than an empty planet set.

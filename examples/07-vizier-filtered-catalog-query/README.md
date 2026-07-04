# VizieR Filtered Catalog Query

Query VizieR Gaia DR3 rows with simple parallax, magnitude, color, and proper
motion filters.

Service: VizieR TAP preset, `vizier`.
Table: `"I/355/gaiadr3"`.

Run:

```sh
node examples/07-vizier-filtered-catalog-query/run.mjs
```

The workflow writes `out/vizier-filtered.jsonl`.

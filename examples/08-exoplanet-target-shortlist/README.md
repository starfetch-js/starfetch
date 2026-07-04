# Exoplanet Target Shortlist

Query confirmed exoplanet systems and export host/planet fields that can be
ranked by local scripts or downstream tools.

Service: NASA Exoplanet Archive TAP preset, `exoplanetarchive`.
Table: `pscomppars`.

Run:

```sh
node examples/08-exoplanet-target-shortlist/run.mjs
```

The workflow writes `out/targets.jsonl`. The optional `rank-targets.ts` script
is example code, not Starfetch core behavior.

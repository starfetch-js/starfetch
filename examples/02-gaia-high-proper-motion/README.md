# Gaia High Proper Motion

Fetch Gaia DR3 sources with large total proper motion for downstream review or
visualization.

Service: ESA Gaia Archive TAP preset, `gaia`.
Table: `gaiadr3.gaia_source`.

Run:

```sh
node examples/02-gaia-high-proper-motion/run.mjs
```

The workflow writes `out/high-proper-motion.jsonl`.

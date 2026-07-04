# Gaia Nearby Stars

Fetch a small Gaia DR3 sample of nearby sources for downstream inspection.

Service: ESA Gaia Archive TAP preset, `gaia`.
Table: `gaiadr3.gaia_source`.

Run:

```sh
node examples/01-gaia-nearby-stars/run.mjs
```

The workflow writes `out/nearby-stars.csv`. Public TAP service availability is
outside Starfetch's control; retry later if the remote service is unavailable.

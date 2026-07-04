# Starfetch Examples

These examples solve small astronomy-data retrieval problems with Starfetch's
current TAP/ADQL-first CLI and `@starfetch-js/core` API.

They intentionally stay inside the implemented v1 surface:

- TAP metadata and query workflows;
- sync ADQL queries;
- explicit async TAP job lifecycle commands;
- output formats `votable`, `csv`, `tsv`, `json`, and `jsonl`;
- service presets `gaia`, `simbad`, `vizier`, `exoplanetarchive`, and `irsa`.

The primary execution path is cross-platform. Run examples with Node.js rather
than shell scripts:

```sh
npm run build
node examples/01-gaia-nearby-stars/run.mjs
```

Run every live example:

```sh
npm run build
npm run examples:live
```

Live examples contact public TAP services. They are not part of default CI
because remote service availability, rate limits, and network conditions are
outside Starfetch's control.

## Examples

- `01-gaia-nearby-stars`: nearby Gaia DR3 sources.
- `02-gaia-high-proper-motion`: high proper-motion Gaia DR3 sources.
- `03-gaia-hr-diagram-table`: starter table for downstream HR diagrams.
- `04-simbad-field-object-types`: SIMBAD object types in a sky region.
- `05-simbad-identifiers-join`: SIMBAD `basic` to `ident` join.
- `06-vizier-catalog-field-query`: VizieR Gaia DR3 field query.
- `07-vizier-filtered-catalog-query`: VizieR filtered catalog query.
- `08-exoplanet-target-shortlist`: NASA Exoplanet Archive shortlist export.
- `09-exoplanet-transiting-hosts`: known transiting exoplanet hosts.
- `10-irsa-wise-region-query`: IRSA AllWISE cone query.
- `11-irsa-spatial-query-cookbook`: IRSA cone, box, and polygon queries.
- `12-gaia-async-large-query`: Gaia TAP async submit/status/wait/fetch/delete.

Generated result files are written under each example's ignored `out/`
directory.

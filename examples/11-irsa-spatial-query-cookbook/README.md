# IRSA Spatial Query Cookbook

Run cone, box, and polygon ADQL spatial queries against the IRSA AllWISE source
catalog.

Service: IRSA TAP preset, `irsa`.
Table: `allwise_p3as_psd`.

Run:

```sh
node examples/11-irsa-spatial-query-cookbook/run.mjs
```

The workflow writes `out/cone.csv`, `out/box.csv`, and `out/polygon.csv`.

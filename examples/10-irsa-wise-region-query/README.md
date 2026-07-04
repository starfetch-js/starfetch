# IRSA WISE Region Query

Query a small sky region from the IRSA AllWISE source catalog and save the
result in a script-friendly format.

Service: IRSA TAP preset, `irsa`.
Table: `allwise_p3as_psd`.

Run:

```sh
node examples/10-irsa-wise-region-query/run.mjs
```

The workflow writes `out/sources.csv`.

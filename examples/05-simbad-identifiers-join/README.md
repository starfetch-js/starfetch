# SIMBAD Identifiers Join

Join SIMBAD object metadata to identifier rows, showing a real ADQL join over
SIMBAD TAP tables.

Service: SIMBAD TAP preset, `simbad`.
Tables: `basic`, `ident`.

Run:

```sh
node examples/05-simbad-identifiers-join/run.mjs
```

The workflow writes `out/identifiers.jsonl`.

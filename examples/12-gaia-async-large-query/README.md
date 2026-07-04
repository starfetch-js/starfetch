# Gaia Async Job Lifecycle

Submit, inspect, wait for, fetch, and clean up a Gaia TAP async job. Async TAP is
useful when a query may take longer than a simple `/sync` request or when a
service expects longer work to use UWS jobs.

Service: ESA Gaia Archive TAP preset, `gaia`.
Table: `gaiadr3.gaia_source`.

Run:

```sh
node examples/12-gaia-async-large-query/run.mjs
```

The workflow writes `out/result.xml` and deletes the remote job at the end.
Starfetch exposes explicit polling through `tap jobs wait`; it does not run a
background scheduler or hidden polling daemon.

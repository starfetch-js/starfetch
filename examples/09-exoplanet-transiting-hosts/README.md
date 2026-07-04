# Exoplanet Transiting Hosts

Fetch a compact list of known transiting planet hosts for dashboards or simple
follow-up planning inputs. This example retrieves data only; it does not compute
ephemerides or observability.

Service: NASA Exoplanet Archive TAP preset, `exoplanetarchive`.
Table: `pscomppars`.

Run:

```sh
node examples/09-exoplanet-transiting-hosts/run.mjs
```

The workflow writes `out/transiting-hosts.jsonl`.

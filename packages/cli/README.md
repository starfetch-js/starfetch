# @starfetch-js/cli

Query Gaia, SIMBAD, VizieR, the NASA Exoplanet Archive, IRSA, and other public
astronomy TAP services from the command line. Starfetch keeps ADQL visible so
an agent result, script, or investigation can be reproduced exactly.

Requires Node.js 22 or newer.

```sh
npm install -g @starfetch-js/cli
starfetch tap tables --service gaia
```

Run once without installing globally:

```sh
npx -y @starfetch-js/cli tap tables --service gaia
```

## Metadata first, then a bounded query

Inspect the live schema before writing service-specific ADQL:

```sh
starfetch tap availability --service gaia
starfetch tap tables --service gaia
starfetch tap columns --service gaia --table gaiadr3.gaia_source
```

Then run a reproducible query. `TOP` bounds the ADQL result and `--maxrec`
bounds the TAP request:

```sh
starfetch tap query \
  --service gaia \
  --query "SELECT TOP 5 source_id, ra, dec FROM gaiadr3.gaia_source" \
  --maxrec 5 \
  --format json
```

```json
[{ "source_id": "…", "ra": 56.64828, "dec": 24.38537 }]
```

The CLI also supports VO registry discovery, explicit TAP/UWS async jobs,
CSV/TSV/VOTable output, and `starfetch skill` commands. It is intended for
public TAP services, not authenticated/private archives, image processing, or
authoritative astrophysical interpretation.

For the complete Gaia proper-motion workflow and TypeScript API, see the
[repository README](https://github.com/starfetch-js/starfetch#readme).

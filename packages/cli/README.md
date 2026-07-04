# @starfetch-js/cli

Command-line interface for Starfetch TAP/ADQL workflows.

```sh
npm install -g @starfetch-js/cli
```

Run once without a global install:

```sh
npx -y @starfetch-js/cli tap tables --service gaia
```

```sh
starfetch tap tables --service gaia
starfetch tap query \
  --service gaia \
  --query "SELECT TOP 5 source_id, ra, dec FROM gaiadr3.gaia_source" \
  --format json
```

The CLI exposes TAP metadata, registry search, sync queries, explicit async
jobs, and `starfetch skill` commands for installing the packaged agent skill.

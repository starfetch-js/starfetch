# @starfetch-js/core

TypeScript primitives for querying Gaia, SIMBAD, VizieR, the NASA Exoplanet
Archive, IRSA, and other public astronomy TAP services. Use this package for a
script, application, or custom agent adapter that needs reproducible ADQL,
live VOSI metadata, TAP/UWS jobs, VOTable parsing, registry discovery, and
structured output conversion.

```sh
npm install @starfetch-js/core
```

```ts
import { tap } from "@starfetch-js/core";

const client = tap("gaia");
const columns = await client.columns("gaiadr3.gaia_source");
const result = await client.query(
  "SELECT TOP 5 source_id, ra, dec FROM gaiadr3.gaia_source",
  { format: "votable", maxrec: 5 },
);

console.log(columns.length);
console.log(await result.fields());
console.log(await result.overflow());
console.log(await result.json());
```

Inspect current tables and columns before constructing service-specific ADQL;
use both ADQL `TOP` and TAP `MAXREC` for exploratory bounds. This package is
for public TAP access and does not implement authentication or scientific
interpretation. Use [@starfetch-js/mcp](https://www.npmjs.com/package/@starfetch-js/mcp)
for an agent-ready server or [@starfetch-js/cli](https://www.npmjs.com/package/@starfetch-js/cli)
for scripting.

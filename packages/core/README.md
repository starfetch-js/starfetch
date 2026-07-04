# @starfetch-js/core

Reusable TAP, VOSI, UWS, VOTable, registry, and output-conversion primitives
for Starfetch. Use it directly when a script, app, or custom agent adapter needs
TAP access from TypeScript.

```sh
npm install @starfetch-js/core
```

```ts
import { tap } from "@starfetch-js/core";

const result = await tap("gaia").query(
  "SELECT TOP 5 source_id, ra, dec FROM gaiadr3.gaia_source",
  { format: "votable", maxrec: 5 },
);

console.log(await result.json());
```

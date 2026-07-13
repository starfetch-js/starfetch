import { tap } from "@starfetch-js/core";

const service = "gaia";
const table = "gaiadr3.gaia_source";
const maxrec = 10;
const query = `SELECT TOP 10 source_id, ra, dec, pm, pmra, pmdec, parallax, parallax_error,
  phot_g_mean_mag, bp_rp, ruwe
FROM ${table}
WHERE CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', 56.75, 24.12, 0.5)) = 1
  AND pm IS NOT NULL
ORDER BY pm DESC`;

const client = tap(service);
const availability = await client.availability();

if (!availability.available) {
  throw new Error(
    availability.message ?? "ESA Gaia Archive reports that it is unavailable.",
  );
}

const columns = await client.columns(table);

if (columns.length === 0) {
  throw new Error(`${table} was not found in live Gaia metadata.`);
}

const result = await client.query(query, { format: "votable", maxrec });

console.log(
  JSON.stringify(
    {
      service: "ESA Gaia Archive",
      table,
      query,
      maxrec,
      rows: await result.json(),
    },
    null,
    2,
  ),
);

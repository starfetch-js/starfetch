import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { tap } from "@starfetch-js/core";

const dir = dirname(fileURLToPath(import.meta.url));
const query = await readFile(resolve(dir, "query.sql"), "utf8");
const result = await tap("simbad").query(query, { format: "votable" });

for await (const row of result.rows()) {
  console.log(row);
}

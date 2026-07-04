import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { tap } from "@starfetch-js/core";

const dir = dirname(fileURLToPath(import.meta.url));
const query = await readFile(resolve(dir, "query.sql"), "utf8");
const result = await tap("gaia").query(query, { format: "csv" });

console.log(await result.text());

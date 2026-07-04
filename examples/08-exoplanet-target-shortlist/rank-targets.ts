import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type TargetRow = {
  pl_name?: string;
  hostname?: string;
  sy_dist?: string;
  pl_rade?: string;
};

const dir = dirname(fileURLToPath(import.meta.url));
const rows = (await readFile(resolve(dir, "out", "targets.jsonl"), "utf8"))
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as TargetRow)
  .sort((left, right) => toNumber(left.sy_dist) - toNumber(right.sy_dist));

for (const row of rows.slice(0, 10)) {
  console.log([row.pl_name, row.hostname, row.sy_dist, row.pl_rade].join("\t"));
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

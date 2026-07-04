import { readFile } from "node:fs/promises";

const fixturesUrl = new URL("fixtures/", import.meta.url);

export async function readCoreFixture(name: string): Promise<string> {
  return readFile(new URL(name, fixturesUrl), "utf8");
}

import { writeFile } from "node:fs/promises";

import type { OutputWriter } from "./cli-runtime.js";

export async function writeResultData(
  data: string,
  outputPath: string | undefined,
  stdout: OutputWriter,
): Promise<void> {
  if (outputPath !== undefined) {
    await writeFile(outputPath, data, "utf8");
  } else {
    writeOutput(stdout, data);
  }
}

export function writeOutput(writer: OutputWriter, chunk: string): void {
  writer.write(chunk);
}

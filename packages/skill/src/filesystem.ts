import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function pathState(
  path: string,
): Promise<"missing" | "file" | "directory"> {
  try {
    const pathStat = await stat(path);
    if (pathStat.isDirectory()) {
      return "directory";
    }

    return "file";
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "missing";
    }

    throw error;
  }
}

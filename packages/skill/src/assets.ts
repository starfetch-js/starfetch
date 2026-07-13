import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { pathState } from "./filesystem.js";
import type { StarfetchSkillFile, StarfetchSkillOptions } from "./types.js";

export const starfetchSkillPaths = [
  "SKILL.md",
  "references/adql.md",
  "references/tap-metadata.md",
  "references/query-safety.md",
  "references/services/gaia.md",
  "references/services/simbad.md",
  "references/services/vizier.md",
  "references/services/exoplanet-archive.md",
  "references/services/irsa.md",
  "examples/cone-search.md",
  "examples/proper-motion.md",
  "examples/exoplanets.md",
  "examples/object-types.md",
] as const;

export type StarfetchSkillPath = (typeof starfetchSkillPaths)[number];

const starfetchSkillPathSet = new Set<string>(starfetchSkillPaths);
const bundledSkillFileCache = new Map<StarfetchSkillPath, Promise<string>>();

/**
 * Read all files from the packaged Starfetch skill bundle.
 *
 * @throws Error when a required skill asset is missing.
 */
export async function readStarfetchSkillFiles(
  options: StarfetchSkillOptions = {},
): Promise<StarfetchSkillFile[]> {
  const sourceDir = resolveSourceDir(options.sourceDir);
  const files = await readSkillDirectory(sourceDir, sourceDir);
  validateRequiredSkillFiles(files);

  return sortSkillFiles(files);
}

/** Read one canonical file from the packaged Starfetch skill bundle. */
export async function readStarfetchSkillFile(
  relativePath: StarfetchSkillPath,
  options: StarfetchSkillOptions = {},
): Promise<string> {
  if (!starfetchSkillPathSet.has(relativePath)) {
    throw new Error(`Unknown Starfetch skill asset: ${relativePath}`);
  }

  if (options.sourceDir !== undefined) {
    return readRequiredSkillFile(
      resolveSourceDir(options.sourceDir),
      relativePath,
    );
  }

  let contents = bundledSkillFileCache.get(relativePath);
  if (contents === undefined) {
    contents = readRequiredSkillFile(resolveSourceDir(), relativePath);
    bundledSkillFileCache.set(relativePath, contents);
  }

  return contents;
}

/**
 * Print the packaged Starfetch skill as a Markdown bundle for inspection.
 */
export async function printStarfetchSkill(
  options: StarfetchSkillOptions = {},
): Promise<string> {
  const files = await readStarfetchSkillFiles(options);
  const sections = files.map((file) =>
    [
      `## ${file.relativePath}`,
      "```markdown",
      file.contents.trimEnd(),
      "```",
    ].join("\n"),
  );

  return ["# Starfetch Skill Bundle", ...sections].join("\n\n");
}

/** Normalize skill asset options before sharing them with helper functions. */
export function buildSkillOptions(
  options: StarfetchSkillOptions,
): StarfetchSkillOptions {
  const skillOptions: StarfetchSkillOptions = {};
  if (options.sourceDir !== undefined) {
    skillOptions.sourceDir = options.sourceDir;
  }

  return skillOptions;
}

/** Sort skill files in stable install and print order. */
export function sortSkillFiles(
  files: StarfetchSkillFile[],
): StarfetchSkillFile[] {
  const requiredOrder = new Map<string, number>(
    starfetchSkillPaths.map((relativePath, index) => [relativePath, index]),
  );

  return files.sort((left, right) => {
    const leftOrder = requiredOrder.get(left.relativePath);
    const rightOrder = requiredOrder.get(right.relativePath);

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }

    if (leftOrder !== undefined) {
      return -1;
    }

    if (rightOrder !== undefined) {
      return 1;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });
}

function resolveSourceDir(sourceDir?: string): string {
  if (sourceDir !== undefined) {
    return resolve(sourceDir);
  }

  return fileURLToPath(new URL("../skill/starfetch/", import.meta.url));
}

function validateRequiredSkillFiles(files: StarfetchSkillFile[]): void {
  const foundPaths = new Set(files.map((file) => file.relativePath));
  for (const relativePath of starfetchSkillPaths) {
    if (!foundPaths.has(relativePath)) {
      throw new Error(`Missing Starfetch skill asset: ${relativePath}`);
    }
  }
}

async function readRequiredSkillFile(
  sourceDir: string,
  relativePath: StarfetchSkillPath,
): Promise<string> {
  const filePath = join(sourceDir, relativePath);
  if ((await pathState(filePath)) !== "file") {
    throw new Error(`Missing Starfetch skill asset: ${relativePath}`);
  }

  return readFile(filePath, "utf8");
}

async function readSkillDirectory(
  rootDir: string,
  directory: string,
): Promise<StarfetchSkillFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: StarfetchSkillFile[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await readSkillDirectory(rootDir, path)));
      continue;
    }

    if (entry.isFile()) {
      files.push({
        relativePath: skillRelativePath(rootDir, path),
        contents: await readFile(path, "utf8"),
      });
    }
  }

  return files;
}

function skillRelativePath(rootDir: string, path: string): string {
  return relative(rootDir, path).split(sep).join("/");
}

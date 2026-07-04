import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { pathState } from "./filesystem.js";
import type { StarfetchSkillFile, StarfetchSkillOptions } from "./types.js";

const requiredSkillFiles = [
  "SKILL.md",
  "references/tap-workflow.md",
  "references/adql-patterns.md",
  "references/public-service-etiquette.md",
  "references/output-formats.md",
  "references/safety.md",
];

/**
 * Read all files from the packaged Starfetch skill bundle.
 *
 * @throws Error when a required skill asset is missing.
 */
export async function readStarfetchSkillFiles(
  options: StarfetchSkillOptions = {},
): Promise<StarfetchSkillFile[]> {
  const sourceDir = resolveSourceDir(options.sourceDir);
  await validateRequiredSkillFiles(sourceDir);

  return sortSkillFiles(await readSkillDirectory(sourceDir, sourceDir));
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
  const requiredOrder = new Map(
    requiredSkillFiles.map((relativePath, index) => [relativePath, index]),
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

async function validateRequiredSkillFiles(sourceDir: string): Promise<void> {
  for (const relativePath of requiredSkillFiles) {
    const filePath = join(sourceDir, relativePath);
    const fileState = await pathState(filePath);

    if (fileState !== "file") {
      throw new Error(`Missing Starfetch skill asset: ${relativePath}`);
    }
  }
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

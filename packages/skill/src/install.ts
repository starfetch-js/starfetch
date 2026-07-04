import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  buildSkillOptions,
  readStarfetchSkillFiles,
  sortSkillFiles,
} from "./assets.js";
import { buildCursorRuleFiles } from "./cursor-rule.js";
import { pathState } from "./filesystem.js";
import { resolveStarfetchSkillTargetDestination } from "./targets.js";
import type {
  StarfetchSkillAction,
  StarfetchSkillFile,
  StarfetchSkillInstallPathOptions,
  StarfetchSkillInstallResult,
  StarfetchSkillInstallTargetOptions,
} from "./types.js";

type PlannedSkillAction = StarfetchSkillAction & {
  file: StarfetchSkillFile;
};

type SkillFileInstallOptions = {
  destination: string;
  dryRun?: boolean;
  files: StarfetchSkillFile[];
};

/**
 * Install the packaged Starfetch skill into an exact destination directory.
 *
 * Existing files are updated only when contents differ. Use `dryRun` to report
 * planned actions without writing files.
 */
export async function installStarfetchSkill(
  options: StarfetchSkillInstallPathOptions,
): Promise<StarfetchSkillInstallResult> {
  const installOptions: SkillFileInstallOptions = {
    destination: options.destination,
    files: await readStarfetchSkillFiles(buildSkillOptions(options)),
  };
  if (options.dryRun !== undefined) {
    installOptions.dryRun = options.dryRun;
  }

  return installStarfetchSkillFiles(installOptions);
}

/**
 * Install the packaged Starfetch skill into a known local agent target.
 *
 * Codex and Claude Code default to user scope. Cursor defaults to project
 * scope and receives a project rule file.
 */
export async function installStarfetchSkillTarget(
  options: StarfetchSkillInstallTargetOptions,
): Promise<StarfetchSkillInstallResult> {
  const destination = await resolveStarfetchSkillTargetDestination(options);
  const skillOptions = buildSkillOptions(options);
  const installOptions: SkillFileInstallOptions = {
    destination,
    files:
      options.target === "cursor"
        ? await buildCursorRuleFiles(skillOptions)
        : await readStarfetchSkillFiles(skillOptions),
  };
  if (options.dryRun !== undefined) {
    installOptions.dryRun = options.dryRun;
  }

  return installStarfetchSkillFiles(installOptions);
}

async function installStarfetchSkillFiles(
  options: SkillFileInstallOptions,
): Promise<StarfetchSkillInstallResult> {
  const destination = resolve(options.destination);
  const dryRun = options.dryRun ?? false;
  const destinationState = await pathState(destination);

  if (destinationState === "file") {
    throw new Error(`Skill destination is a file: ${destination}`);
  }

  const plannedActions = await planSkillInstall(
    destination,
    sortSkillFiles(options.files),
  );

  if (!dryRun) {
    await mkdir(destination, { recursive: true });

    for (const action of plannedActions) {
      if (action.kind === "unchanged") {
        continue;
      }

      await mkdir(dirname(action.path), { recursive: true });
      await writeFile(action.path, action.file.contents);
    }
  }

  return {
    destination,
    dryRun,
    actions: plannedActions.map(({ kind, path }) => ({ kind, path })),
  };
}

async function planSkillInstall(
  destination: string,
  files: StarfetchSkillFile[],
): Promise<PlannedSkillAction[]> {
  const actions: PlannedSkillAction[] = [];

  for (const file of files) {
    const targetPath = join(destination, file.relativePath);
    const targetState = await pathState(targetPath);

    if (targetState === "directory") {
      throw new Error(
        `Cannot replace directory with skill file: ${targetPath}`,
      );
    }

    if (targetState === "missing") {
      actions.push({ kind: "create", path: targetPath, file });
      continue;
    }

    const existingContents = await readFile(targetPath, "utf8");
    actions.push({
      kind: existingContents === file.contents ? "unchanged" : "update",
      path: targetPath,
      file,
    });
  }

  return actions;
}

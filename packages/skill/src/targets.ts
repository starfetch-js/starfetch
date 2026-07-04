import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { exists } from "./filesystem.js";
import type {
  StarfetchSkillInstallTargetOptions,
  StarfetchSkillScope,
  StarfetchSkillTarget,
} from "./types.js";

/**
 * Resolve the destination directory for a known Starfetch skill target.
 *
 * User-scope installs resolve under the user's home directory. Project-scope
 * installs resolve under `projectDir` or the nearest parent containing `.git`.
 */
export async function resolveStarfetchSkillTargetDestination(
  options: StarfetchSkillInstallTargetOptions,
): Promise<string> {
  const scope = options.scope ?? defaultScopeForTarget(options.target);

  if (scope === "user") {
    if (options.target === "cursor") {
      throw new Error(
        "Cursor user rules do not have a stable filesystem install path. Use --target cursor --scope project or --path <dir>.",
      );
    }

    return join(resolveHomeDir(options.homeDir), ...targetPath(options.target));
  }

  const projectRoot =
    options.projectDir === undefined
      ? await findProjectRoot(options.cwd ?? process.cwd())
      : resolve(options.projectDir);

  return join(projectRoot, ...targetPath(options.target));
}

/**
 * Find the nearest parent directory containing `.git`.
 *
 * Returns `startDir` when no project root can be found.
 */
export async function findProjectRoot(startDir: string): Promise<string> {
  let current = resolve(startDir);

  while (true) {
    if (await exists(join(current, ".git"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(startDir);
    }

    current = parent;
  }
}

function targetPath(target: StarfetchSkillTarget): string[] {
  switch (target) {
    case "codex":
      return [".codex", "skills", "starfetch"];
    case "claude-code":
      return [".claude", "skills", "starfetch"];
    case "cursor":
      return [".cursor", "rules"];
  }
}

function defaultScopeForTarget(
  target: StarfetchSkillTarget,
): StarfetchSkillScope {
  switch (target) {
    case "codex":
    case "claude-code":
      return "user";
    case "cursor":
      return "project";
  }
}

function resolveHomeDir(homeDir?: string): string {
  const resolved = homeDir ?? homedir();

  if (resolved.length === 0) {
    throw new Error("Cannot resolve home directory for skill install");
  }

  return resolve(resolved);
}

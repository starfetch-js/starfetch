import { Command } from "commander";
import {
  installStarfetchSkill,
  installStarfetchSkillTarget,
  printStarfetchSkill,
  type StarfetchSkillAction,
  type StarfetchSkillInstallResult,
  type StarfetchSkillInstallPathOptions,
  type StarfetchSkillInstallTargetOptions,
  type StarfetchSkillScope,
  type StarfetchSkillTarget,
} from "@starfetch-js/skill";

import { writeOutput } from "./cli-output.js";
import type { RunCliOptions } from "./cli-runtime.js";

const skillExamples = [
  "starfetch skill install --target codex --dry-run",
  "starfetch skill install --target claude-code --scope project",
  "starfetch skill install --target cursor",
  "starfetch skill install --path ./my-agent/skills/starfetch",
];

type SkillInstallCommandResult = {
  result: StarfetchSkillInstallResult;
  nextStep: string;
};

type InstallCommandOptions = {
  path?: string;
  target?: string;
  scope?: string;
  projectDir?: string;
  dryRun?: boolean;
};

export function registerSkillCommand(
  program: Command,
  options: RunCliOptions,
): void {
  const stdout = options.stdout ?? process.stdout;

  const skillCommand = program
    .command("skill")
    .description("Install and inspect the Starfetch agent skill.")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  starfetch skill print",
        ...skillExamples.map((example) => `  ${example}`),
      ].join("\n"),
    );

  skillCommand
    .command("print")
    .description("Print the bundled Starfetch skill files.")
    .action(async () => {
      writeOutput(stdout, `${await printStarfetchSkill()}\n`);
    });

  skillCommand
    .command("install")
    .description("Install the Starfetch skill into a known or custom location.")
    .option("--path <dir>", "exact directory where SKILL.md will be written")
    .option("--target <target>", "known target: codex, claude-code, or cursor")
    .option(
      "--scope <scope>",
      "install scope: user or project (default: user; cursor defaults to project)",
    )
    .option("--project-dir <dir>", "project root override for project scope")
    .option("--dry-run", "print planned actions without writing files")
    .addHelpText(
      "after",
      ["", "Examples:", ...skillExamples.map((example) => `  ${example}`)].join(
        "\n",
      ),
    )
    .action(async (commandOptions: InstallCommandOptions) => {
      const install =
        commandOptions.path === undefined
          ? await installKnownTarget(commandOptions, options)
          : {
              result: await installCustomPath(
                commandOptions.path,
                commandOptions,
              ),
              nextStep:
                "Point your agent at this skill directory if it does not discover skills automatically.",
            };

      writeOutput(stdout, formatInstallResult(install));
    });
}

async function installCustomPath(
  destination: string,
  options: InstallCommandOptions,
) {
  if (options.target !== undefined) {
    throw new Error("--path cannot be used with --target");
  }

  if (options.scope !== undefined) {
    throw new Error("--path cannot be used with --scope");
  }

  if (options.projectDir !== undefined) {
    throw new Error("--path cannot be used with --project-dir");
  }

  const installOptions: StarfetchSkillInstallPathOptions = { destination };

  if (options.dryRun !== undefined) {
    installOptions.dryRun = options.dryRun;
  }

  return installStarfetchSkill(installOptions);
}

async function installKnownTarget(
  commandOptions: InstallCommandOptions,
  runOptions: RunCliOptions,
): Promise<SkillInstallCommandResult> {
  if (commandOptions.target === undefined) {
    throw new Error(
      "Install requires --path or --target. Use --target codex, --target claude-code, --target cursor, or --path <dir>.",
    );
  }

  const target = parseTarget(commandOptions.target);
  const scope =
    commandOptions.scope === undefined
      ? undefined
      : parseScope(commandOptions.scope);

  const effectiveScope = scope ?? (target === "cursor" ? "project" : "user");

  if (commandOptions.projectDir !== undefined && effectiveScope !== "project") {
    throw new Error("--project-dir requires --scope project");
  }

  const installOptions: StarfetchSkillInstallTargetOptions = {
    target,
  };

  if (scope !== undefined) {
    installOptions.scope = scope;
  }
  if (commandOptions.projectDir !== undefined) {
    installOptions.projectDir = commandOptions.projectDir;
  }
  if (runOptions.cwd !== undefined) {
    installOptions.cwd = runOptions.cwd;
  }
  if (runOptions.homeDir !== undefined) {
    installOptions.homeDir = runOptions.homeDir;
  }
  if (commandOptions.dryRun !== undefined) {
    installOptions.dryRun = commandOptions.dryRun;
  }

  return {
    result: await installStarfetchSkillTarget(installOptions),
    nextStep: nextStepForTarget(target, effectiveScope),
  };
}

function parseTarget(target: string): StarfetchSkillTarget {
  switch (target) {
    case "codex":
    case "claude-code":
    case "cursor":
      return target;
    case "claude":
      return "claude-code";
    default:
      throw new Error(
        `Unsupported skill target '${target}'. Use codex, claude-code, cursor, or --path <dir>.`,
      );
  }
}

function parseScope(scope: string): StarfetchSkillScope {
  switch (scope) {
    case "user":
    case "project":
      return scope;
    default:
      throw new Error(
        `Unsupported skill scope '${scope}'. Expected user or project.`,
      );
  }
}

function formatInstallResult(install: SkillInstallCommandResult): string {
  const { result } = install;
  const heading = result.dryRun
    ? "Starfetch skill dry run"
    : "Starfetch skill installed";
  const lines = [
    heading,
    `Destination: ${result.destination}`,
    `Summary: ${formatActionSummary(result)}`,
    "Actions:",
  ];

  for (const action of result.actions) {
    const actionName =
      result.dryRun && action.kind !== "unchanged"
        ? `dry-run-${action.kind}`
        : action.kind;
    lines.push(`  ${actionName}: ${action.path}`);
  }

  lines.push(
    result.dryRun
      ? "Next: No files were written."
      : `Next: ${install.nextStep}`,
  );

  return `${lines.join("\n")}\n`;
}

function nextStepForTarget(
  target: StarfetchSkillTarget,
  scope: StarfetchSkillScope,
): string {
  if (target === "cursor") {
    return "Reload Cursor so it discovers the project rule.";
  }

  if (scope === "project") {
    return "Commit the skill directory if you want it shared with the project.";
  }

  return "Restart or reload the agent so it discovers the skill.";
}

function formatActionSummary(result: {
  dryRun: boolean;
  actions: StarfetchSkillAction[];
}): string {
  const createCount = countActions(result.actions, "create");
  const updateCount = countActions(result.actions, "update");
  const unchangedCount = countActions(result.actions, "unchanged");

  return [
    formatChangedCount(createCount, result.dryRun ? "would create" : "created"),
    formatChangedCount(updateCount, result.dryRun ? "would update" : "updated"),
    formatUnchangedCount(unchangedCount),
  ].join(", ");
}

function countActions(
  actions: StarfetchSkillAction[],
  kind: StarfetchSkillAction["kind"],
): number {
  return actions.filter((action) => action.kind === kind).length;
}

function formatChangedCount(count: number, verb: string): string {
  return `${verb} ${count} ${count === 1 ? "file" : "files"}`;
}

function formatUnchangedCount(count: number): string {
  return `${count} unchanged`;
}

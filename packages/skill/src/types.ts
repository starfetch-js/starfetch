/** Known local agent targets supported by the Starfetch skill installer. */
export type StarfetchSkillTarget = "codex" | "claude-code" | "cursor";
/** Install scope for targets that support user and project locations. */
export type StarfetchSkillScope = "user" | "project";
/** Planned or completed file action kind for a skill install. */
export type StarfetchSkillActionKind = "create" | "update" | "unchanged";

/** File included in the packaged Starfetch skill bundle. */
export type StarfetchSkillFile = {
  /** Skill-relative POSIX path such as `SKILL.md`. */
  relativePath: string;
  /** UTF-8 file contents. */
  contents: string;
};

/** File action reported by skill install and dry-run operations. */
export type StarfetchSkillAction = {
  /** Whether the file was or would be created, updated, or left unchanged. */
  kind: StarfetchSkillActionKind;
  /** Absolute destination path for the file. */
  path: string;
};

/** Result of installing or dry-running a Starfetch skill install. */
export type StarfetchSkillInstallResult = {
  /** Absolute destination directory. */
  destination: string;
  /** Whether this result came from a dry run. */
  dryRun: boolean;
  /** File actions in deterministic order. */
  actions: StarfetchSkillAction[];
};

/** Common options for reading the bundled Starfetch skill. */
export type StarfetchSkillOptions = {
  /** Override source directory for tests or custom packaging. */
  sourceDir?: string;
};

/** Options for installing the skill to an exact directory. */
export type StarfetchSkillInstallPathOptions = StarfetchSkillOptions & {
  /** Exact directory where `SKILL.md` and references will be written. */
  destination: string;
  /** Report planned actions without writing files. */
  dryRun?: boolean;
};

/** Options for installing the skill to a known local agent target. */
export type StarfetchSkillInstallTargetOptions = StarfetchSkillOptions & {
  /** Known target agent. */
  target: StarfetchSkillTarget;
  /** User or project install scope; defaults depend on the target. */
  scope?: StarfetchSkillScope;
  /** Project root override for project-scope installs. */
  projectDir?: string;
  /** Directory used to discover the nearest project root. */
  cwd?: string;
  /** Home directory override for user-scope installs. */
  homeDir?: string;
  /** Report planned actions without writing files. */
  dryRun?: boolean;
};

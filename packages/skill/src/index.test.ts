import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findProjectRoot,
  installStarfetchSkill,
  installStarfetchSkillTarget,
  printStarfetchSkill,
  readStarfetchSkillFile,
  resolveStarfetchSkillTargetDestination,
} from "./index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("Starfetch skill package", () => {
  it("prints the bundled skill files for review", async () => {
    const output = await printStarfetchSkill();

    expect(output).toContain("# Starfetch Skill Bundle");
    expect(output).toContain("## SKILL.md");
    expect(output).toContain("name: starfetch");
    expect(output).toContain("## references/tap-metadata.md");
    expect(output).toContain("## references/services/gaia.md");
    expect(output).toContain("## examples/proper-motion.md");
    expect(output).toContain("```markdown");
  });

  it("installs the skill into an exact custom path", async () => {
    const root = await makeTempDir();
    const destination = join(root, "custom-agent", "starfetch");
    const result = await installStarfetchSkill({ destination });

    await expect(
      readFile(join(destination, "SKILL.md"), "utf8"),
    ).resolves.toContain("name: starfetch");
    await expect(
      readFile(join(destination, "references", "query-safety.md"), "utf8"),
    ).resolves.toContain("Do not use credentials");
    expect(result.destination).toBe(destination);
    expect(result.actions.some((action) => action.kind === "create")).toBe(
      true,
    );
  });

  it("resolves Codex user and project destinations", async () => {
    const root = await makeTempDir();
    const home = join(root, "home");
    const project = join(root, "project");
    await mkdir(join(project, ".git"), { recursive: true });

    await expect(
      resolveStarfetchSkillTargetDestination({
        target: "codex",
        homeDir: home,
      }),
    ).resolves.toBe(join(home, ".codex", "skills", "starfetch"));
    await expect(
      resolveStarfetchSkillTargetDestination({
        target: "codex",
        scope: "project",
        cwd: join(project, "nested"),
      }),
    ).resolves.toBe(join(project, ".codex", "skills", "starfetch"));
  });

  it("resolves Claude Code user and project destinations", async () => {
    const root = await makeTempDir();
    const home = join(root, "home");
    const project = join(root, "project");
    await mkdir(join(project, ".git"), { recursive: true });

    await expect(
      resolveStarfetchSkillTargetDestination({
        target: "claude-code",
        homeDir: home,
      }),
    ).resolves.toBe(join(home, ".claude", "skills", "starfetch"));
    await expect(
      resolveStarfetchSkillTargetDestination({
        target: "claude-code",
        scope: "project",
        cwd: join(project, "src"),
      }),
    ).resolves.toBe(join(project, ".claude", "skills", "starfetch"));
  });

  it("resolves Cursor to project rules by default", async () => {
    const root = await makeTempDir();
    const project = join(root, "project");
    await mkdir(join(project, ".git"), { recursive: true });

    await expect(
      resolveStarfetchSkillTargetDestination({
        target: "cursor",
        cwd: join(project, "src"),
      }),
    ).resolves.toBe(join(project, ".cursor", "rules"));
  });

  it("rejects Cursor user installs because Cursor has no stable filesystem path", async () => {
    const root = await makeTempDir();

    await expect(
      resolveStarfetchSkillTargetDestination({
        target: "cursor",
        scope: "user",
        homeDir: root,
      }),
    ).rejects.toThrow("Cursor user rules do not have a stable filesystem");
  });

  it("uses --project-dir as an explicit project destination root", async () => {
    const root = await makeTempDir();
    const projectDir = join(root, "manual-root");

    await expect(
      resolveStarfetchSkillTargetDestination({
        target: "codex",
        scope: "project",
        cwd: root,
        projectDir,
      }),
    ).resolves.toBe(join(projectDir, ".codex", "skills", "starfetch"));
  });

  it("falls back to the current directory when no git root exists", async () => {
    const root = await makeTempDir();

    await expect(findProjectRoot(root)).resolves.toBe(root);
  });

  it("supports dry-run without creating files", async () => {
    const root = await makeTempDir();
    const destination = join(root, "dry-run", "starfetch");
    const result = await installStarfetchSkill({ destination, dryRun: true });

    await expect(
      readFile(join(destination, "SKILL.md"), "utf8"),
    ).rejects.toThrow();
    expect(result.dryRun).toBe(true);
    expect(result.actions.every((action) => action.kind === "create")).toBe(
      true,
    );
  });

  it("merges into existing directories without removing user files", async () => {
    const root = await makeTempDir();
    const destination = join(root, "existing");
    const userFile = join(destination, "notes.md");
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "SKILL.md"), "old skill");
    await writeFile(userFile, "keep me");

    const result = await installStarfetchSkill({ destination });

    await expect(
      readFile(join(destination, "SKILL.md"), "utf8"),
    ).resolves.toContain("name: starfetch");
    await expect(readFile(userFile, "utf8")).resolves.toBe("keep me");
    expect(result.actions.some((action) => action.kind === "update")).toBe(
      true,
    );
  });

  it("fails before writing when a directory blocks a packaged file", async () => {
    const root = await makeTempDir();
    const destination = join(root, "blocked");
    await mkdir(join(destination, "references", "tap-metadata.md"), {
      recursive: true,
    });

    await expect(installStarfetchSkill({ destination })).rejects.toThrow(
      "Cannot replace directory with skill file",
    );
    await expect(
      readFile(join(destination, "SKILL.md"), "utf8"),
    ).rejects.toThrow();
  });

  it("fails when required bundled assets are missing", async () => {
    const root = await makeTempDir();
    const sourceDir = join(root, "source");
    await mkdir(sourceDir, { recursive: true });

    await expect(printStarfetchSkill({ sourceDir })).rejects.toThrow(
      "Missing Starfetch skill asset: SKILL.md",
    );
  });

  it("reads one requested asset without requiring the rest of the bundle", async () => {
    const root = await makeTempDir();
    const sourceDir = join(root, "partial-source");
    await mkdir(join(sourceDir, "references"), { recursive: true });
    await writeFile(join(sourceDir, "references", "adql.md"), "# Test ADQL");

    await expect(
      readStarfetchSkillFile("references/adql.md", { sourceDir }),
    ).resolves.toBe("# Test ADQL");
    await expect(
      readStarfetchSkillFile("references/tap-metadata.md", { sourceDir }),
    ).rejects.toThrow(
      "Missing Starfetch skill asset: references/tap-metadata.md",
    );
  });

  it("installs known targets through the install helper", async () => {
    const root = await makeTempDir();
    const project = join(root, "project");
    await mkdir(join(project, ".git"), { recursive: true });

    const result = await installStarfetchSkillTarget({
      target: "codex",
      scope: "project",
      cwd: project,
    });

    await expect(
      readFile(
        join(project, ".codex", "skills", "starfetch", "SKILL.md"),
        "utf8",
      ),
    ).resolves.toContain("name: starfetch");
    expect(result.destination).toBe(
      join(project, ".codex", "skills", "starfetch"),
    );
  });

  it("installs Cursor as a project rule file", async () => {
    const root = await makeTempDir();
    const project = join(root, "project");
    await mkdir(join(project, ".git"), { recursive: true });

    const result = await installStarfetchSkillTarget({
      target: "cursor",
      cwd: project,
    });

    await expect(
      readFile(join(project, ".cursor", "rules", "starfetch.mdc"), "utf8"),
    ).resolves.toContain("Use Starfetch for metadata-first TAP/ADQL");
    await expect(
      readFile(join(project, ".cursor", "rules", "starfetch.mdc"), "utf8"),
    ).resolves.not.toContain("name: starfetch");
    expect(result.destination).toBe(join(project, ".cursor", "rules"));
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "starfetch-skill-test-"));
  tempDirs.push(dir);
  return dir;
}

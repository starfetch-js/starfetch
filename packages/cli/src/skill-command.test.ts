import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createStringWriter } from "../test/string-writer.js";
import { runCli } from "./index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("starfetch skill", () => {
  it("prints the bundled skill files", async () => {
    const stdout = createStringWriter();

    expect(await runCli(["skill", "print"], { stdout: stdout.writer })).toBe(0);
    expect(stdout.text()).toContain("# Starfetch Skill Bundle");
    expect(stdout.text()).toContain("## SKILL.md");
    expect(stdout.text()).toContain("## references/tap-metadata.md");
    expect(stdout.text()).toContain("## examples/proper-motion.md");
  });

  it("shows install examples in help", async () => {
    const stdout = createStringWriter();

    expect(
      await runCli(["skill", "install", "--help"], { stdout: stdout.writer }),
    ).toBe(0);
    expect(stdout.text()).toContain("starfetch skill install --target cursor");
    expect(stdout.text()).toContain("exact directory where SKILL.md");
  });

  it("installs into a custom final skill directory", async () => {
    const root = await makeTempDir();
    const destination = join(root, "cursor-skills", "starfetch");
    const stdout = createStringWriter();

    expect(
      await runCli(["skill", "install", "--path", destination], {
        stdout: stdout.writer,
      }),
    ).toBe(0);

    await expect(
      readFile(join(destination, "SKILL.md"), "utf8"),
    ).resolves.toContain("name: starfetch");
    expect(stdout.text()).toContain("Starfetch skill installed");
    expect(stdout.text()).toContain("Summary:");
    expect(stdout.text()).toContain(destination);
    expect(stdout.text()).toContain("Point your agent at this skill directory");
  });

  it("installs Codex user scope by default", async () => {
    const root = await makeTempDir();
    const stdout = createStringWriter();

    expect(
      await runCli(["skill", "install", "--target", "codex"], {
        stdout: stdout.writer,
        homeDir: root,
      }),
    ).toBe(0);

    await expect(
      readFile(join(root, ".codex", "skills", "starfetch", "SKILL.md"), "utf8"),
    ).resolves.toContain("name: starfetch");
  });

  it("installs known targets into a project git root", async () => {
    const root = await makeTempDir();
    const project = join(root, "project");
    const nested = join(project, "src", "deep");
    await mkdir(join(project, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });
    const stdout = createStringWriter();

    expect(
      await runCli(
        ["skill", "install", "--target", "claude-code", "--scope", "project"],
        {
          stdout: stdout.writer,
          cwd: nested,
        },
      ),
    ).toBe(0);

    await expect(
      readFile(
        join(project, ".claude", "skills", "starfetch", "SKILL.md"),
        "utf8",
      ),
    ).resolves.toContain("name: starfetch");
  });

  it("installs Cursor into project rules by default", async () => {
    const root = await makeTempDir();
    const project = join(root, "project");
    const nested = join(project, "src", "deep");
    await mkdir(join(project, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });
    const stdout = createStringWriter();

    expect(
      await runCli(["skill", "install", "--target", "cursor"], {
        stdout: stdout.writer,
        cwd: nested,
      }),
    ).toBe(0);

    await expect(
      readFile(join(project, ".cursor", "rules", "starfetch.mdc"), "utf8"),
    ).resolves.toContain("Use Starfetch for metadata-first TAP/ADQL");
    expect(stdout.text()).toContain("Reload Cursor");
  });

  it("supports dry-run without writing files", async () => {
    const root = await makeTempDir();
    const destination = join(root, "manual", "starfetch");
    const stdout = createStringWriter();

    expect(
      await runCli(["skill", "install", "--path", destination, "--dry-run"], {
        stdout: stdout.writer,
      }),
    ).toBe(0);

    await expect(
      readFile(join(destination, "SKILL.md"), "utf8"),
    ).rejects.toThrow();
    expect(stdout.text()).toContain("Starfetch skill dry run");
    expect(stdout.text()).toContain("Summary: would create");
    expect(stdout.text()).toContain("dry-run-create");
    expect(stdout.text()).toContain("Next: No files were written.");
  });

  it("rejects conflicting install options", async () => {
    const stderr = createStringWriter();

    expect(
      await runCli(
        [
          "skill",
          "install",
          "--path",
          "/tmp/starfetch-skill",
          "--target",
          "codex",
        ],
        { stderr: stderr.writer },
      ),
    ).toBe(1);
    expect(stderr.text()).toContain("--path cannot be used with --target");
  });

  it.each([
    [
      ["skill", "install", "--path", "/tmp/starfetch-skill", "--scope", "user"],
      "--path cannot be used with --scope",
    ],
    [
      [
        "skill",
        "install",
        "--path",
        "/tmp/starfetch-skill",
        "--project-dir",
        "/tmp/project",
      ],
      "--path cannot be used with --project-dir",
    ],
    [["skill", "install"], "Install requires --path or --target"],
    [
      ["skill", "install", "--target", "codex", "--scope", "workspace"],
      "Unsupported skill scope 'workspace'",
    ],
    [
      [
        "skill",
        "install",
        "--target",
        "codex",
        "--project-dir",
        "/tmp/project",
      ],
      "--project-dir requires --scope project",
    ],
  ])("rejects invalid install option combinations", async (args, message) => {
    const stderr = createStringWriter();

    expect(await runCli(args, { stderr: stderr.writer })).toBe(1);
    expect(stderr.text()).toContain(message);
  });

  it("accepts claude as an alias for the Claude Code target", async () => {
    const root = await makeTempDir();
    const stdout = createStringWriter();

    expect(
      await runCli(["skill", "install", "--target", "claude", "--dry-run"], {
        stdout: stdout.writer,
        homeDir: root,
      }),
    ).toBe(0);
    expect(stdout.text()).toContain(
      join(root, ".claude", "skills", "starfetch"),
    );
    expect(stdout.text()).toContain("dry-run-create");
  });

  it("prints a clear error for unsupported targets", async () => {
    const stderr = createStringWriter();

    expect(
      await runCli(["skill", "install", "--target", "windsurf"], {
        stderr: stderr.writer,
      }),
    ).toBe(1);
    expect(stderr.text()).toContain("Unsupported skill target 'windsurf'");
    expect(stderr.text()).toContain("--path <dir>");
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "starfetch-cli-skill-test-"));
  tempDirs.push(dir);
  return dir;
}

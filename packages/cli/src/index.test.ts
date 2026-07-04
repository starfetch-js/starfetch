import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { helpText, isCliEntrypoint, runCli } from "./index.js";
import { createStringWriter } from "../test/string-writer.js";

describe("starfetch CLI", () => {
  it("prints help for --help", async () => {
    const stdout = createStringWriter();

    expect(helpText()).toContain("tap");
    expect(helpText()).toContain("skill");
    expect(await runCli(["--help"], { stdout: stdout.writer })).toBe(0);
    expect(stdout.text()).toContain("tap");
    expect(stdout.text()).toContain("skill");
  });

  it("returns a usage error for unsupported commands", async () => {
    const stderr = createStringWriter();

    expect(await runCli(["tap", "unknown"], { stderr: stderr.writer })).toBe(1);
    expect(stderr.text()).toContain("unknown command 'unknown'");
  });

  it("recognizes npm bin symlinks as the CLI entrypoint", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "starfetch-cli-"));
    const entrypoint = join(tempDir, "dist-index.js");
    const symlink = join(tempDir, "starfetch");

    writeFileSync(entrypoint, "");
    symlinkSync(entrypoint, symlink);

    expect(isCliEntrypoint(pathToFileURL(entrypoint).href, symlink)).toBe(true);
  });
});

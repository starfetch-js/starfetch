import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { readStarfetchSkillFile, starfetchSkillPaths } from "./index.js";

const packageRoot = new URL("../", import.meta.url);
const skillRoot = new URL("skill/starfetch/", packageRoot);

describe("Starfetch skill assets", () => {
  it("packages a valid Starfetch SKILL.md with required frontmatter", async () => {
    const skill = await readFile(new URL("SKILL.md", skillRoot), "utf8");

    expect(skill).toMatch(/^---\n[\s\S]+?\n---\n/);
    expect(skill).toContain("name: starfetch");
    expect(skill).toContain("description:");
    expect(skill).toContain("references/tap-metadata.md");
    expect(skill).toContain("references/adql.md");
    expect(skill).toContain("references/query-safety.md");
    expect(skill).toContain("references/services/");
    expect(skill).toContain("examples/");
  });

  it("reads every canonical guidance file through the package interface", async () => {
    for (const relativePath of starfetchSkillPaths) {
      const contents = await readStarfetchSkillFile(relativePath);
      expect(contents.trim().length).toBeGreaterThan(0);
    }
  });
});

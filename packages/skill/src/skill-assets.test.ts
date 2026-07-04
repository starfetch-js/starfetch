import { readFile, stat } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const packageRoot = new URL("../", import.meta.url);
const skillRoot = new URL("skill/starfetch/", packageRoot);
const requiredReferences = [
  "tap-workflow.md",
  "adql-patterns.md",
  "public-service-etiquette.md",
  "output-formats.md",
  "safety.md",
];

describe("Starfetch skill assets", () => {
  it("packages a valid Starfetch SKILL.md with required frontmatter", async () => {
    const skill = await readFile(new URL("SKILL.md", skillRoot), "utf8");

    expect(skill).toMatch(/^---\n[\s\S]+?\n---\n/);
    expect(skill).toContain("name: starfetch");
    expect(skill).toContain("description:");
    for (const fileName of requiredReferences) {
      expect(skill).toContain(`references/${fileName}`);
    }
  });

  it("packages all referenced guidance files", async () => {
    for (const fileName of requiredReferences) {
      const file = new URL(`references/${fileName}`, skillRoot);
      const fileStat = await stat(file);
      const contents = await readFile(file, "utf8");

      expect(fileStat.isFile()).toBe(true);
      expect(contents.trim().length).toBeGreaterThan(0);
    }
  });
});

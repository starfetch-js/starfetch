import { readStarfetchSkillFiles } from "./assets.js";
import type { StarfetchSkillFile, StarfetchSkillOptions } from "./types.js";

export async function buildCursorRuleFiles(
  options: StarfetchSkillOptions,
): Promise<StarfetchSkillFile[]> {
  const files = await readStarfetchSkillFiles(options);
  const sections = files.map((file) =>
    [`# ${file.relativePath}`, cursorRuleContent(file)].join("\n\n"),
  );

  return [
    {
      relativePath: "starfetch.mdc",
      contents: [
        "---",
        "description: Use Starfetch for metadata-first TAP/ADQL astronomy workflows.",
        "alwaysApply: false",
        "---",
        "",
        "# Starfetch",
        "",
        "Use this rule when working with public astronomical TAP services through Starfetch.",
        "",
        ...sections,
        "",
      ].join("\n"),
    },
  ];
}

function cursorRuleContent(file: StarfetchSkillFile): string {
  if (file.relativePath !== "SKILL.md") {
    return file.contents.trimEnd();
  }

  return file.contents.replace(/^---\n[\s\S]*?\n---\n+/, "").trimEnd();
}

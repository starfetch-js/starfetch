import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { isMcpEntrypoint } from "./index.js";

describe("Starfetch MCP entrypoint", () => {
  it("recognizes npm bin symlinks as the stdio server entrypoint", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "starfetch-mcp-"));
    const entrypoint = join(tempDir, "dist-index.js");
    const symlink = join(tempDir, "starfetch-mcp");

    writeFileSync(entrypoint, "");
    symlinkSync(entrypoint, symlink);

    expect(isMcpEntrypoint(pathToFileURL(entrypoint).href, symlink)).toBe(true);
  });
});

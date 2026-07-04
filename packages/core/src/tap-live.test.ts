import { describe, expect, it } from "vitest";

import { tap } from "./index.js";

const describeLiveTap =
  process.env.STARFETCH_LIVE_TAP === "1" ? describe : describe.skip;

const liveClient = tap("gaia");
const liveTarget = `gaia (${liveClient.target.baseUrl})`;

describeLiveTap("live TAP integration", () => {
  it("reads real Gaia TAP capabilities", async () => {
    const capabilities = await runLiveTapStep("capabilities", (signal) =>
      liveClient.capabilities({ signal }),
    );

    expect(
      capabilities.languages.some(
        (language) => language.toUpperCase() === "ADQL",
      ),
    ).toBe(true);
    expect(["anonymous", "mixed"]).toContain(capabilities.auth);
  }, 30000);

  it("runs a tiny bounded Gaia TAP sync query", async () => {
    const result = await runLiveTapStep("sync query", (signal) =>
      liveClient.query("SELECT TOP 1 table_name FROM TAP_SCHEMA.tables", {
        format: "votable",
        maxrec: 1,
        signal,
      }),
    );
    const rows = await runLiveTapStep("sync result parse", () => result.json());

    expect(result.format).toBe("votable");
    expect(rows.length).toBeGreaterThan(0);
    expect(
      Object.keys(rows[0] ?? {}).some(
        (key) => key.toLowerCase() === "table_name",
      ),
    ).toBe(true);
  }, 30000);
});

async function runLiveTapStep<T>(
  step: string,
  action: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    return await action(controller.signal);
  } catch (error) {
    throw new Error(
      `Live TAP ${step} failed for ${liveTarget}: ${formatLiveTapError(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function formatLiveTapError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "request timed out after 20000ms";
    }

    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

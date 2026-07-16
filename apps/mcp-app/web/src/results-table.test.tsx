import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StarfetchTableViewV1 } from "../../src/presentation-contract.js";
import { StarfetchHostSession, type StarfetchHostBridge } from "./host-ui.js";
import { ResultsTable } from "./results-table.js";

afterEach(cleanup);

describe("ResultsTable", () => {
  it("renders every bounded result through a virtualized inline viewport", () => {
    render(<ResultsTable host={createHost()} view={createQueryView(100)} />);

    expect(
      screen.getByRole("heading", { name: "Gaia source results" }),
    ).toBeTruthy();
    expect(screen.getAllByText("ESA Gaia Archive")).toHaveLength(2);
    expect(screen.getByText("100 source rows")).toBeTruthy();
    expect(screen.queryByText(/rows shown/)).toBeNull();

    const table = screen.getByRole("table", { name: "Gaia source results" });
    expect(table.parentElement?.dataset.virtualized).toBe("true");
    expect(within(table).getAllByRole("row").length).toBeLessThan(101);
    expect(
      within(table).getByRole("button", {
        name: "Sort Source ID ascending",
      }),
    ).toBeTruthy();
    expect(screen.getByText("long · meta.id;meta.main")).toBeTruthy();
    expect(screen.queryByText("source-99")).toBeNull();
  });

  it("sorts without changing exact values and copies the sorted bounded rows", async () => {
    const user = userEvent.setup();
    const writeClipboard = vi.fn<(value: string) => Promise<void>>();
    const view = createQueryView(12);
    view.rows.reverse();
    render(<ResultsTable host={createHost({ writeClipboard })} view={view} />);

    await user.click(
      screen.getByRole("button", { name: "Sort Source ID ascending" }),
    );
    const table = screen.getByRole("table", { name: "Gaia source results" });
    expect(within(table).getAllByRole("row")[1]?.textContent).toContain(
      "source-01",
    );

    await user.click(screen.getByRole("button", { name: "Copy data" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy as TSV" }));
    expect(writeClipboard).toHaveBeenCalledWith(
      expect.stringMatching(
        /^source_id\tra\nsource-01\t50[\s\S]*source-12\t51\.1$/,
      ),
    );
    expect(screen.getByRole("status").textContent).toBe("Copied TSV.");
  });

  it("sorts scientific numeric strings numerically with missing values last", async () => {
    const user = userEvent.setup();
    const view = createQueryView(3);
    view.rows = [
      { ra: "10", source_id: "source-10" },
      { ra: null, source_id: "source-null" },
      { ra: "2", source_id: "source-02" },
    ];
    render(<ResultsTable host={createHost()} view={view} />);

    await user.click(
      screen.getByRole("button", {
        name: "Sort Right ascension ascending",
      }),
    );

    const rows = within(
      screen.getByRole("table", { name: "Gaia source results" }),
    ).getAllByRole("row");
    expect(rows[1]?.textContent).toContain("source-02");
    expect(rows[2]?.textContent).toContain("source-10");
    expect(rows[3]?.textContent).toContain("source-null");
  });

  it("exports null as an empty CSV field and quotes special characters", async () => {
    const user = userEvent.setup();
    const writeClipboard = vi.fn<(value: string) => Promise<void>>();
    const view = createQueryView(1);
    view.rows = [{ ra: null, source_id: 'source,"one"' }];
    render(<ResultsTable host={createHost({ writeClipboard })} view={view} />);

    await user.click(screen.getByRole("button", { name: "Copy data" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy as CSV" }));

    expect(writeClipboard).toHaveBeenCalledWith(
      'source_id,ra\n"source,""one""",',
    );
  });

  it("copies the bounded rows as JSON", async () => {
    const user = userEvent.setup();
    const writeClipboard = vi.fn<(value: string) => Promise<void>>();
    render(
      <ResultsTable
        host={createHost({ writeClipboard })}
        view={createQueryView(1)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy data" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy as JSON" }));

    expect(writeClipboard).toHaveBeenCalledWith(
      '[\n  {\n    "source_id": "source-01",\n    "ra": "50"\n  }\n]',
    );
  });

  it("downloads the selected table format with matching file metadata", async () => {
    const user = userEvent.setup();
    const downloadFile = vi
      .fn<StarfetchHostBridge["downloadFile"]>()
      .mockResolvedValue({});
    render(
      <ResultsTable
        host={createHost({
          capabilities: { downloadFile: {} },
          downloadFile,
        })}
        view={createQueryView(1)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Download data" }));
    await user.click(screen.getByRole("menuitem", { name: "Download TSV" }));

    expect(downloadFile).toHaveBeenCalledWith({
      contents: [
        {
          type: "resource",
          resource: {
            mimeType: "text/tab-separated-values",
            text: "source_id\tra\nsource-01\t50",
            uri: "file:///starfetch-results.tsv",
          },
        },
      ],
    });
  });

  it("separates copy and download controls", async () => {
    const user = userEvent.setup();
    render(
      <ResultsTable
        host={createHost({
          context: {
            availableDisplayModes: ["inline", "fullscreen"],
            displayMode: "inline",
          },
        })}
        view={createQueryView(1)}
      />,
    );

    expect(screen.getByRole("button", { name: "Copy data" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download data" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open fullscreen" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Copy data" }));

    expect(screen.getByRole("menu", { name: "Copy data" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Copy as TSV" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Copy as CSV" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Copy as JSON" })).toBeTruthy();
  });

  it("shows more and less rows through table controls below the table", async () => {
    const user = userEvent.setup();
    const requestDisplayMode = vi.fn(
      async (mode: "inline" | "fullscreen") => mode,
    );
    render(
      <ResultsTable
        host={createHost({
          context: {
            availableDisplayModes: ["inline", "fullscreen"],
            displayMode: "inline",
          },
          requestDisplayMode,
        })}
        view={createQueryView(1)}
      />,
    );

    const displayControls = screen.getByRole("group", {
      name: "Table display",
    });
    await user.click(
      within(displayControls).getByRole("button", { name: "Show more" }),
    );
    expect(requestDisplayMode).toHaveBeenCalledWith("fullscreen");

    await user.click(
      within(displayControls).getByRole("button", { name: "Show less" }),
    );
    expect(requestDisplayMode).toHaveBeenCalledWith("inline");
  });

  it("presents a completed empty result without making it look like an error", () => {
    render(<ResultsTable host={createHost()} view={createQueryView(0)} />);

    expect(
      screen.getByRole("heading", { name: "No rows returned" }),
    ).toBeTruthy();
    expect(
      screen.getByText("The TAP query completed successfully with no rows."),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("surfaces clipping and presents exact ADQL without implementation labels", async () => {
    const user = userEvent.setup();
    const writeClipboard = vi.fn<(value: string) => Promise<void>>();
    const view = createQueryView(12);
    view.clipping = {
      reasons: ["rows"],
      sourceColumns: 2,
      sourceRows: 20,
    };
    if (view.source.tool === "starfetch_tap_query") {
      view.source.overflow = true;
    }
    render(<ResultsTable host={createHost({ writeClipboard })} view={view} />);

    expect(screen.getByText("TAP overflow")).toBeTruthy();
    expect(screen.getByText("Presentation clipped")).toBeTruthy();
    expect(
      screen.getByText("12 of 20 source rows retained for display."),
    ).toBeTruthy();
    expect(screen.queryByText("Starfetch results")).toBeNull();
    expect(screen.queryByText("tap query")).toBeNull();
    expect(screen.queryByText("votable → json")).toBeNull();

    const queryPanel = screen.getByRole("region", { name: "Exact ADQL" });
    expect(
      within(queryPanel).getByText(
        "SELECT TOP 100 source_id, ra FROM gaiadr3.gaia_source",
      ),
    ).toBeTruthy();
    await user.click(
      within(queryPanel).getByRole("button", { name: "Copy ADQL" }),
    );
    expect(writeClipboard).toHaveBeenCalledWith(
      "SELECT TOP 100 source_id, ra FROM gaiadr3.gaia_source",
    );

    expect(screen.getByText("Request details")).toBeTruthy();
    expect(screen.getByText("100 rows")).toBeTruthy();
    expect(screen.getByText("VOTable")).toBeTruthy();
    expect(screen.getByText("JSON")).toBeTruthy();
    expect(screen.getByText("Unique Gaia source identifier.")).toBeTruthy();
  });

  it("keeps the complete sorted row model virtualized in fullscreen", () => {
    render(
      <ResultsTable
        host={createHost({
          context: {
            availableDisplayModes: ["inline", "fullscreen"],
            displayMode: "fullscreen",
          },
        })}
        view={createQueryView(100)}
      />,
    );

    const table = screen.getByRole("table", { name: "Gaia source results" });
    expect(table.parentElement?.dataset.virtualized).toBe("true");
    expect(within(table).getAllByRole("row").length).toBeLessThan(101);
    expect(screen.queryByText("10 of 100 rows shown")).toBeNull();
  });
});

function createHost({
  capabilities = {},
  context = { displayMode: "inline" },
  downloadFile = vi.fn(),
  requestDisplayMode = vi.fn(),
  writeClipboard = vi.fn(),
}: {
  capabilities?: NonNullable<
    ReturnType<StarfetchHostBridge["getHostCapabilities"]>
  >;
  context?: NonNullable<ReturnType<StarfetchHostBridge["getHostContext"]>>;
  downloadFile?: StarfetchHostBridge["downloadFile"];
  requestDisplayMode?: StarfetchHostBridge["requestDisplayMode"];
  writeClipboard?: (value: string) => Promise<void>;
} = {}): StarfetchHostSession {
  const bridge: StarfetchHostBridge = {
    addHostContextListener: vi.fn(),
    downloadFile,
    getHostCapabilities: () => capabilities,
    getHostContext: () => context,
    removeHostContextListener: vi.fn(),
    requestDisplayMode,
  };
  return new StarfetchHostSession(bridge, writeClipboard);
}

function createQueryView(rowCount: number): StarfetchTableViewV1 {
  return {
    clipping: {
      reasons: [],
      sourceColumns: 2,
      sourceRows: rowCount,
    },
    columns: [
      {
        datatype: "long",
        description: "Unique Gaia source identifier.",
        key: "source_id",
        label: "Source ID",
        ucd: "meta.id;meta.main",
      },
      {
        datatype: "double",
        key: "ra",
        label: "Right ascension",
        unit: "deg",
      },
    ],
    contractVersion: 1,
    resultKind: "query-rows",
    rows: Array.from({ length: rowCount }, (_, index) => ({
      ra: String(50 + index / 10),
      source_id: `source-${String(index + 1).padStart(2, "0")}`,
    })),
    source: {
      durationMs: 42,
      effectiveMaxrec: 100,
      format: "json",
      query: "SELECT TOP 100 source_id, ra FROM gaiadr3.gaia_source",
      requestFormat: "votable",
      target: {
        baseUrl: "https://gea.esac.esa.int/tap-server/tap",
        label: "ESA Gaia Archive",
        service: "gaia",
      },
      tool: "starfetch_tap_query",
    },
    state: rowCount === 0 ? "empty" : "populated",
    title: "Gaia source results",
  };
}

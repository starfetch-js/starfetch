import { describe, expect, it } from "vitest";
import { prepareTargetList, parseVotable } from "./index.js";

describe("single-column target lists", () => {
  it("retains exact long identifiers, order and duplicate references", () => {
    const id = "5853498713190525696";
    const { votable, rowCount } = prepareTargetList(
      `\uFEFFid\r\n"${id}"\r\n${id}\r\n42\r\n`,
      "long",
    );
    expect(rowCount).toBe(3);
    expect(parseVotable(votable).rows).toEqual([
      { input_row: "1", target_id: id, duplicate_of: null },
      { input_row: "2", target_id: id, duplicate_of: "1" },
      { input_row: "3", target_id: "42", duplicate_of: null },
    ]);
  });
  it("preserves quoted text and leading zeros", () => {
    const { votable } = prepareTargetList('id\n0004\n"A,&<B>"', "text");
    expect(parseVotable(votable).rows.map((row) => row.target_id)).toEqual([
      "0004",
      "A,&<B>",
    ]);
  });
  it("rejects oversized lists rather than uploading a prefix", () => {
    expect(() =>
      prepareTargetList("id\n" + "1\n".repeat(10001), "long"),
    ).toThrow("10,000");
  });
  it.each([
    "id\n001",
    "id\n1e4",
    "id\n9223372036854775808",
    "id\n-9223372036854775809",
    'id\n""',
    "id\n1,2",
    "a,b\n1,2",
    "id",
  ])("rejects an invalid integer list %s", (csv) => {
    expect(() => prepareTargetList(csv, "long")).toThrow();
  });
});

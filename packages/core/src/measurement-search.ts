/** Search archive column metadata using ADQL 2.0 LIKE predicates. */
export function measurementSearchQuery(term: string): string {
  const text = term.trim();
  if (!text) throw new Error("Specify a measurement phrase or UCD.");
  const variants = new Set([
    text,
    text.toLowerCase(),
    text.toUpperCase(),
    text.charAt(0).toUpperCase() + text.slice(1),
  ]);
  const predicates = [...variants].flatMap((value) => {
    const pattern = `'%${value.replaceAll("'", "''")}%'`;
    return ["column_name", "description", "ucd"].map(
      (column) => `${column} LIKE ${pattern}`,
    );
  });
  return [
    "SELECT table_name, column_name, unit, ucd, description",
    "FROM TAP_SCHEMA.columns",
    `WHERE ${predicates.join(" OR ")}`,
    "ORDER BY table_name, column_name",
  ].join("\n");
}

# Query safety and reporting

Public TAP services are shared infrastructure.

- Start with metadata requests and small row bounds.
- Select only needed columns; avoid broad `SELECT *` exploration.
- Prefer synchronous queries for small work and async jobs for justified larger
  work.
- Do not retry aggressively after timeouts, maintenance, or overload errors.
- Do not use credentials, cookies, tokens, or private services; Starfetch does
  not currently support authenticated TAP workflows.
- Do not write local files through MCP tools.

Keep data and diagnostics distinct. A remote failure, timeout, parse failure,
or overflow is not a zero-row result. Report the observed condition and target
service rather than making a claim about the catalog.

Every result handoff must include the selected service or URL, exact table,
exact ADQL, effective `MAXREC` and/or `TOP`, output format, and assumptions such
as coordinate frame, units, null filtering, derived quantities, and ordering.

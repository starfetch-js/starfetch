# Safety

Starfetch retrieves and inspects astronomical catalog data. It does not make an
agent a domain scientist.

Follow these limits:

- Do not use credentials, cookies, tokens, or private services unless a future
  Starfetch feature explicitly supports them.
- Do not run unbounded public archive queries.
- Do not write local result files through MCP tools.
- Do not silently choose a service when the user asked for reproducibility.
- Do not present raw catalog rows as scientific conclusions without user or
  domain context.
- Explain assumptions, including service, query, row limit, output format, and
  any filtering choices.

For remote failures, state the observed error and the target service. Avoid
guessing that the data itself is missing unless the query result proves it.

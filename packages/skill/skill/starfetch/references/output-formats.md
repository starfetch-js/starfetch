# Output Formats

Choose output formats based on the next consumer:

- `json`: best default for small structured results an agent will inspect.
- `jsonl`: useful for row-oriented streaming or line-by-line processing.
- `csv`: useful for spreadsheet-style tools and simple tabular exchange.
- `tsv`: useful when fields may contain commas.
- `votable`: use when preserving VO-native metadata matters.

Keep diagnostics separate from data. For CLI work, stdout should carry the data
and stderr should carry progress, warnings, and errors. For MCP work, prefer
structured content with diagnostics separate from result data.

If conversion is unsupported for a remote result format, report that limitation
instead of silently changing formats.

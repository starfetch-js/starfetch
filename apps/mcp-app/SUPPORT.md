# Starfetch remote MCP support

This page covers the Starfetch-operated remote MCP endpoint. For npm packages,
local MCP configuration, the CLI, or the TypeScript library, use the same issue
route and identify the affected package or command.

## General support

[Create a GitHub issue](https://github.com/starfetch-js/starfetch/issues/new)
for availability problems, unexpected remote-service errors, client or table
widget behavior, and questions about the remote-service privacy notice or
terms.

Include the affected tool, approximate time with timezone, selected public TAP
service, expected behavior, and the non-sensitive error message. Do not paste
credentials, private URLs, signed job capabilities, sensitive uploads, or
personal data into a public issue.

## Security reports

Do not disclose a vulnerability in a public issue. Use
[GitHub private vulnerability reporting](https://github.com/starfetch-js/starfetch/security/advisories/new)
so the report and follow-up remain private.

## Upstream archive problems

Starfetch does not operate Gaia, SIMBAD, VizieR, the NASA Exoplanet Archive,
IRSA, GAVO, or other TAP services. A successful Starfetch request can still be
affected by upstream maintenance, quotas, schema changes, data quality, or
service-specific policy. Contact the relevant archive when the same problem is
reproducible against its own interface.

Starfetch support cannot interpret scientific results authoritatively or alter
upstream catalog records.

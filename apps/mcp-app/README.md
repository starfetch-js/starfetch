# Starfetch remote MCP

Starfetch remote MCP runs Starfetch online so compatible AI clients and web
interfaces can use its astronomy-catalog tools without installing or launching
the npm package. Clients connect to Starfetch over HTTPS. Starfetch then sends
bounded requests to the selected public astronomy service and returns the
result to the client.

The service runs on Google Cloud in Belgium. It exists as an optional access
mode for clients that need an internet-accessible MCP endpoint or the Starfetch
table widget. It is not tied to ChatGPT, Claude, or any other client, and
availability through a particular client's directory is not guaranteed.

The remote service is not yet offered through a stable public endpoint. The
[main Starfetch guide](../../README.md) is the only source for connection and
client-compatibility instructions. It will link published client integrations
only after they are available.

## What the remote service does

The remote service provides the same metadata-first astronomy workflow as the
local MCP server, plus the interactive table widget. It has no user accounts
and does not accept archive credentials. Its fixed policy limits request size,
result size, row counts, inline uploads, redirects, concurrency, and wait time.
Queries remain visible in tool results so scientific work can be reproduced and
reviewed.

The service processes each MCP request in memory, contacts the selected public
TAP service when the tool requires network access, and returns the result to the
client. The Starfetch application does not maintain an account database or
store tool inputs and results. Google Cloud and the selected astronomy service
process limited information as described in the privacy notice.

## Policies and support

- [Privacy notice](PRIVACY.md)
- [Support](SUPPORT.md)
- [Terms of use](TERMS.md)

These documents apply only to the Starfetch-operated remote endpoint. They do
not apply to the npm packages, a locally launched Starfetch server, the CLI,
the TypeScript library, or an independent deployment.

Report ordinary problems through the repository's standard issue flow and
security vulnerabilities through GitHub's private reporting route.

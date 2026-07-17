# Starfetch remote MCP privacy notice

Effective: July 17, 2026

This notice applies to the Starfetch-operated remote MCP endpoint. That service
runs Starfetch online and accepts connections over HTTPS. It does not apply to
the npm packages, a locally launched Starfetch server, the CLI, the TypeScript
library, or an independent deployment.

## Summary

The remote service has no user accounts or application database. The Starfetch
application processes tool inputs and results in memory and does not
intentionally retain request bodies, ADQL queries, inline uploads, result rows,
remote job URLs, or signed job capabilities.

The service runs on Google Cloud Run in Belgium. Google Cloud automatically
records limited HTTP request metadata. The selected public astronomy service
also receives the information needed to perform each requested operation.

## Information processed by Starfetch

An MCP request can contain a selected TAP service, metadata request, ADQL
query, output choice, row bound, run identifier, inline VOTable upload, or
remote asynchronous-job reference. Starfetch processes those values only to
perform the requested tool call and return its result.

The application writes one structured operational log entry per HTTP request:

- method and path;
- response status;
- processing duration; and
- a request identifier.

These application logs do not contain the request body, query, upload, result,
remote job URL, or job capability.

## Infrastructure metadata and retention

The service runs on Google Cloud Run in `europe-west1` (Belgium). Cloud Run
request logs contain:

- request method and URL;
- request and response sizes;
- response status and latency;
- protocol, user agent, client IP address, and server IP address;
- trace and span identifiers; and
- timestamps plus service, revision, instance, project, and region metadata.

The request URL is the remote MCP endpoint; MCP tool arguments are carried in
the request body, which is not included in the request log.

Application and Cloud Run request logs are routed to the Google Cloud Logging
`_Default` bucket and retained for 30 days. There are no custom log sinks or
log exclusions. Google Cloud's separate `_Required` bucket retains
provider-required administrative audit logs for 400 days; those audit logs
describe changes to cloud resources rather than MCP request bodies.

Starfetch does not use cookies, advertising, behavioral analytics, or an
application analytics SDK. Cloud Run attaches operational trace identifiers to
request logs, but the application does not configure a custom trace exporter.

## Public astronomy services

For network tools, Starfetch sends the selected public TAP service only the
information needed for that operation. Depending on the tool, this can include
metadata paths, an ADQL query, `MAXREC`, output format, run identifier, inline
VOTable content, or an asynchronous-job URL.

The TAP service sees the remote service's network address and the technical
`starfetch-hosted/0.0.0` user-agent value. Starfetch does not forward the
original client IP address, client user agent, cookies, or authorization
headers.

The built-in services are operated independently by ESA, CDS, NASA/IPAC, and
GAVO. They apply their own privacy, retention, access, attribution, and dataset
terms. An asynchronous TAP service can retain a job, its query, uploads, and
results until the job is explicitly deleted or reaches that service's
destruction time. The remote `starfetch_tap_job_delete` tool requests deletion
from the remote TAP service.

## Table renderer

The interactive table receives bounded structured content from the MCP host.
It declares no external network or static-resource domains and does not send
table data to another service. It can request clipboard access so the user can
copy displayed data.

## User choices

- Do not submit credentials, private archive URLs, or sensitive personal data.
- Choose only public TAP services whose policies are acceptable for the task.
- Delete remote asynchronous jobs when they are no longer needed.
- Use a locally launched Starfetch MCP server instead of the remote service
  when local processing is preferred.

Because Starfetch has no remote-service user account or application data store,
it does not operate an account-data deletion-request workflow. Questions about
this notice may be raised through [support](SUPPORT.md) without including
sensitive information. Report security issues privately as described there.

## Changes

Material changes to remote-service data handling will be reflected in this
notice before the changed service is submitted or promoted for general use.

# Public Service Etiquette

Public TAP services are shared infrastructure. Keep agent-driven access bounded
and explicit:

- Start with small metadata calls and small row limits.
- Prefer async jobs for larger queries when the user needs them.
- Do not retry aggressively when a remote service is unavailable.
- Treat timeouts, maintenance windows, and service errors as remote-service
  conditions unless the evidence points to a Starfetch bug.
- Avoid broad all-sky or all-column queries unless the user has confirmed the
  need and the query is appropriately bounded.

When reporting results, include the TAP service and whether the query was run
through a preset or explicit URL.

---
name: tap
description: Use when working with astronomical Table Access Protocol (TAP), ADQL query submission, VOSI capabilities/availability/tables metadata, VOTable TAP results, UWS async jobs, TAP output formats, or CLI/library behavior that depends on official IVOA TAP-family protocol semantics.
---

# TAP Skill

Use this skill for TAP-family protocol work. Keep project-specific product decisions in the repo's `AGENTS.md` and planning docs; keep this skill focused on general TAP, ADQL, VOSI, VOTable, UWS, and related IVOA behavior.

## Workflow

1. Identify which protocol area the task touches: TAP resources, query parameters, VOSI metadata, VOTable results, ADQL, UWS async jobs, output formats, registry discovery, or authentication.
2. Read the relevant official spec from the index when exact protocol behavior matters.
3. Prefer implementation notes that preserve interoperability over service-specific assumptions.
4. Keep Starfetch v1 TAP/ADQL-first unless the active issue explicitly expands scope.
5. When behavior is intentionally deferred, name a concrete follow-up instead of leaving the gap implicit.

## Spec Index

Use official IVOA documents rather than vendoring large specs locally.

- TAP latest: https://ivoa.net/documents/TAP/
- TAP 1.1 recommendation: https://ivoa.net/documents/TAP/20190927/REC-TAP-1.1.html
- VOSI latest: https://ivoa.net/documents/VOSI/
- VOTable latest: https://ivoa.net/documents/VOTable/
- ADQL latest: https://ivoa.net/documents/ADQL/
- UWS latest: https://ivoa.net/documents/UWS/
- DALI latest: https://ivoa.net/documents/DALI/
- TAPRegExt latest: https://ivoa.net/documents/TAPRegExt/
- RegTAP latest: https://ivoa.net/documents/RegTAP/

When a task depends on a precise requirement, use the versioned recommendation linked from the official "latest" page and cite the exact source in the response or implementation note.

## TAP Checklist

For TAP query execution:

- resolve the TAP base URL before building child resources;
- use `/sync` for synchronous queries and `/async` for UWS jobs;
- default `LANG=ADQL`;
- send query text as `QUERY`;
- prefer `RESPONSEFORMAT` for requested output;
- avoid obsolete TAP 1.0-era request patterns unless compatibility handling is explicitly needed;
- treat VOTable as the baseline result format.

For TAP parameters:

- distinguish ADQL row limits such as `TOP` from TAP service parameters such as `MAXREC`;
- keep advanced parameters such as `UPLOAD`, `RUNID`, and service limits explicit;
- avoid pretending to parse ADQL unless the task is specifically about an ADQL parser or query builder.

## VOSI Checklist

Use VOSI for service discovery and metadata:

- `/capabilities` for interfaces, languages, output formats, limits, and security methods;
- `/availability` for availability state and messages;
- `/tables` for schemas, tables, and columns where provided.

Capabilities and availability are expected to be anonymously discoverable in TAP 1.1. If capabilities advertise only authenticated query interfaces and the product does not support auth yet, fail clearly instead of attempting an unsupported login flow.

## VOTable Checklist

For v1-style TAP clients, parse only what is needed before expanding:

- FIELD metadata for column names, datatypes, units, UCDs, UTypes, and descriptions;
- TABLEDATA rows for portable text/XML conversion;
- INFO elements for success, errors, and overflow;
- malformed XML and malformed VOTable errors.

Treat BINARY, BINARY2, and FITS row decoding as separate follow-up work unless the active task explicitly implements them. Raw pass-through is acceptable when conversion is unavailable and the caller requested raw output.

## UWS Async Checklist

For TAP async jobs:

- create jobs through `/async`;
- read job URLs from redirects or service response metadata;
- start jobs with `PHASE=RUN` when required;
- read phase, result links, error links, destruction time, and messages from the job document;
- fetch the primary TAP result from `/results/result` when available;
- delete jobs through UWS cleanup behavior when requested.

Do not hide long-running polling, backoff, or daemon behavior inside simple submit/fetch methods unless the task explicitly designs that ergonomic layer.

## Output Behavior

Keep diagnostics separate from data for CLI work. Prefer stdout for data and stderr for progress, warnings, and errors.

Common output names:

- `votable`: raw or minimally processed VOTable XML;
- `csv`: comma-separated tabular data;
- `tsv`: tab-separated tabular data;
- `json`: structured JSON when conversion is safe;
- `jsonl`: one JSON object per row when conversion is safe;
- `text`: human-readable summaries.

When conversion is not safe, fail with an explicit unsupported-format error instead of silently changing the requested format.

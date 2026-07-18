# Starfetch remote MCP terms of use

Effective: July 17, 2026

These terms apply to the Starfetch-operated remote MCP endpoint. That service
runs Starfetch online and accepts connections over HTTPS. These terms do not
apply to the npm packages, a locally launched Starfetch server, the CLI, the
TypeScript library, or an independent deployment.

The remote service is operated by [Ma1kovich](https://github.com/Ma1kovich).

By using the remote service, you agree to these terms.

## Service

The remote service provides a bounded MCP interface to public astronomy Table
Access Protocol services. It can inspect public metadata, submit ADQL queries
and inline VOTable uploads, manage remote asynchronous jobs, return catalog
results, and render bounded results in an interactive table.

The service has no user accounts, paid subscription, or service-level
agreement. Limits and supported tools can change to protect availability,
security, upstream archives, or scientific reproducibility.

## Acceptable use

You must:

- use the service only with public, credential-free TAP endpoints;
- keep queries and uploads lawful, bounded, and appropriate for the selected
  archive;
- follow the selected archive's access, attribution, citation, and dataset
  terms;
- avoid attempts to bypass limits, probe private networks, disrupt the
  service, or impose unreasonable load on Starfetch or an upstream archive;
  and
- avoid submitting credentials, private data, malicious content, or sensitive
  personal information.

Access can be limited or disabled to protect the service or an upstream
operator.

## Third-party services and data

Starfetch does not operate or control the public TAP services it queries. Those
services determine their own availability, retention, licenses, attribution,
and acceptable-use rules. Catalog records can incorporate data from additional
publishers with dataset-specific citations or restrictions.

Relevant starting points include:

- [Gaia data credits and license](https://www.cosmos.esa.int/web/gaia-users/archive)
- [SIMBAD service and acknowledgment](https://simbad.cds.unistra.fr/simbad/)
- [VizieR citation and usage links](https://vizier.cds.unistra.fr/)
- [NASA Exoplanet Archive acknowledgment](https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html)
- [IRSA acknowledgment](https://irsa.ipac.caltech.edu/ack.html)
- [GAVO TAP service information](https://dc.g-vo.org/__system__/tap/run)

These links are not a substitute for checking the selected table or dataset's
own documentation. Starfetch does not grant rights to third-party data.

## Asynchronous jobs

An asynchronous tool call creates a job at the selected TAP service. The
opaque remote-service job capability authorizes only operations for that job.
It has no time-based expiry; it remains usable while the remote job exists and
the service signing secret remains unchanged. Treat it as sensitive and delete
the remote job when it is no longer required.

## Results and scientific use

Starfetch exposes live service metadata, submitted ADQL, bounds, and diagnostic
information to support reproducibility. It does not validate astrophysical
interpretations, guarantee catalog accuracy, reconcile conflicting sources,
or replace citation of the archive and original dataset.

You are responsible for reviewing queries, units, assumptions, upstream
documentation, and scientific conclusions.

## Availability and warranties

The remote service and its outputs are provided on an "as is" and "as
available" basis. To the extent permitted by applicable law, no warranty is
made that the service will be uninterrupted, error-free, suitable for a
particular purpose, or that upstream data will be complete or accurate.

The service can be changed, suspended, or discontinued without a guaranteed
notice period. Where practical, material policy changes will be documented in
the public remote-service pages.

## Support

See [support](SUPPORT.md) for public support, private privacy inquiries, and
private security reporting routes.

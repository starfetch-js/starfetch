import { executeTapSyncQuery, type QueryOptions } from "./sync-query.js";
import { resolveTapTarget } from "./target-resolver.js";

/** Default RegTAP service used for TAP endpoint discovery. */
export const defaultRegistryUrl = "https://dc.g-vo.org/tap";

/** Options for creating a VO registry discovery client. */
export type TapRegistryOptions = {
  /** RegTAP TAP service URL; defaults to {@link defaultRegistryUrl}. */
  registryUrl?: string;
  /** Custom fetch implementation for tests or non-default runtimes. */
  fetch?: typeof fetch;
};

/** Options for searching TAP services through RegTAP. */
export type TapRegistrySearchOptions = {
  /** Case-insensitive text matched against title, description, or IVOID. */
  query?: string;
  /** TAP `MAXREC` bound for registry search results. */
  maxrec?: number;
  /** Abort signal for the registry TAP request. */
  signal?: AbortSignal;
};

/** TAP service candidate returned by registry discovery. */
export type TapRegistryService = {
  /** Registry resource identifier. */
  ivoid: string;
  /** Registry resource title. */
  title: string;
  /** TAP endpoint URL suitable for `tap({ url })`. */
  accessUrl: string;
  /** TAP standard identifier advertised for the capability. */
  standardId: string;
  /** Short registry name, when advertised. */
  shortName?: string;
  /** Registry resource description, when advertised. */
  description?: string;
};

/** Client for discovering TAP service endpoints through a RegTAP service. */
export type TapRegistryClient = {
  /**
   * Search TAP endpoint candidates.
   *
   * @param options - Search text, result bound, and abort signal.
   * @returns Matching TAP service candidates.
   */
  searchTapServices(
    options?: TapRegistrySearchOptions,
  ): Promise<TapRegistryService[]>;
};

type RegtapServiceRow = {
  ivoid?: unknown;
  res_title?: unknown;
  short_name?: unknown;
  res_description?: unknown;
  access_url?: unknown;
  standard_id?: unknown;
};

type RegistryQueryOptions = QueryOptions & {
  fetch?: typeof fetch;
};

/**
 * Create a RegTAP-backed TAP service discovery client.
 *
 * @example
 * ```ts
 * import { registry, tap } from "@starfetch-js/core";
 *
 * const services = await registry().searchTapServices({
 *   query: "gaia",
 *   maxrec: 1,
 * });
 * const service = services[0];
 *
 * if (service !== undefined) {
 *   const client = tap({ url: service.accessUrl });
 *   console.log(await client.availability());
 * }
 * ```
 */
export function registry(options: TapRegistryOptions = {}): TapRegistryClient {
  const target = resolveTapTarget({
    url: options.registryUrl ?? defaultRegistryUrl,
  });

  return {
    async searchTapServices(searchOptions = {}) {
      const queryOptions = createRegistryQueryOptions(searchOptions, options);
      const result = await executeTapSyncQuery(
        target,
        buildTapServiceSearchQuery(searchOptions.query),
        queryOptions,
      );
      const services: TapRegistryService[] = [];

      for await (const row of result.rows()) {
        const service = mapRegistryService(row as RegtapServiceRow);

        if (service !== undefined) {
          services.push(service);
        }
      }

      return services;
    },
  };
}

function createRegistryQueryOptions(
  searchOptions: TapRegistrySearchOptions,
  registryOptions: TapRegistryOptions,
): RegistryQueryOptions {
  const queryOptions: RegistryQueryOptions = {
    format: "votable",
  };

  if (registryOptions.fetch !== undefined) {
    queryOptions.fetch = registryOptions.fetch;
  }

  if (searchOptions.maxrec !== undefined) {
    queryOptions.maxrec = searchOptions.maxrec;
  }

  if (searchOptions.signal !== undefined) {
    queryOptions.signal = searchOptions.signal;
  }

  return queryOptions;
}

function buildTapServiceSearchQuery(query: string | undefined): string {
  const filters = [
    "standard_id LIKE 'ivo://ivoa.net/std/tap%'",
    "intf_type='vs:paramhttp'",
    "intf_role='std'",
  ];
  const normalizedQuery = query?.trim();

  if (normalizedQuery !== undefined && normalizedQuery.length > 0) {
    const pattern = escapeAdqlStringLiteral(`%${normalizedQuery}%`);
    filters.push(
      [
        `ivo_nocasematch(res_title, '${pattern}')=1`,
        `ivo_nocasematch(res_description, '${pattern}')=1`,
        `ivo_nocasematch(ivoid, '${pattern}')=1`,
      ].join(" OR "),
    );
  }

  return [
    "SELECT ivoid, res_title, short_name, res_description, access_url, standard_id",
    "FROM rr.resource",
    "NATURAL JOIN rr.capability",
    "NATURAL JOIN rr.interface",
    `WHERE ${filters.map((filter) => `(${filter})`).join(" AND ")}`,
    "ORDER BY res_title",
  ].join("\n");
}

function mapRegistryService(
  row: RegtapServiceRow,
): TapRegistryService | undefined {
  const ivoid = stringValue(row.ivoid);
  const title = stringValue(row.res_title);
  const accessUrl = stringValue(row.access_url);
  const standardId = stringValue(row.standard_id);

  if (
    ivoid === undefined ||
    title === undefined ||
    accessUrl === undefined ||
    standardId === undefined
  ) {
    return undefined;
  }

  const service: TapRegistryService = {
    accessUrl,
    ivoid,
    standardId,
    title,
  };
  const shortName = stringValue(row.short_name);
  const description = stringValue(row.res_description);

  if (shortName !== undefined) {
    service.shortName = shortName;
  }

  if (description !== undefined) {
    service.description = description;
  }

  return service;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function escapeAdqlStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

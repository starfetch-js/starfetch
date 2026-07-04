import { defaultTapPresets, type TapPresetRegistry } from "./tap-presets.js";

/** TAP service target accepted by {@link tap} and lower-level helpers. */
export type TapTarget =
  | string
  | { service: string; url?: string }
  | { url: string; service?: string };

/** Normalized TAP target after preset or URL resolution. */
export type ResolvedTapTarget = {
  /** TAP base URL without trailing slashes. */
  baseUrl: string;
  /** Known service preset name, when the target came from a preset. */
  service?: string;
  /** Human-readable preset label, when available. */
  label?: string;
  /** Preset-specific sync compatibility request parameter, when required. */
  syncRequest?: "doQuery";
};

type ResolveTapTargetOptions = {
  presets?: TapPresetRegistry;
};

/**
 * Resolve a known preset or explicit TAP base URL into a normalized target.
 *
 * @param target - Service preset name, TAP base URL, or target object.
 * @param options - Optional preset registry override for tests or adapters.
 * @returns Normalized TAP target metadata.
 */
export function resolveTapTarget(
  target: TapTarget,
  options: ResolveTapTargetOptions = {},
): ResolvedTapTarget {
  const presets = options.presets ?? defaultTapPresets;

  if (typeof target === "string") {
    const value = target.trim();

    if (looksLikeUrl(value)) {
      return { baseUrl: normalizeTapBaseUrl(value) };
    }

    return resolvePreset(value, presets);
  }

  if ("url" in target && target.url !== undefined) {
    const resolved: ResolvedTapTarget = {
      baseUrl: normalizeTapBaseUrl(target.url),
    };

    if (target.service !== undefined) {
      return withPresetContext(resolved, findPreset(target.service, presets));
    }

    return resolved;
  }

  if ("service" in target && target.service !== undefined) {
    return resolvePreset(target.service, presets);
  }

  throw new Error("TAP target must include a service name or base URL");
}

function resolvePreset(
  service: string,
  presets: TapPresetRegistry,
): ResolvedTapTarget {
  const preset = findPreset(service, presets);

  return withPresetMetadata(
    {
      baseUrl: normalizeTapBaseUrl(preset.url),
    },
    preset,
  );
}

function withPresetMetadata(
  resolved: ResolvedTapTarget,
  preset: TapPresetRegistry[string],
): ResolvedTapTarget {
  const target: ResolvedTapTarget = {
    ...resolved,
    service: preset.name,
  };

  if (preset.label !== undefined) {
    target.label = preset.label;
  }

  if (preset.syncRequest !== undefined) {
    target.syncRequest = preset.syncRequest;
  }

  return target;
}

function withPresetContext(
  resolved: ResolvedTapTarget,
  preset: TapPresetRegistry[string],
): ResolvedTapTarget {
  const target: ResolvedTapTarget = {
    ...resolved,
    service: preset.name,
  };

  if (preset.label !== undefined) {
    target.label = preset.label;
  }

  return target;
}

function findPreset(
  service: string,
  presets: TapPresetRegistry,
): TapPresetRegistry[string] {
  const preset = presets[service];

  if (!preset) {
    throw new Error(`Unknown TAP service preset: ${service}`);
  }

  return preset;
}

function normalizeTapBaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid TAP base URL: ${value}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported TAP base URL protocol: ${url.protocol}`);
  }

  if (url.search || url.hash) {
    throw new Error("TAP base URL must not include query strings or fragments");
  }

  return url.href.replace(/\/+$/, "");
}

function looksLikeUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

export type { TapPreset, TapPresetRegistry } from "./tap-presets.js";

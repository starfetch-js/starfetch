/** Known TAP service preset metadata. */
export type TapPreset = {
  /** Stable preset key used by `tap("name")` and CLI `--service`. */
  name: string;
  /** TAP base URL. */
  url: string;
  /** Human-readable service label. */
  label?: string;
  /** Preset-specific sync compatibility request parameter, when required. */
  syncRequest?: "doQuery";
};

/** Read-only map of preset keys to TAP preset metadata. */
export type TapPresetRegistry = Readonly<Record<string, TapPreset>>;

/** Built-in TAP service presets for common public astronomy services. */
export const defaultTapPresets: TapPresetRegistry = {
  exoplanetarchive: {
    name: "exoplanetarchive",
    url: "https://exoplanetarchive.ipac.caltech.edu/TAP",
    label: "NASA Exoplanet Archive",
  },
  gaia: {
    name: "gaia",
    url: "https://gea.esac.esa.int/tap-server/tap",
    label: "ESA Gaia Archive",
  },
  irsa: {
    name: "irsa",
    url: "https://irsa.ipac.caltech.edu/TAP",
    label: "NASA/IPAC Infrared Science Archive",
  },
  simbad: {
    name: "simbad",
    url: "https://simbad.cds.unistra.fr/simbad/sim-tap",
    label: "SIMBAD",
    syncRequest: "doQuery",
  },
  vizier: {
    name: "vizier",
    url: "https://tapvizier.cds.unistra.fr/TAPVizieR/tap",
    label: "VizieR",
    syncRequest: "doQuery",
  },
};

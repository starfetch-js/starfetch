import type { StarfetchTableViewV1 } from "../../src/presentation-contract.js";

export const browserTestView: StarfetchTableViewV1 = {
  clipping: { reasons: [], sourceColumns: 12, sourceRows: 100 },
  columns: [
    {
      datatype: "long",
      key: "source_id",
      label: "Source ID",
      ucd: "meta.id;meta.main",
    },
    {
      datatype: "double",
      key: "ra",
      label: "Right ascension",
      ucd: "pos.eq.ra;meta.main",
      unit: "deg",
    },
    {
      datatype: "double",
      key: "dec",
      label: "Declination",
      ucd: "pos.eq.dec;meta.main",
      unit: "deg",
    },
    {
      datatype: "double",
      key: "parallax",
      label: "Parallax",
      ucd: "pos.parallax.trig",
      unit: "mas",
    },
    {
      datatype: "double",
      key: "pmra",
      label: "Proper motion RA",
      ucd: "pos.pm;pos.eq.ra",
      unit: "mas/yr",
    },
    {
      datatype: "double",
      key: "pmdec",
      label: "Proper motion Dec",
      ucd: "pos.pm;pos.eq.dec",
      unit: "mas/yr",
    },
    {
      datatype: "float",
      key: "phot_g_mean_mag",
      label: "G magnitude",
      ucd: "phot.mag;em.opt.G",
      unit: "mag",
    },
    {
      datatype: "float",
      key: "bp_rp",
      label: "BP−RP colour",
      ucd: "phot.color;em.opt.B;em.opt.R",
      unit: "mag",
    },
    {
      datatype: "float",
      key: "radial_velocity",
      label: "Radial velocity",
      ucd: "spect.dopplerVeloc.opt",
      unit: "km/s",
    },
    {
      datatype: "float",
      key: "teff_gspphot",
      label: "Effective temperature",
      ucd: "phys.temperature.effective",
      unit: "K",
    },
    {
      datatype: "float",
      key: "logg_gspphot",
      label: "Surface gravity",
      ucd: "phys.gravity",
      unit: "log(cm/s²)",
    },
    {
      datatype: "float",
      key: "distance_gspphot",
      label: "Photometric distance",
      ucd: "pos.distance",
      unit: "pc",
    },
  ],
  contractVersion: 1,
  resultKind: "query-rows",
  rows: Array.from({ length: 100 }, (_, index) => ({
    source_id: String(4_000_000_000_000_000_000n + BigInt(index)),
    ra: (50 + index / 10).toFixed(7),
    dec: (-12 + index / 20).toFixed(7),
    parallax: (2.4 + index / 100).toFixed(4),
    pmra: (-18 + index / 5).toFixed(4),
    pmdec: (7 - index / 8).toFixed(4),
    phot_g_mean_mag: (8.2 + index / 40).toFixed(4),
    bp_rp: (0.6 + index / 200).toFixed(4),
    radial_velocity: index % 5 === 0 ? null : (-32 + index / 3).toFixed(3),
    teff_gspphot: String(4_600 + index * 12),
    logg_gspphot: (3.8 + index / 500).toFixed(4),
    distance_gspphot: String(120 + index * 3),
  })),
  source: {
    durationMs: 42,
    effectiveMaxrec: 100,
    format: "json",
    query: `SELECT TOP 100
  source_id,
  ra,
  dec,
  parallax,
  pmra,
  pmdec,
  phot_g_mean_mag,
  bp_rp,
  radial_velocity,
  teff_gspphot,
  logg_gspphot,
  distance_gspphot
FROM gaiadr3.gaia_source
WHERE parallax IS NOT NULL
  AND parallax_over_error >= 10
  AND phot_g_mean_mag BETWEEN 8 AND 15
  AND ruwe < 1.4
  AND duplicated_source = 'false'
  AND DISTANCE(
    POINT('ICRS', ra, dec),
    POINT('ICRS', 56.75, 24.12)
  ) < 5
ORDER BY phot_g_mean_mag ASC`,
    requestFormat: "votable",
    target: {
      baseUrl: "https://gea.esac.esa.int/tap-server/tap",
      label: "ESA Gaia Archive",
      service: "gaia",
    },
    tool: "starfetch_tap_query",
  },
  state: "populated",
  title: "Gaia source results",
};

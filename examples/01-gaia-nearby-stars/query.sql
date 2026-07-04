SELECT TOP 20
  source_id,
  ra,
  dec,
  parallax,
  parallax_error,
  pmra,
  pmdec,
  phot_g_mean_mag,
  bp_rp,
  ruwe
FROM gaiadr3.gaia_source
WHERE parallax > 50
  AND parallax_over_error > 10
  AND ruwe < 1.4
ORDER BY parallax DESC

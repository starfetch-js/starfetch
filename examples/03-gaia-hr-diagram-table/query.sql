SELECT TOP 100
  source_id,
  bp_rp,
  phot_g_mean_mag,
  parallax,
  parallax_over_error,
  ruwe,
  phot_g_mean_mag + 5 * LOG10(parallax) - 10 AS absolute_g_mag
FROM gaiadr3.gaia_source
WHERE parallax > 5
  AND bp_rp IS NOT NULL
  AND phot_g_mean_mag IS NOT NULL
  AND parallax_over_error > 10
  AND ruwe < 1.4
ORDER BY bp_rp ASC

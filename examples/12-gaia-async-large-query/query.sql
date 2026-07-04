SELECT TOP 2000
  source_id,
  ra,
  dec,
  phot_g_mean_mag
FROM gaiadr3.gaia_source
WHERE parallax > 1
  AND phot_g_mean_mag IS NOT NULL
ORDER BY phot_g_mean_mag ASC

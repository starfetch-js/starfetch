SELECT TOP 50
  source_id,
  ra,
  dec,
  pmra,
  pmdec,
  SQRT(POWER(pmra, 2) + POWER(pmdec, 2)) AS total_pm,
  phot_g_mean_mag,
  bp_rp
FROM gaiadr3.gaia_source
WHERE pmra IS NOT NULL
  AND pmdec IS NOT NULL
  AND SQRT(POWER(pmra, 2) + POWER(pmdec, 2)) > 1000
ORDER BY total_pm DESC

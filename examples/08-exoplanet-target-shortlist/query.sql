SELECT TOP 50
  pl_name,
  hostname,
  sy_dist,
  disc_year,
  pl_orbper,
  pl_rade,
  pl_bmasse,
  st_teff,
  st_rad,
  st_mass
FROM pscomppars
WHERE sy_dist IS NOT NULL
  AND pl_rade IS NOT NULL
  AND st_teff IS NOT NULL
ORDER BY sy_dist ASC

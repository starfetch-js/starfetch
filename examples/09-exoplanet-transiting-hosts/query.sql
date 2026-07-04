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
  st_mass,
  tran_flag
FROM pscomppars
WHERE tran_flag = 1
  AND sy_dist IS NOT NULL
ORDER BY sy_dist ASC

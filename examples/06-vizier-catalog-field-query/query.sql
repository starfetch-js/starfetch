SELECT TOP 50
  Source AS source_id,
  RA_ICRS AS ra,
  DE_ICRS AS dec,
  Plx AS parallax,
  Gmag AS g_mag,
  "BP-RP" AS bp_rp,
  PM AS total_pm
FROM "I/355/gaiadr3"
WHERE CONTAINS(
  POINT('ICRS', RA_ICRS, DE_ICRS),
  CIRCLE('ICRS', 56.75, 24.1167, 0.1)
) = 1

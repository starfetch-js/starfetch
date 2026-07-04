SELECT TOP 50
  oid,
  main_id,
  ra,
  dec,
  otype,
  otype_txt
FROM basic
WHERE CONTAINS(
  POINT('ICRS', ra, dec),
  CIRCLE('ICRS', 56.75, 24.1167, 0.1)
) = 1

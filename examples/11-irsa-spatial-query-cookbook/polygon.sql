SELECT TOP 20
  designation,
  ra,
  dec,
  w1mpro,
  w2mpro
FROM allwise_p3as_psd
WHERE CONTAINS(
  POINT('ICRS', ra, dec),
  POLYGON('ICRS', 56.65, 24.05, 56.85, 24.05, 56.85, 24.25, 56.65, 24.25)
) = 1

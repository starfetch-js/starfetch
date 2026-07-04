SELECT TOP 20
  designation,
  ra,
  dec,
  w1mpro,
  w2mpro
FROM allwise_p3as_psd
WHERE CONTAINS(
  POINT('ICRS', ra, dec),
  BOX('ICRS', 56.75, 24.1167, 0.2, 0.2)
) = 1

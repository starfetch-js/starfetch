SELECT TOP 50
  designation,
  ra,
  dec,
  w1mpro,
  w2mpro,
  w3mpro,
  w4mpro
FROM allwise_p3as_psd
WHERE CONTAINS(
  POINT('ICRS', ra, dec),
  CIRCLE('ICRS', 56.75, 24.1167, 0.1)
) = 1

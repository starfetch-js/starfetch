SELECT TOP 50
  b.main_id,
  b.ra,
  b.dec,
  b.otype,
  i.id
FROM basic AS b
JOIN ident AS i
  ON b.oid = i.oidref
WHERE i.id LIKE 'Gaia DR3%'

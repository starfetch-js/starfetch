# Gaia

Use the `gaia` preset for ESA Gaia Archive TAP data such as astrometry,
photometry, and proper motions. Release-qualified schemas and table contents
can change; inspect tables and exact columns before querying.

Spatial work commonly uses ICRS `ra` and `dec` values in degrees. Proper-motion
filters require checking units and nullability in column metadata. Distance is
not generally a stored geometric fact: if deriving it from parallax, state the
method and limitations rather than presenting it as a catalog column.

Start with a small selection from the discovered Gaia source table. Avoid
all-sky scans and broad column selections.

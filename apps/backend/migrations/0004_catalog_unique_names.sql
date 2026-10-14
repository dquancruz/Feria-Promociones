-- Two catalog items with the same name (ignoring case and surrounding spaces) would look
-- identical in the form, so the name is unique. Retired items keep their name reserved,
-- which is what lets "Reactivar" bring one back without clashing with a newer copy.
CREATE UNIQUE INDEX catalog_items_name_unique_idx ON catalog_items (lower(btrim(name)));

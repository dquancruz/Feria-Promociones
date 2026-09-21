-- The demo catalog started with placeholder names ("Servicio 1 - ...", "Producto 3"). Give the
-- items real names, keeping their prices. Only rows that still have a placeholder name change,
-- so a catalog that was already renamed by hand is left alone.
UPDATE catalog_items AS ci
SET name = renamed.new_name
FROM (VALUES
  ('Servicio 1 - Diagnóstico inicial', 'Diagnóstico de suelos'),
  ('Servicio 2 - Soporte básico', 'Asesoría agronómica básica'),
  ('Servicio 3 - Instalación', 'Instalación de sistema de riego'),
  ('Servicio 4 - Mantenimiento anual', 'Mantenimiento anual de riego'),
  ('Servicio 5 - Consultoría premium', 'Consultoría agronómica premium'),
  ('Servicio 6 - Capacitación', 'Capacitación para productores'),
  ('Producto 1', 'Semilla de maíz híbrido'),
  ('Producto 2', 'Fertilizante 15-15-15'),
  ('Producto 3', 'Kit de riego por goteo'),
  ('Producto 4', 'Bomba de agua de 1 HP'),
  ('Producto 5', 'Insecticida orgánico'),
  ('Producto 6', 'Herbicida selectivo'),
  ('Producto 7', 'Fungicida sistémico')
) AS renamed(old_name, new_name)
WHERE ci.name = renamed.old_name;

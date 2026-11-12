-- Fibras que conservan el color rojo antiguo (el valor por defecto de antes) pasan al color
-- estándar de su cantidad de hilos: 2 negro, 6 rosado, 12 azul, 24 verde, 48 café.
-- Las fibras a las que el usuario ya les eligió otro color no se tocan.
UPDATE cables
SET color = CASE "fiberCount"
  WHEN 2 THEN '#111827'
  WHEN 6 THEN '#ec4899'
  WHEN 12 THEN '#3b82f6'
  WHEN 24 THEN '#22c55e'
  WHEN 48 THEN '#8b4513'
  ELSE color
END
WHERE color = '#ef4444';

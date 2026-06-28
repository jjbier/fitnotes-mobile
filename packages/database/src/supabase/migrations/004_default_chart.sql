-- Gráfico predeterminado por ejercicio
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS default_chart TEXT DEFAULT 'weight';

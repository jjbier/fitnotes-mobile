-- Orden manual de medidas del Body Tracker (drag & drop)
ALTER TABLE public.body_measurements
  ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;

-- Backfill: numerar medidas existentes por fecha de creación dentro de cada usuario
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) - 1 AS rn
  FROM public.body_measurements
)
UPDATE public.body_measurements bm
SET order_index = ordered.rn
FROM ordered
WHERE bm.id = ordered.id;

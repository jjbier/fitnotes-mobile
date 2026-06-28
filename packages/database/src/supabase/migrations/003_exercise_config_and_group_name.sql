-- Incremento de peso y tiempo de descanso por defecto en ejercicios
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS weight_increment DECIMAL(5,2) DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS default_rest_seconds INTEGER DEFAULT 90;

-- Nombre de grupo para supersets en workout_exercises
ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS group_name TEXT;

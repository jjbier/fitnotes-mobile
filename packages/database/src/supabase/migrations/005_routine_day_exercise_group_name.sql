-- Nombre de grupo para supersets en rutinas
ALTER TABLE routine_day_exercises
  ADD COLUMN IF NOT EXISTS group_name TEXT;

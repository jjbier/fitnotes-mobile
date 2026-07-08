-- El enum exercise_type solo tenía los 5 tipos base; el código (ExerciseType en
-- packages/core) soporta 10 desde hace varias fases, pero nunca se migró la BD.
-- Sin esto, crear/editar un ejercicio con un tipo avanzado falla con
-- "invalid input value for enum exercise_type".
ALTER TYPE public.exercise_type ADD VALUE IF NOT EXISTS 'WEIGHT_DISTANCE';
ALTER TYPE public.exercise_type ADD VALUE IF NOT EXISTS 'WEIGHT_TIME';
ALTER TYPE public.exercise_type ADD VALUE IF NOT EXISTS 'REPS_DISTANCE';
ALTER TYPE public.exercise_type ADD VALUE IF NOT EXISTS 'REPS_TIME';
ALTER TYPE public.exercise_type ADD VALUE IF NOT EXISTS 'DISTANCE_ONLY';

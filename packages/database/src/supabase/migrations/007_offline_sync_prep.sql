-- Preparación para sync offline (Fase 1 del plan offline):
-- 1) Documenta drift de esquema ya presente en producción pero ausente de
--    migraciones committeadas (is_warmup en sets, tabla exercise_goals).
-- 2) Añade updated_at + trigger a las tablas que no lo tenían — sin esto,
--    el sync "last-write-wins" no puede funcionar de forma uniforme en
--    las 13 tablas sincronizables.
-- Todas las operaciones son idempotentes (IF NOT EXISTS / DROP...IF EXISTS)
-- para poder re-ejecutar sin error si parte de esto ya existe.

-- ─── Drift ya presente en producción (documentación) ──────────────────────────

ALTER TABLE public.sets
  ADD COLUMN IF NOT EXISTS is_warmup boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.exercise_goals (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  exercise_id   uuid not null references public.exercises(id) on delete cascade,
  target_weight numeric,
  target_reps   integer,
  target_date   date,
  achieved_at   timestamptz,
  notes         text,
  created_at    timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_exercise_goals_user_id ON public.exercise_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_exercise_goals_exercise_id ON public.exercise_goals(exercise_id);

ALTER TABLE public.exercise_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own exercise_goals" ON public.exercise_goals;
CREATE POLICY "Users manage own exercise_goals"
  ON public.exercise_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── updated_at para tablas que no lo tenían ──────────────────────────────────

ALTER TABLE public.predefined_sets
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.personal_records        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.routine_days            ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.routine_day_exercises   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.predefined_sets         ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.body_measurements       ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.body_measurement_entries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.exercise_goals          ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_personal_records_updated_at ON public.personal_records;
CREATE TRIGGER trg_personal_records_updated_at
  BEFORE UPDATE ON public.personal_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_routine_days_updated_at ON public.routine_days;
CREATE TRIGGER trg_routine_days_updated_at
  BEFORE UPDATE ON public.routine_days
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_routine_day_exercises_updated_at ON public.routine_day_exercises;
CREATE TRIGGER trg_routine_day_exercises_updated_at
  BEFORE UPDATE ON public.routine_day_exercises
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_predefined_sets_updated_at ON public.predefined_sets;
CREATE TRIGGER trg_predefined_sets_updated_at
  BEFORE UPDATE ON public.predefined_sets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_body_measurements_updated_at ON public.body_measurements;
CREATE TRIGGER trg_body_measurements_updated_at
  BEFORE UPDATE ON public.body_measurements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_body_measurement_entries_updated_at ON public.body_measurement_entries;
CREATE TRIGGER trg_body_measurement_entries_updated_at
  BEFORE UPDATE ON public.body_measurement_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_exercise_goals_updated_at ON public.exercise_goals;
CREATE TRIGGER trg_exercise_goals_updated_at
  BEFORE UPDATE ON public.exercise_goals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

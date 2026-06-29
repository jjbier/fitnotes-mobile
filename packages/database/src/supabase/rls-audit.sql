-- RLS Audit — FitNotes App
-- Verifica que todas las tablas de usuario tengan RLS habilitado y políticas correctas.
-- Ejecutar en Supabase Studio (SQL Editor) o via Management API.
-- Resultado esperado: todas las filas con rls_ok = true y policy_ok = true.

-- ─── 1. Verificar RLS habilitado y política correcta en cada tabla ──────────

SELECT
  t.tablename,
  t.rowsecurity                                    AS rls_enabled,
  p.policyname,
  p.cmd,
  p.qual,
  t.rowsecurity = true                             AS rls_ok,
  p.cmd = 'ALL'
    AND p.qual = '(auth.uid() = user_id)'          AS policy_ok
FROM pg_tables t
LEFT JOIN pg_policies p
  ON  p.tablename  = t.tablename
  AND p.schemaname = t.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'categories', 'exercises', 'workouts', 'workout_exercises',
    'sets', 'personal_records', 'routines', 'routine_days',
    'routine_day_exercises', 'predefined_sets',
    'body_measurements', 'body_measurement_entries', 'exercise_goals'
  )
ORDER BY t.tablename;

-- Criterio de éxito: todas las filas tienen rls_ok = true y policy_ok = true.

-- ─── 2. Resumen — debe devolver 0 filas con problemas ────────────────────────

SELECT
  tablename,
  rowsecurity AS rls_enabled,
  coalesce(cmd, 'MISSING')   AS policy_cmd,
  coalesce(qual, 'MISSING')  AS policy_qual,
  CASE
    WHEN rowsecurity = false         THEN 'ERROR: RLS disabled'
    WHEN cmd IS NULL                 THEN 'ERROR: no policy'
    WHEN cmd <> 'ALL'                THEN 'ERROR: policy cmd is not ALL'
    WHEN qual <> '(auth.uid() = user_id)' THEN 'ERROR: policy does not use auth.uid()'
    ELSE 'OK'
  END AS status
FROM pg_tables t
LEFT JOIN pg_policies p
  ON  p.tablename  = t.tablename
  AND p.schemaname = t.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'categories', 'exercises', 'workouts', 'workout_exercises',
    'sets', 'personal_records', 'routines', 'routine_days',
    'routine_day_exercises', 'predefined_sets',
    'body_measurements', 'body_measurement_entries', 'exercise_goals'
  )
  AND (
    rowsecurity = false
    OR cmd IS NULL
    OR cmd <> 'ALL'
    OR qual <> '(auth.uid() = user_id)'
  )
ORDER BY tablename;

-- ─── 3. Test de aislamiento entre usuarios ────────────────────────────────────
-- Simula rol anon (sin JWT): auth.uid() devuelve NULL → ninguna fila visible.

SET ROLE anon;

SELECT count(*) AS workouts_anon                FROM public.workouts;
SELECT count(*) AS exercises_anon               FROM public.exercises;
SELECT count(*) AS categories_anon              FROM public.categories;
SELECT count(*) AS sets_anon                    FROM public.sets;
SELECT count(*) AS personal_records_anon        FROM public.personal_records;
SELECT count(*) AS routines_anon                FROM public.routines;
SELECT count(*) AS body_measurements_anon       FROM public.body_measurements;

RESET ROLE;

-- Criterio de éxito: todos los counts = 0.

-- Quita el trigger SQL remoto que duplicaba personal_records junto con
-- maybeRecordPersonalRecord() (local, packages/database/src/local/repositories/
-- localWorkoutRepository.ts): al ser offline-first, todo set se escribe primero
-- en SQLite local (que ya inserta la fila de PR y la encola para push) y se
-- empuja después — el orden de push (sets antes que personal_records, ver
-- pushOrdering.ts) hace que este trigger se dispare siempre sin ver todavía la
-- fila local, insertando una segunda fila para el mismo evento. Determinista,
-- no solo tras claim+sync: pasa en cualquier sync de cualquier PR completado
-- offline-first, para cualquier cuenta.
--
-- Ya no hay ninguna app que escriba en `sets` directamente en Supabase aparte
-- de este móvil (la web original ya no comparte este backend, ver CLAUDE.md),
-- así que el trigger es puramente redundante con maybeRecordPersonalRecord().
-- Si en el futuro algo más escribiera `sets` directamente, dejaría de generar
-- PRs — usar `recalculatePersonalRecords` (Configuración → Datos, requiere
-- cuenta) para regenerarlos desde el historial de sets en ese caso.
--
-- Las filas duplicadas generadas ANTES de esta migración siguen existiendo en
-- personal_records (esta migración no las limpia) — se colapsan en la lectura
-- vía la CTE de ROW_NUMBER() en getPersonalRecords/getAllPersonalRecords
-- (local y remoto), que se mantiene sin cambios como red de seguridad.

DROP TRIGGER IF EXISTS trg_update_personal_record ON public.sets;
DROP FUNCTION IF EXISTS public.update_personal_record();

/**
 * Réplica en JS de la regla del trigger SQL `update_personal_record`
 * (packages/database/src/supabase/migrations/001_initial_schema.sql) —
 * necesaria para que un set completado offline (modo invitado, sin red)
 * genere el mismo PR que generaría el trigger tras el sync. Deliberadamente
 * NO filtra `is_warmup` (el trigger tampoco lo hace) para no divergir del
 * histórico ya creado en producción por el trigger real.
 */

/** Datos mínimos de un set necesarios para evaluar si genera un PR nuevo. */
export interface PersonalRecordCandidate {
  isComplete: boolean;
  weight: number | null | undefined;
  reps: number | null | undefined;
}

/** Reps y peso a insertar como nuevo `PersonalRecord` cuando el candidato supera el máximo actual. */
export interface PersonalRecordUpdate {
  reps: number;
  weight: number;
}

/**
 * Decide si un set completado debería generar un PR nuevo para su
 * ejercicio: exige que el set esté completo y tenga peso y reps, y que su
 * peso supere estrictamente `currentMaxWeight` (o que no exista PR previo,
 * `currentMaxWeight === null`). Devuelve `null` si no corresponde generar PR.
 */
export function computePersonalRecordUpdate(
  candidate: PersonalRecordCandidate,
  currentMaxWeight: number | null
): PersonalRecordUpdate | null {
  if (!candidate.isComplete || candidate.weight == null || candidate.reps == null) {
    return null;
  }
  if (currentMaxWeight !== null && candidate.weight <= currentMaxWeight) {
    return null;
  }
  return { reps: candidate.reps, weight: candidate.weight };
}

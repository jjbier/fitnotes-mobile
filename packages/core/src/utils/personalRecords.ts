/**
 * Réplica en JS de la regla del trigger SQL `update_personal_record`
 * (packages/database/src/supabase/migrations/001_initial_schema.sql) —
 * necesaria para que un set completado offline (modo invitado, sin red)
 * genere el mismo PR que generaría el trigger tras el sync. Deliberadamente
 * NO filtra `is_warmup` (el trigger tampoco lo hace) para no divergir del
 * histórico ya creado en producción por el trigger real.
 */

export interface PersonalRecordCandidate {
  isComplete: boolean;
  weight: number | null | undefined;
  reps: number | null | undefined;
}

export interface PersonalRecordUpdate {
  reps: number;
  weight: number;
}

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

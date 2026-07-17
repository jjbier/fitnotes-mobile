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

/** Set completo (peso+reps) de un ejercicio, con su fecha de creación — entrada mínima para reconstruir el ledger de PRs. */
export interface CompletedSetForPR {
  exercise_id: string;
  reps: number;
  weight: number;
  created_at: string;
}

/** Fila de `personal_records` reconstruida por {@link recomputePersonalRecordLedger}. */
export interface PersonalRecordEntry {
  exercise_id: string;
  reps: number;
  weight: number;
  achieved_at: string;
}

/**
 * Reconstruye desde cero el ledger de PRs de uno o más ejercicios,
 * reproduciendo en orden cronológico la misma regla que aplica
 * {@link computePersonalRecordUpdate} set a set (nunca sobrescribe, solo
 * añade una fila cuando el peso supera el máximo previo para ese
 * `(exercise_id, reps)`). Necesaria porque `personal_records` no referencia
 * el set que la generó — al borrar sets hay que recalcular el histórico
 * completo del ejercicio en vez de intentar localizar una fila concreta que
 * borrar. `sets` no necesita venir ordenado por `created_at`: se ordena aquí.
 */
export function recomputePersonalRecordLedger(sets: CompletedSetForPR[]): PersonalRecordEntry[] {
  const sorted = sets.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const currentMax = new Map<string, number>();
  const ledger: PersonalRecordEntry[] = [];
  for (const s of sorted) {
    const key = `${s.exercise_id}:${s.reps}`;
    const update = computePersonalRecordUpdate(
      { isComplete: true, weight: s.weight, reps: s.reps },
      currentMax.get(key) ?? null
    );
    if (!update) continue;
    currentMax.set(key, update.weight);
    ledger.push({ exercise_id: s.exercise_id, reps: update.reps, weight: update.weight, achieved_at: s.created_at });
  }
  return ledger;
}

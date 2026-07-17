import { useCallback, useRef, useState } from "react";
import WorkoutPickerModal, { type PickableWorkout } from "../components/workout/WorkoutPickerModal";

interface WorkoutForDateRepo {
  getWorkoutsByDate(date: string): Promise<{ data: PickableWorkout[] | null; error: unknown }>;
  createWorkout(
    data: { date: string; start_time?: string },
    userId: string
  ): Promise<{ data: { id: string } | null; error: unknown }>;
}

/**
 * Resuelve "el" entrenamiento de una fecha para acciones rápidas (añadir una
 * serie desde la calculadora, copiar una serie del historial…) sin asumir
 * que solo puede haber uno — ver docs/implementation-plan-multi-workout-per-day.md,
 * Fase 4.
 *
 * `resolveWorkoutForDate(date, userId)`:
 * - 0 entrenamientos ese día → crea uno y devuelve su id (comportamiento de
 *   siempre).
 * - 1 → devuelve su id directo, sin preguntar nada (sin cambio de UX).
 * - ≥2 → muestra el picker (renderizar `pickerModal` en el JSX del que llama)
 *   y espera a que el usuario elija uno o cree uno nuevo; devuelve `null` si
 *   cierra el modal sin elegir.
 */
export function useWorkoutForDate(repo: WorkoutForDateRepo) {
  const [pending, setPending] = useState<PickableWorkout[] | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const resolveRef = useRef<((id: string | null) => void) | null>(null);

  const resolveWorkoutForDate = useCallback(
    async (date: string, userId: string): Promise<string | null> => {
      const { data } = await repo.getWorkoutsByDate(date);
      const workouts = data ?? [];
      if (workouts.length === 0) {
        const { data: created } = await repo.createWorkout({ date, start_time: new Date().toISOString() }, userId);
        return created?.id ?? null;
      }
      if (workouts.length === 1) return workouts[0]!.id;

      return new Promise<string | null>((resolve) => {
        resolveRef.current = async (id: string | null) => {
          if (id !== "__new__") {
            resolve(id);
            return;
          }
          setCreatingNew(true);
          const { data: created } = await repo.createWorkout({ date, start_time: new Date().toISOString() }, userId);
          setCreatingNew(false);
          setPending(null);
          resolve(created?.id ?? null);
        };
        setPending(workouts);
      });
    },
    [repo]
  );

  function choose(workoutId: string) {
    resolveRef.current?.(workoutId);
    resolveRef.current = null;
    setPending(null);
  }

  function createNew() {
    resolveRef.current?.("__new__");
  }

  function cancel() {
    resolveRef.current?.(null);
    resolveRef.current = null;
    setPending(null);
  }

  const pickerModal = (
    <WorkoutPickerModal
      visible={!!pending}
      workouts={pending ?? []}
      creating={creatingNew}
      onChoose={choose}
      onCreateNew={createNew}
      onClose={cancel}
    />
  );

  return { resolveWorkoutForDate, pickerModal };
}

/**
 * Repositorio remoto de progreso: PRs, punto de datos agregado por fecha para
 * gráficas (`ChartPoint`) y resumen de entrenamiento semanal. Toda la
 * agregación se hace en memoria en JS a partir de filas crudas de Supabase
 * (sin SQL agregado), por eso mueve volúmenes de filas completos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;

/** Agregado de una fecha de entrenamiento para un ejercicio: máximos y totales de peso/reps/distancia/tiempo, 1RM estimado y mejor peso por número de reps. */
export interface ChartPoint {
  date: string;
  maxWeight: number;
  totalVolume: number;
  maxReps: number;
  totalReps: number;
  est1RM: number;
  maxDistance: number;
  maxTime: number;
  totalDistance: number;
  totalTime: number;
  maxSpeed: number;
  bestPace: number;
  weightByReps: Record<number, number>;
}

export function createProgressRepository(client: Client) {
  return {
    /** PRs de un ejercicio, ordenados por reps ascendente y luego peso descendente. */
    getPersonalRecords(exerciseId: string) {
      return client
        .from("personal_records")
        .select("*")
        .eq("exercise_id", exerciseId)
        .order("reps", { ascending: true })
        .order("weight", { ascending: false });
    },

    /** Todos los PRs del usuario, agrupables por ejercicio (mismo orden que {@link getPersonalRecords} pero sin filtrar). */
    getAllPersonalRecords() {
      return client
        .from("personal_records")
        .select("*")
        .order("exercise_id")
        .order("reps", { ascending: true })
        .order("weight", { ascending: false });
    },

    /** Mejores reps/distancia/tiempo de sets completos (no warmup) por ejercicio — para ejercicios sin PR de peso (p.ej. solo-reps o cardio). */
    async getBestSetsByExercise(exerciseIds: string[]): Promise<Record<string, { maxReps: number; maxDistance: number; maxTime: number }>> {
      if (exerciseIds.length === 0) return {};
      const { data } = await client
        .from("workout_exercises")
        .select("exercise_id, sets(reps, distance, time_seconds, is_complete, is_warmup)")
        .in("exercise_id", exerciseIds);
      const result: Record<string, { maxReps: number; maxDistance: number; maxTime: number }> = {};
      if (!data) return result;
      for (const we of data) {
        const exId = we.exercise_id;
        const wesets = (we.sets as Array<{ reps: number | null; distance: number | null; time_seconds: number | null; is_complete: boolean; is_warmup: boolean | null }> | null) ?? [];
        for (const s of wesets) {
          if (!s.is_complete || s.is_warmup) continue;
          if (!result[exId]) result[exId] = { maxReps: 0, maxDistance: 0, maxTime: 0 };
          if ((s.reps ?? 0) > result[exId]!.maxReps) result[exId]!.maxReps = s.reps ?? 0;
          if ((s.distance ?? 0) > result[exId]!.maxDistance) result[exId]!.maxDistance = s.distance ?? 0;
          if ((s.time_seconds ?? 0) > result[exId]!.maxTime) result[exId]!.maxTime = s.time_seconds ?? 0;
        }
      }
      return result;
    },

    /**
     * Serie temporal de {@link ChartPoint} para un ejercicio: une sets completos
     * (no warmup) por fecha de entrenamiento, calculando en el mismo bucle el 1RM
     * estimado (fórmula Epley-like `w * 36/(37-r)`, solo válida para r<37),
     * velocidad/ritmo (para ejercicios de cardio con distancia+tiempo) y el mejor
     * peso por número de reps (`weightByReps`). Ordenado por fecha ascendente.
     */
    async getChartData(exerciseId: string): Promise<ChartPoint[]> {
      // Fetch workout_exercises for this exercise, with their parent workout dates
      const { data: weRows, error } = await client
        .from("workout_exercises")
        .select("id, workouts!inner(date)")
        .eq("exercise_id", exerciseId);

      if (error || !weRows || weRows.length === 0) return [];

      type WeRow = (typeof weRows)[number] & { workouts: { date: string } };

      const dateByWeId: Record<string, string> = {};
      for (const we of weRows as WeRow[]) {
        dateByWeId[we.id] = we.workouts.date;
      }

      const weIds = weRows.map((we) => we.id);
      const { data: setRows } = await client
        .from("sets")
        .select("workout_exercise_id, weight, reps, distance, time_seconds, is_complete")
        .in("workout_exercise_id", weIds)
        .eq("is_complete", true)
        .eq("is_warmup", false);

      if (!setRows || setRows.length === 0) return [];

      type DateAgg = Omit<ChartPoint, "date">;
      const byDate: Record<string, DateAgg> = {};

      for (const s of setRows) {
        const date = dateByWeId[s.workout_exercise_id];
        if (!date) continue;
        const w = s.weight ?? 0;
        const r = s.reps ?? 0;
        const dist = s.distance ?? 0;
        const time = s.time_seconds ?? 0;
        if (!byDate[date]) {
          byDate[date] = {
            maxWeight: 0, totalVolume: 0, maxReps: 0, totalReps: 0, est1RM: 0,
            maxDistance: 0, maxTime: 0, totalDistance: 0, totalTime: 0,
            maxSpeed: 0, bestPace: 0, weightByReps: {},
          };
        }
        const entry = byDate[date]!;
        if (w > entry.maxWeight) entry.maxWeight = w;
        entry.totalVolume += w * r;
        if (r > entry.maxReps) entry.maxReps = r;
        entry.totalReps += r;
        entry.totalDistance += dist;
        entry.totalTime += time;
        if (dist > entry.maxDistance) entry.maxDistance = dist;
        if (time > entry.maxTime) entry.maxTime = time;
        if (w > 0 && r > 0 && r < 37) {
          const orm = w * (36 / (37 - r));
          if (orm > entry.est1RM) entry.est1RM = orm;
          if (r > 0 && (entry.weightByReps[r] == null || w > entry.weightByReps[r]!)) {
            entry.weightByReps[r] = w;
          }
        }
        if (dist > 0 && time > 0) {
          const speed = (dist / time) * 3600;
          if (speed > entry.maxSpeed) entry.maxSpeed = speed;
          const pace = time / dist;
          if (entry.bestPace === 0 || pace < entry.bestPace) entry.bestPace = pace;
        }
      }

      return Object.entries(byDate)
        .map(([date, vals]) => ({ date, ...vals }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    /**
     * Sets completados y volumen (peso × reps) por ejercicio, entre `dateFrom`
     * y `dateTo` (ambos inclusive; `dateTo` omitido = sin límite superior) —
     * usado en el resumen por categoría del tab Progreso, con el rango que
     * corresponda al periodo elegido (semana/mes/año/todo).
     */
    async getWeeklyTraining(dateFrom: string, dateTo?: string): Promise<{ exerciseId: string; setCount: number; volume: number }[]> {
      let query = client.from("workouts").select("id").gte("date", dateFrom);
      if (dateTo) query = query.lte("date", dateTo);
      const { data: workouts } = await query;
      if (!workouts || workouts.length === 0) return [];

      const workoutIds = workouts.map((w) => w.id);
      const { data: weRows } = await client
        .from("workout_exercises")
        .select("id, exercise_id")
        .in("workout_id", workoutIds);
      if (!weRows || weRows.length === 0) return [];

      const weIds = weRows.map((we) => we.id);
      const exIdByWeId: Record<string, string> = Object.fromEntries(weRows.map((we) => [we.id, we.exercise_id]));

      const { data: setRows } = await client
        .from("sets")
        .select("workout_exercise_id, weight, reps")
        .in("workout_exercise_id", weIds)
        .eq("is_complete", true)
        .eq("is_warmup", false);

      const byExercise: Record<string, { setCount: number; volume: number }> = {};
      for (const s of setRows ?? []) {
        const exId = exIdByWeId[s.workout_exercise_id];
        if (!exId) continue;
        if (!byExercise[exId]) byExercise[exId] = { setCount: 0, volume: 0 };
        byExercise[exId]!.setCount++;
        byExercise[exId]!.volume += (s.weight ?? 0) * (s.reps ?? 0);
      }

      return Object.entries(byExercise).map(([exerciseId, vals]) => ({ exerciseId, ...vals }));
    },

    /**
     * Sets completados y volumen (peso × reps) agregados por fecha de
     * entrenamiento (no por ejercicio), a través de TODOS los ejercicios,
     * desde `dateFrom` en adelante — usado por el tab Progreso para la racha
     * de días consecutivos, las cifras de cabecera del periodo elegido y el
     * gráfico de tendencia de volumen semanal (todo derivado de esta única
     * serie diaria).
     */
    async getDailyTraining(dateFrom: string): Promise<{ date: string; setCount: number; volume: number }[]> {
      const { data: workouts } = await client.from("workouts").select("id, date").gte("date", dateFrom);
      if (!workouts || workouts.length === 0) return [];

      const workoutIds = workouts.map((w) => w.id);
      const dateByWorkoutId: Record<string, string> = Object.fromEntries(workouts.map((w) => [w.id, w.date]));
      const { data: weRows } = await client
        .from("workout_exercises")
        .select("id, workout_id")
        .in("workout_id", workoutIds);
      if (!weRows || weRows.length === 0) return [];

      const weIds = weRows.map((we) => we.id);
      const dateByWeId: Record<string, string> = Object.fromEntries(
        weRows.map((we) => [we.id, dateByWorkoutId[we.workout_id]!])
      );

      const { data: setRows } = await client
        .from("sets")
        .select("workout_exercise_id, weight, reps")
        .in("workout_exercise_id", weIds)
        .eq("is_complete", true)
        .eq("is_warmup", false);

      const byDate: Record<string, { setCount: number; volume: number }> = {};
      for (const s of setRows ?? []) {
        const date = dateByWeId[s.workout_exercise_id];
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { setCount: 0, volume: 0 };
        byDate[date]!.setCount++;
        byDate[date]!.volume += (s.weight ?? 0) * (s.reps ?? 0);
      }

      return Object.entries(byDate)
        .map(([date, vals]) => ({ date, ...vals }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

export type ProgressRepository = ReturnType<typeof createProgressRepository>;

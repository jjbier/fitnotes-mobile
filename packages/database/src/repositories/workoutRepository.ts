/**
 * Repositorio remoto del núcleo de entrenamiento: workouts → workout_exercises
 * → sets, más utilidades de copiado, compartir como texto, import/export CSV
 * y borrado masivo de historial. Es el repositorio con más superficie —
 * usado por web para todo el CRUD de entrenamiento y por mobile solo para
 * las operaciones analíticas/CSV fuera de alcance offline.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";

type Client = SupabaseClient<Database>;
type WorkoutInsert = Database["public"]["Tables"]["workouts"]["Insert"];
type WorkoutUpdate = Database["public"]["Tables"]["workouts"]["Update"];
type WorkoutExerciseInsert = Database["public"]["Tables"]["workout_exercises"]["Insert"];
type SetInsert = Database["public"]["Tables"]["sets"]["Insert"];
type SetUpdate = Database["public"]["Tables"]["sets"]["Update"];

export function createWorkoutRepository(client: Client) {
  return {
    // ─── Workouts ──────────────────────────────────────────────────────────────

    /** Entrenamiento de una fecha exacta; si hay duplicados (sin constraint UNIQUE, ver comentario abajo) devuelve el más antiguo por `created_at`. */
    async getWorkoutByDate(date: string) {
      // No hay constraint UNIQUE(user_id, date) en DB — .maybeSingle() lanzaría error
      // si alguna vez hay más de una fila para la fecha (p.ej. doble clic en "Iniciar
      // entrenamiento" bajo latencia). Tomamos la más antigua y toleramos duplicados.
      const { data, error } = await client
        .from("workouts")
        .select("*")
        .eq("date", date)
        .order("created_at", { ascending: true })
        .limit(1);
      return { data: data?.[0] ?? null, error };
    },

    /** Últimos `limit` entrenamientos, más recientes primero. */
    async getWorkouts(limit = 30) {
      return client
        .from("workouts")
        .select("*")
        .order("date", { ascending: false })
        .limit(limit);
    },

    /** Últimos `limit` entrenamientos con número de ejercicios y volumen total (peso × reps de sets completos, no warmup) calculado en memoria. */
    async getWorkoutsWithSummary(limit = 10): Promise<{
      data: { id: string; date: string; exerciseCount: number; volume: number }[];
    }> {
      const { data: workouts } = await client
        .from("workouts")
        .select("id, date")
        .order("date", { ascending: false })
        .limit(limit);
      if (!workouts?.length) return { data: [] };
      const ids = workouts.map((w) => w.id);

      const { data: weData } = await client
        .from("workout_exercises")
        .select("id, workout_id")
        .in("workout_id", ids);

      const exerciseCount: Record<string, number> = {};
      const weToWorkout = new Map<string, string>();
      for (const we of weData ?? []) {
        exerciseCount[we.workout_id] = (exerciseCount[we.workout_id] ?? 0) + 1;
        weToWorkout.set(we.id, we.workout_id);
      }

      const weIds = [...weToWorkout.keys()];
      const volumeByWorkout: Record<string, number> = {};
      if (weIds.length > 0) {
        const { data: setsData } = await client
          .from("sets")
          .select("workout_exercise_id, weight, reps")
          .in("workout_exercise_id", weIds)
          .eq("is_complete", true)
          .eq("is_warmup", false);
        for (const s of setsData ?? []) {
          const wId = weToWorkout.get(s.workout_exercise_id);
          if (!wId || !s.weight || !s.reps) continue;
          volumeByWorkout[wId] = (volumeByWorkout[wId] ?? 0) + s.weight * s.reps;
        }
      }

      return {
        data: workouts.map((w) => ({
          id: w.id, date: w.date,
          exerciseCount: exerciseCount[w.id] ?? 0,
          volume: volumeByWorkout[w.id] ?? 0,
        })),
      };
    },

    /** Crea un entrenamiento (sin constraint UNIQUE por fecha — ver {@link getWorkoutByDate}). */
    async createWorkout(
      data: { date: string; start_time?: string; comment?: string },
      userId: string
    ) {
      const insert: WorkoutInsert = { ...data, user_id: userId };
      return client.from("workouts").insert(insert).select().single();
    },

    /** Actualiza fecha/horas/duración/comentario de un entrenamiento. */
    async updateWorkout(
      id: string,
      data: { date?: string; start_time?: string; end_time?: string; duration_minutes?: number; comment?: string }
    ) {
      const update: WorkoutUpdate = data;
      return client.from("workouts").update(update).eq("id", id).select().single();
    },

    /** Borra un entrenamiento (cascada limpia sus workout_exercises/sets). */
    async deleteWorkout(id: string) {
      return client.from("workouts").delete().eq("id", id);
    },

    // ─── Workout Exercises ─────────────────────────────────────────────────────

    /** Ejercicios de un entrenamiento, en orden. */
    async getWorkoutExercises(workoutId: string) {
      return client
        .from("workout_exercises")
        .select("*")
        .eq("workout_id", workoutId)
        .order("order_index", { ascending: true });
    },

    /** Añade un ejercicio a un entrenamiento; `group_id`/`group_name` opcionales lo agrupan como superset. */
    async addExercise(
      data: {
        workout_id: string;
        exercise_id: string;
        order_index: number;
        group_id?: string;
        group_name?: string;
      },
      userId: string
    ) {
      const insert: WorkoutExerciseInsert = { ...data, user_id: userId };
      return client.from("workout_exercises").insert(insert).select().single();
    },

    /** Quita un ejercicio de un entrenamiento (cascada limpia sus sets). */
    async removeExercise(id: string) {
      return client.from("workout_exercises").delete().eq("id", id);
    },

    /** Cambia el grupo/superset de un ejercicio de entrenamiento. */
    async updateWorkoutExercise(id: string, patch: { group_id?: string | null; group_name?: string | null }) {
      return client.from("workout_exercises").update(patch).eq("id", id);
    },

    /** Renombra un grupo/superset entero por `group_id`; nombre vacío lo limpia a `null`. */
    async updateGroupName(groupId: string, name: string) {
      return client
        .from("workout_exercises")
        .update({ group_name: name || null })
        .eq("group_id", groupId);
    },

    /** Reordena los ejercicios de un entrenamiento (una UPDATE por fila, en paralelo). */
    async reorderExercises(updates: { id: string; order_index: number }[]) {
      return Promise.all(
        updates.map(({ id, order_index }) =>
          client.from("workout_exercises").update({ order_index }).eq("id", id)
        )
      );
    },

    /**
     * Copia los ejercicios (y sus sets, marcados como no completados) de un
     * entrenamiento origen a uno destino, insertando secuencialmente a partir
     * de `startOrderIndex` y omitiendo ejercicios ya presentes en destino
     * (`existingExerciseIds`) para no duplicar.
     */
    async copyWorkout(
      sourceWorkoutId: string,
      targetWorkoutId: string,
      userId: string,
      existingExerciseIds: string[],
      startOrderIndex: number
    ): Promise<void> {
      const { data: sourceExercises } = await client
        .from("workout_exercises")
        .select("*")
        .eq("workout_id", sourceWorkoutId)
        .order("order_index", { ascending: true });

      if (!sourceExercises?.length) return;

      const existingSet = new Set(existingExerciseIds);
      let orderIndex = startOrderIndex;

      for (const we of sourceExercises) {
        if (existingSet.has(we.exercise_id)) continue;

        const insert: WorkoutExerciseInsert = {
          workout_id: targetWorkoutId,
          exercise_id: we.exercise_id,
          order_index: orderIndex++,
          group_id: we.group_id ?? null,
          group_name: we.group_name ?? null,
          user_id: userId,
        };
        const { data: newWe } = await client
          .from("workout_exercises")
          .insert(insert)
          .select()
          .single();

        if (!newWe) continue;

        const { data: sourceSets } = await client
          .from("sets")
          .select("*")
          .eq("workout_exercise_id", we.id)
          .order("order_index", { ascending: true });

        if (sourceSets?.length) {
          const setInserts: SetInsert[] = sourceSets.map((s) => ({
            workout_exercise_id: newWe.id,
            order_index: s.order_index,
            weight: s.weight,
            reps: s.reps,
            distance: s.distance,
            time_seconds: s.time_seconds,
            is_complete: false,
            is_warmup: s.is_warmup ?? false,
            user_id: userId,
          }));
          await client.from("sets").insert(setInserts);
        }
      }
    },

    /** Reprograma un entrenamiento a otra fecha. */
    async moveWorkout(workoutId: string, targetDate: string) {
      return client
        .from("workouts")
        .update({ date: targetDate })
        .eq("id", workoutId)
        .select()
        .single();
    },

    // ─── Sets ──────────────────────────────────────────────────────────────────

    /** Sets de un ejercicio de entrenamiento, en orden. */
    async getSets(workoutExerciseId: string) {
      return client
        .from("sets")
        .select("*")
        .eq("workout_exercise_id", workoutExerciseId)
        .order("order_index", { ascending: true });
    },

    /** Crea un set (por defecto no completado — ver {@link updateSet} para marcarlo). */
    async createSet(
      data: {
        workout_exercise_id: string;
        order_index: number;
        weight?: number;
        reps?: number;
        distance?: number;
        time_seconds?: number;
      },
      userId: string
    ) {
      const insert: SetInsert = { ...data, user_id: userId };
      return client.from("sets").insert(insert).select().single();
    },

    /** Actualiza un set; marcarlo `is_complete=true` remoto dispara el trigger SQL que actualiza `personal_records` (ver CLAUDE.md). */
    async updateSet(
      id: string,
      data: {
        weight?: number;
        reps?: number;
        distance?: number;
        time_seconds?: number;
        is_complete?: boolean;
        is_warmup?: boolean;
        comment?: string;
      }
    ) {
      const update: SetUpdate = data;
      return client.from("sets").update(update).eq("id", id).select().single();
    },

    /** Borra un set. */
    async deleteSet(id: string) {
      return client.from("sets").delete().eq("id", id);
    },

    /** Reordena los sets de un ejercicio de entrenamiento (una UPDATE por fila, en paralelo). */
    async reorderSets(updates: { id: string; order_index: number }[]) {
      return Promise.all(
        updates.map(({ id, order_index }) =>
          client.from("sets").update({ order_index }).eq("id", id)
        )
      );
    },

    // ─── Share ─────────────────────────────────────────────────────────────────

    /** Formatea un entrenamiento completo (fecha, ejercicios, sets) como texto plano legible, para compartir fuera de la app. */
    async shareWorkout(workoutId: string): Promise<string> {
      const [workoutRes, exercisesRes] = await Promise.all([
        client.from("workouts").select("*").eq("id", workoutId).single(),
        client
          .from("workout_exercises")
          .select("*")
          .eq("workout_id", workoutId)
          .order("order_index", { ascending: true }),
      ]);

      if (!workoutRes.data || !exercisesRes.data) return "";

      const exerciseIds = exercisesRes.data.map((we) => we.exercise_id);
      const [namesRes, setsRes] = await Promise.all([
        client.from("exercises").select("id,name").in("id", exerciseIds),
        client
          .from("sets")
          .select("*")
          .in(
            "workout_exercise_id",
            exercisesRes.data.map((we) => we.id)
          )
          .order("order_index", { ascending: true }),
      ]);

      const nameMap: Record<string, string> = {};
      for (const ex of namesRes.data ?? []) nameMap[ex.id] = ex.name;

      const setsByWE: Record<string, typeof setsRes.data> = {};
      for (const s of setsRes.data ?? []) {
        if (!setsByWE[s.workout_exercise_id]) setsByWE[s.workout_exercise_id] = [];
        setsByWE[s.workout_exercise_id]!.push(s);
      }

      const lines: string[] = [`Workout — ${workoutRes.data.date}`];
      for (const we of exercisesRes.data) {
        const name = nameMap[we.exercise_id] ?? we.exercise_id;
        lines.push(name);
        const weSets = setsByWE[we.id] ?? [];
        weSets.forEach((s, i) => {
          const parts: string[] = [];
          if (s.weight != null && s.reps != null) parts.push(`${s.weight}kg × ${s.reps}`);
          else if (s.reps != null) parts.push(`${s.reps} reps`);
          else if (s.distance != null && s.time_seconds != null)
            parts.push(`${s.distance}m in ${s.time_seconds}s`);
          else if (s.distance != null) parts.push(`${s.distance}m`);
          else if (s.time_seconds != null) parts.push(`${s.time_seconds}s`);
          lines.push(`  Set ${i + 1}: ${parts.join(", ") || "—"}`);
        });
      }
      return lines.join("\n");
    },

    /** Sets de la última vez (distinta del entrenamiento actual) que se hizo un ejercicio — usado para prellenar/sugerir valores al añadirlo de nuevo. */
    async getLastSessionSets(exerciseId: string, currentWorkoutId: string) {
      const { data: wes } = await client
        .from("workout_exercises")
        .select("id, workout_id")
        .eq("exercise_id", exerciseId)
        .neq("workout_id", currentWorkoutId);

      if (!wes || wes.length === 0) return [];

      const { data: workoutsData } = await client
        .from("workouts")
        .select("id, date")
        .in("id", wes.map((we) => we.workout_id))
        .order("date", { ascending: false })
        .limit(1);

      const latest = workoutsData?.[0];
      if (!latest) return [];

      const latestWe = wes.find((we) => we.workout_id === latest.id);
      if (!latestWe) return [];

      const { data: sets } = await client
        .from("sets")
        .select("weight, reps, distance, time_seconds, order_index")
        .eq("workout_exercise_id", latestWe.id)
        .order("order_index", { ascending: true });

      return sets ?? [];
    },

    /** Para cada ejercicio dado: fecha del entrenamiento más reciente en que aparece, y peso/reps máximos y nº de sets completados (no warmup) de esa sesión. Usado por la búsqueda global. */
    async getLastWorkoutByExercises(exerciseIds: string[]): Promise<Record<string, { date: string; maxWeight: number; maxReps: number; setCount: number }>> {
      if (exerciseIds.length === 0) return {};
      const { data } = await client
        .from("workout_exercises")
        .select("exercise_id, workouts!inner(date), sets(weight, reps, is_complete, is_warmup)")
        .in("exercise_id", exerciseIds);
      if (!data) return {};
      const result: Record<string, { date: string; maxWeight: number; maxReps: number; setCount: number }> = {};
      for (const we of data) {
        const exId = we.exercise_id;
        const date = (we.workouts as { date: string }).date;
        if (result[exId] && result[exId]!.date >= date) continue;
        const completedSets = ((we.sets ?? []) as Array<{ weight: number | null; reps: number | null; is_complete: boolean; is_warmup: boolean | null }>)
          .filter((s) => s.is_complete && !s.is_warmup);
        result[exId] = {
          date,
          maxWeight: completedSets.length ? Math.max(...completedSets.map((s) => s.weight ?? 0)) : 0,
          maxReps: completedSets.length ? Math.max(...completedSets.map((s) => s.reps ?? 0)) : 0,
          setCount: completedSets.length,
        };
      }
      return result;
    },

    /**
     * Importa entrenamientos desde filas de CSV ya parseadas: agrupa por fecha y,
     * dentro de cada fecha, por nombre de ejercicio (preservando el orden de
     * aparición); crea ejercicios nuevos sobre la marcha si el nombre no existe
     * (case-insensitive) por defecto como `WEIGHT_REPS`/kg. Si ya existe un
     * entrenamiento en una fecha del CSV, esa fecha entera se omite (`skipped`)
     * para no duplicar — no hace merge parcial.
     */
    async importFromCSV(
      rows: Array<{
        date: string;
        exerciseName: string;
        weight?: number;
        reps?: number;
        distance?: number;
        timeSecs?: number;
        comment?: string;
        isComplete: boolean;
        isWarmup: boolean;
      }>,
      userId: string
    ): Promise<{ imported: number; skipped: number; newExercises: number }> {
      if (rows.length === 0) return { imported: 0, skipped: 0, newExercises: 0 };

      // Build name → id map from existing exercises
      const { data: exData } = await client.from("exercises").select("id, name").eq("user_id", userId);
      const nameToId = new Map<string, string>((exData ?? []).map((e) => [e.name.toLowerCase(), e.id]));
      let newExercises = 0;

      // Get exercise or create it
      async function resolveExercise(name: string): Promise<string> {
        const key = name.toLowerCase();
        if (nameToId.has(key)) return nameToId.get(key)!;
        const { data } = await client
          .from("exercises")
          .insert({ name, type: "WEIGHT_REPS", weight_unit: "kg", is_favorite: false, user_id: userId })
          .select("id")
          .single();
        if (data?.id) { nameToId.set(key, data.id); newExercises++; return data.id; }
        return name;
      }

      // Group by date
      const byDate = new Map<string, typeof rows>();
      for (const row of rows) {
        if (!row.date || !row.exerciseName) continue;
        if (!byDate.has(row.date)) byDate.set(row.date, []);
        byDate.get(row.date)!.push(row);
      }

      // Get existing workouts for those dates to avoid duplicates
      const dates = [...byDate.keys()];
      const { data: existingWorkouts } = await client
        .from("workouts")
        .select("id, date")
        .in("date", dates)
        .eq("user_id", userId);
      const existingDates = new Set((existingWorkouts ?? []).map((w) => w.date));

      let imported = 0;
      let skipped = 0;

      for (const [date, dateRows] of byDate) {
        if (existingDates.has(date)) { skipped += dateRows.length; continue; }

        const { data: workout } = await client
          .from("workouts")
          .insert({ date, user_id: userId })
          .select("id")
          .single();
        if (!workout?.id) continue;

        // Group by exercise within this date (preserve order)
        const exOrder: string[] = [];
        const byEx = new Map<string, typeof rows>();
        for (const row of dateRows) {
          const key = row.exerciseName;
          if (!byEx.has(key)) { exOrder.push(key); byEx.set(key, []); }
          byEx.get(key)!.push(row);
        }

        let exIdx = 0;
        for (const exName of exOrder) {
          const exId = await resolveExercise(exName);
          const { data: we } = await client
            .from("workout_exercises")
            .insert({ workout_id: workout.id, exercise_id: exId, order_index: exIdx, user_id: userId })
            .select("id")
            .single();
          if (!we?.id) continue;
          exIdx++;

          const exRows = byEx.get(exName) ?? [];
          const setInserts: SetInsert[] = exRows.map((r, i) => ({
            workout_exercise_id: we.id,
            order_index: i,
            weight: r.weight ?? null,
            reps: r.reps ?? null,
            distance: r.distance ?? null,
            time_seconds: r.timeSecs ?? null,
            is_complete: r.isComplete,
            is_warmup: r.isWarmup,
            comment: r.comment ?? null,
            user_id: userId,
          }));
          if (setInserts.length > 0) {
            await client.from("sets").insert(setInserts);
          }
          imported += exRows.length;
        }
      }
      return { imported, skipped, newExercises };
    },

    /** Exporta TODO el historial de entrenamientos del usuario a CSV (`Date,Exercise,Weight,Reps,Distance,Time,Comment,Completed,Warmup`), una fila por set (o una fila vacía de sets si el ejercicio no tiene ninguno). Comas en comentarios se sustituyen por `;` para no romper el CSV. */
    async exportAllCSV(): Promise<string> {
      const { data: workoutsData } = await client
        .from("workouts")
        .select("id, date, comment")
        .order("date", { ascending: true });
      if (!workoutsData || workoutsData.length === 0) return "";

      const { data: wesData } = await client
        .from("workout_exercises")
        .select("id, workout_id, exercise_id, order_index")
        .in("workout_id", workoutsData.map((w) => w.id))
        .order("order_index", { ascending: true });
      if (!wesData || wesData.length === 0) return "";

      const exerciseIds = [...new Set(wesData.map((we) => we.exercise_id))];
      const [exRes, setsRes] = await Promise.all([
        client.from("exercises").select("id, name").in("id", exerciseIds),
        client
          .from("sets")
          .select("workout_exercise_id, weight, reps, distance, time_seconds, comment, is_complete, is_warmup, order_index")
          .in("workout_exercise_id", wesData.map((we) => we.id))
          .order("order_index", { ascending: true }),
      ]);

      const nameMap: Record<string, string> = {};
      for (const ex of exRes.data ?? []) nameMap[ex.id] = ex.name;

      const setsByWE: Record<string, NonNullable<typeof setsRes.data>[number][]> = {};
      for (const s of setsRes.data ?? []) {
        if (!setsByWE[s.workout_exercise_id]) setsByWE[s.workout_exercise_id] = [];
        setsByWE[s.workout_exercise_id]!.push(s);
      }

      const workoutById: Record<string, { date: string; comment: string | null }> = {};
      for (const w of workoutsData) workoutById[w.id] = { date: w.date, comment: w.comment };

      const rows: string[] = ["Date,Exercise,Weight,Reps,Distance,Time,Comment,Completed,Warmup"];
      for (const we of wesData) {
        const workout = workoutById[we.workout_id];
        if (!workout) continue;
        const exName = nameMap[we.exercise_id] ?? we.exercise_id;
        const weSets = setsByWE[we.id] ?? [];
        if (weSets.length === 0) {
          rows.push([workout.date, exName, "", "", "", "", workout.comment ?? "", ""].join(","));
        } else {
          for (const s of weSets) {
            const comment = (s.comment ?? workout.comment ?? "").replace(/,/g, ";");
            rows.push([
              workout.date, exName,
              s.weight ?? "", s.reps ?? "",
              s.distance ?? "", s.time_seconds ?? "",
              comment, s.is_complete ? "1" : "0",
              s.is_warmup ? "1" : "0",
            ].join(","));
          }
        }
      }
      return rows.join("\n");
    },

    /**
     * Borra historial de entrenamiento con filtros combinables de rango de fecha
     * y/o ejercicio concreto. Sin `exerciseId`: borra los entrenamientos enteros
     * del rango. Con `exerciseId`: borra solo ese `workout_exercises` (y sus sets
     * en cascada) dentro del rango, y además elimina los entrenamientos que
     * quedan sin ningún ejercicio tras la operación.
     * @returns número de entrenamientos borrados (sin `exerciseId`) o de filas
     * de `workout_exercises` borradas (con `exerciseId`).
     */
    async deleteWorkoutHistory(
      userId: string,
      opts: { dateFrom?: string; dateTo?: string; exerciseId?: string }
    ): Promise<number> {
      let workoutIdsQuery = client.from("workouts").select("id").eq("user_id", userId);
      if (opts.dateFrom) workoutIdsQuery = workoutIdsQuery.gte("date", opts.dateFrom);
      if (opts.dateTo) workoutIdsQuery = workoutIdsQuery.lte("date", opts.dateTo);
      const { data: workouts } = await workoutIdsQuery;
      const workoutIds = (workouts ?? []).map((w) => w.id);
      if (workoutIds.length === 0) return 0;

      if (opts.exerciseId) {
        const { data: wes } = await client
          .from("workout_exercises")
          .select("id, workout_id")
          .eq("exercise_id", opts.exerciseId)
          .in("workout_id", workoutIds);
        const matched = wes ?? [];
        if (matched.length === 0) return 0;

        const weIds = matched.map((w) => w.id);
        await client.from("workout_exercises").delete().in("id", weIds);

        // Clean up workouts left with no exercises after this deletion
        const affectedWorkoutIds = [...new Set(matched.map((w) => w.workout_id))];
        const { data: remaining } = await client
          .from("workout_exercises")
          .select("workout_id")
          .in("workout_id", affectedWorkoutIds);
        const stillHas = new Set((remaining ?? []).map((r) => r.workout_id));
        const emptyWorkoutIds = affectedWorkoutIds.filter((id) => !stillHas.has(id));
        if (emptyWorkoutIds.length > 0) {
          await client.from("workouts").delete().in("id", emptyWorkoutIds);
        }
        return weIds.length;
      }

      await client.from("workouts").delete().in("id", workoutIds);
      return workoutIds.length;
    },
  };
}

export type WorkoutRepository = ReturnType<typeof createWorkoutRepository>;

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NestableScrollContainer, NestableDraggableFlatList, ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useWorkoutStore, useExerciseStore, usePreferencesStore, formatWorkoutDate, todayISO, ExerciseType, formatClockDuration } from "@fitnotes/core";
import type { WorkoutExercise, RoutineDay } from "@fitnotes/core";
import { EPHEMERAL_KEY_PREFIX } from "@fitnotes/database";
import { useSyncStatus } from "../../contexts/SyncContext";
import { useRepositories } from "../../contexts/RepositoryContext";
import DateInput from "../../components/DateInput";
import { useTheme } from "../../lib/theme";

/**
 * Tab Hoy ("Home"): entrenamiento activo del día seleccionado, con
 * navegación entre días (flechas, franja semanal con racha) y todo el ciclo
 * de vida del entrenamiento. Soporta:
 * - Iniciar entrenamiento desde una rutina (registra todos sus ejercicios y
 *   series predefinidas) o vacío; copiar ejercicios desde un entrenamiento
 *   anterior; mover un entrenamiento a otra fecha.
 * - Reordenar ejercicios del entrenamiento por drag&drop
 *   (`NestableDraggableFlatList`), con indicador visual de supersets
 *   agrupados (`group_id`).
 * - Selección múltiple de ejercicios del entrenamiento para borrado masivo.
 * - Temporizador de duración del entrenamiento (play/pause), guardando
 *   `start_time`/`end_time`/`duration_minutes` al finalizar.
 * - Resumen final (duración, ejercicios, series, volumen) al finalizar el
 *   entrenamiento.
 * - "+ Nuevo" para añadir un entrenamiento adicional el mismo día, visible
 *   solo cuando el activo ya ha finalizado.
 * - Recarga automática cuando `refetchSignal` indica que un sync trajo
 *   entrenamientos nuevos (p.ej. historial de una cuenta recién vinculada).
 */

/** Estado efímero del cronómetro persistido en `user_preferences` (ver {@link timerStorageKey}). */
type PersistedTimerState = { accumulatedSeconds: number; runningSince: string | null };

/**
 * Clave de `user_preferences` para el estado del cronómetro de un
 * entrenamiento — persistido para que sobreviva a que la app muera a mitad
 * de sesión (el `ref` en memoria se pierde en el relanzamiento, pero
 * `runningSince` es un timestamp absoluto: al restaurar, el tiempo "muerto"
 * mientras la app estaba cerrada se cuenta igualmente como transcurrido).
 */
function timerStorageKey(workoutId: string) {
  return `${EPHEMERAL_KEY_PREFIX}active_timer:${workoutId}`;
}

export default function HomeScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ date?: string; workoutId?: string }>();
  const today = todayISO();

  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const workoutExercises = useWorkoutStore((s) => s.exercises);
  const sets = useWorkoutStore((s) => s.sets);
  const workouts = useWorkoutStore((s) => s.workouts);
  const isLoading = useWorkoutStore((s) => s.isLoading);
  const loadWorkout = useWorkoutStore((s) => s.loadWorkout);
  const loadWorkouts = useWorkoutStore((s) => s.loadWorkouts);
  const addWorkoutToHistory = useWorkoutStore((s) => s.addWorkoutToHistory);
  const startWorkout = useWorkoutStore((s) => s.startWorkout);
  const removeExerciseFromWorkout = useWorkoutStore((s) => s.removeExerciseFromWorkout);
  const reorderExercises = useWorkoutStore((s) => s.reorderExercises);
  const addExerciseToWorkout = useWorkoutStore((s) => s.addExerciseToWorkout);
  const removeWorkoutFromHistory = useWorkoutStore((s) => s.removeWorkoutFromHistory);
  const finishWorkout = useWorkoutStore((s) => s.finishWorkout);
  const setLoading = useWorkoutStore((s) => s.setLoading);
  const setWorkoutComment = useWorkoutStore((s) => s.setWorkoutComment);
  const setWorkoutStartTime = useWorkoutStore((s) => s.setWorkoutStartTime);

  const exercises = useExerciseStore((s) => s.exercises);
  const loadExercises = useExerciseStore((s) => s.loadExercises);

  const [currentDate, setCurrentDate] = useState(params.date || today);
  const [workoutComment, setWorkoutCommentLocal] = useState("");
  const [timerDisplay, setTimerDisplay] = useState(0);
  const [timerState, setTimerState] = useState<"idle" | "running" | "paused">("idle");
  const timerElapsedRef = useRef(0);
  const timerSegmentStartRef = useRef<number | null>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [startRoutines, setStartRoutines] = useState<{ id: string; name: string; notes?: string | null }[]>([]);
  const [startModalLoading, setStartModalLoading] = useState(false);
  const [loggingRoutineId, setLoggingRoutineId] = useState<string | null>(null);
  const [routineDaysToPick, setRoutineDaysToPick] = useState<{ routineId: string; routineName: string; days: RoutineDay[] } | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [moveConflict, setMoveConflict] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryStats, setSummaryStats] = useState<{ duration: number; exercises: number; sets: number; volume: number } | null>(null);
  const [recentSummaries, setRecentSummaries] = useState<Record<string, { exerciseCount: number; volume: number }>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selectedWEIds, setSelectedWEIds] = useState<Set<string>>(new Set());
  const { status: syncStatus, pendingCount, refetchSignal } = useSyncStatus();

  const { workoutRepo: repo, exerciseRepo: exRepo, routineRepo, userId, preferencesRepo } = useRepositories();
  const showSetCountHome = usePreferencesStore((s) => s.preferences.show_set_count_home);

  /** Carga en el store un entrenamiento ya resuelto por id, junto con sus ejercicios y series. */
  const loadWorkoutById = useCallback(async (workoutId: string) => {
    const { data: workout } = await repo.getWorkout(workoutId);
    if (!workout) return;
    const { data: wExercises } = await repo.getWorkoutExercises(workout.id);
    const setsMap: Record<string, Parameters<typeof loadWorkout>[2][string]> = {};
    for (const we of wExercises ?? []) {
      const { data: wSets } = await repo.getSets(we.id);
      setsMap[we.id] = (wSets ?? []).map((s) => ({
        id: s.id, workout_exercise_id: s.workout_exercise_id,
        weight: s.weight ?? undefined, reps: s.reps ?? undefined,
        distance: s.distance ?? undefined, time_seconds: s.time_seconds ?? undefined,
        is_complete: s.is_complete, is_warmup: s.is_warmup ?? false, comment: s.comment ?? undefined, order_index: s.order_index,
      }));
    }
    loadWorkout(
      { id: workout.id, date: workout.date, comment: workout.comment ?? undefined, start_time: workout.start_time ?? undefined, end_time: workout.end_time ?? undefined },
      (wExercises ?? []).map((we) => ({ id: we.id, workout_id: we.workout_id, exercise_id: we.exercise_id, order_index: we.order_index, group_id: we.group_id ?? undefined, group_name: we.group_name ?? undefined })),
      setsMap
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Carga el entrenamiento de `date` sin preguntar nunca: si no hay ninguno,
   * deja el store vacío (aparece la opción de iniciar uno); si hay alguno, carga
   * el primero (por hora) directo — ver un día con varios entrenamientos se
   * hace desde el Calendario (lista cada uno con su hora y navega directo por
   * id), no desde esta pantalla.
   */
  const loadWorkoutForDate = useCallback(async (date: string) => {
    const { data } = await repo.getWorkoutsByDate(date);
    const workouts = data ?? [];
    if (workouts.length === 0) {
      loadWorkout({ id: "", date }, [], {});
      return;
    }
    const targetId = workouts[0]!.id;
    // Si ya es el entrenamiento activo, no recargar desde SQLite: pisaría con datos
    // obsoletos ediciones optimistas (peso/reps/etc.) cuya escritura en BD aún esté en
    // vuelo (fire-and-forget) al volver a esta pantalla — p.ej. justo tras registrar
    // una serie y salir del detalle del ejercicio.
    if (useWorkoutStore.getState().activeWorkout?.id === targetId) return;
    await loadWorkoutById(targetId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadWorkoutById]);

  /** Carga los últimos 60 entrenamientos (para racha/franja semanal/copiar) y sus resúmenes (nº ejercicios, volumen) para "Actividad reciente". */
  const loadRecentWorkouts = useCallback(async () => {
    const { data: recent } = await repo.getWorkouts(60);
    if (recent) {
      loadWorkouts(recent.map((w) => ({
        id: w.id, date: w.date, comment: w.comment ?? undefined,
        start_time: w.start_time ?? undefined, end_time: w.end_time ?? undefined,
      })));
    }
    const { data: summaries } = await repo.getWorkoutsWithSummary(10);
    const summaryMap: Record<string, { exerciseCount: number; volume: number }> = {};
    for (const s of summaries) summaryMap[s.id] = { exerciseCount: s.exerciseCount, volume: s.volume };
    setRecentSummaries(summaryMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const [catRes, exRes] = await Promise.all([
        exercises.length > 0 ? Promise.resolve({ data: null }) : exRepo.getCategories(),
        exercises.length > 0 ? Promise.resolve({ data: null }) : exRepo.getExercises(),
      ]);
      if (catRes.data && exRes.data) {
        loadExercises(catRes.data, exRes.data.map((ex) => ({
          id: ex.id, name: ex.name, category_id: ex.category_id ?? "",
          type: ex.type as ExerciseType, weight_unit: ex.weight_unit as "kg" | "lb",
          notes: ex.notes ?? undefined, is_favorite: ex.is_favorite, created_at: ex.created_at,
          demo_url: ex.demo_url ?? undefined,
        })));
      }
      await loadRecentWorkouts();
      // Si venimos del calendario con un workoutId concreto (varios ese día,
      // ya elegido allí), cargarlo directo evita volver a preguntar aquí.
      if (params.workoutId) {
        await loadWorkoutById(params.workoutId);
      } else {
        await loadWorkoutForDate(params.date || today);
      }
      setLoading(false);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un pull de sync trae workouts nuevos (p.ej. historial de una cuenta recién
  // vinculada) — sin esto, "Actividad reciente" y la racha solo reflejaban lo
  // que había en local al montar la pantalla, hasta el siguiente reinicio.
  useEffect(() => {
    if (refetchSignal === 0) return;
    loadWorkoutForDate(currentDate);
    void loadRecentWorkouts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchSignal]);

  // Navegación desde Calendario ("Ver →" o un entrenamiento concreto de la lista
  // multi-día) — la tab ya montada solo recibe params nuevos. Con `workoutId` (varios
  // entrenamientos ese día, ya elegido en Calendario) carga ese directo, sin volver a
  // preguntar; solo con `date` sigue el flujo normal de `loadWorkoutForDate`.
  useEffect(() => {
    if (params.workoutId) {
      if (params.date) setCurrentDate(params.date);
      loadWorkoutById(params.workoutId);
    } else if (params.date && params.date !== currentDate) {
      setCurrentDate(params.date);
      loadWorkoutForDate(params.date);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.date, params.workoutId]);

  // Recarga al recuperar el foco (p.ej. volviendo de Herramientas/Rutinas tras crear
  // un entrenamiento desde ahí) — sin esto, esta tab se queda mostrando lo que había
  // al montarse hasta el próximo reinicio de la app, aunque los datos ya cambiaron.
  useFocusEffect(
    useCallback(() => {
      loadWorkoutForDate(currentDate);
      void loadRecentWorkouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate])
  );

  // Sync local comment with store
  useEffect(() => {
    setWorkoutCommentLocal(activeWorkout?.comment ?? "");
  }, [activeWorkout?.id]);

  // Comprueba en cada cambio de fecha destino si ya hay otro entrenamiento ese día (mismo patrón que `MoveWorkoutModal` en web).
  useEffect(() => {
    if (!showMoveModal || !moveDate || moveDate === activeWorkout?.date) { setMoveConflict(false); return; }
    let cancelled = false;
    repo.getWorkoutByDate(moveDate).then(({ data }) => { if (!cancelled) setMoveConflict(!!data); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveDate, showMoveModal]);

  // Reset timer when workout changes, restaurando el estado persistido si lo
  // hay (el entrenamiento tenía el cronómetro en marcha o en pausa cuando la
  // app murió o se cerró) en vez de asumir siempre 0/idle.
  useEffect(() => {
    if (durationRef.current) clearInterval(durationRef.current);
    setTimerDisplay(0);
    setTimerState("idle");
    timerElapsedRef.current = 0;
    timerSegmentStartRef.current = null;
    const workoutId = activeWorkout?.id;
    if (!workoutId || activeWorkout?.end_time) return;
    let cancelled = false;
    preferencesRepo.getRaw(timerStorageKey(workoutId)).then((raw) => {
      if (cancelled || !raw) return;
      const persisted = JSON.parse(raw) as PersistedTimerState;
      timerElapsedRef.current = persisted.accumulatedSeconds;
      if (persisted.runningSince) {
        timerSegmentStartRef.current = new Date(persisted.runningSince).getTime();
        setTimerState("running");
      } else if (persisted.accumulatedSeconds > 0) {
        setTimerDisplay(persisted.accumulatedSeconds);
        setTimerState("paused");
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout?.id]);

  // Tick every second when running
  useEffect(() => {
    if (durationRef.current) clearInterval(durationRef.current);
    if (timerState !== "running") return;
    const tick = () => {
      const segmentMs = timerSegmentStartRef.current !== null ? Date.now() - timerSegmentStartRef.current : 0;
      setTimerDisplay(timerElapsedRef.current + Math.floor(segmentMs / 1000));
    };
    tick();
    durationRef.current = setInterval(tick, 1000);
    return () => { if (durationRef.current) clearInterval(durationRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerState]);

  /**
   * Persiste el estado actual del cronómetro (segundos acumulados + desde
   * cuándo corre el segmento activo, si corre) para poder recuperarlo si la
   * app muere a mitad de entrenamiento — ver {@link timerStorageKey}.
   */
  async function persistTimerState(workoutId: string, running: boolean) {
    const state: PersistedTimerState = {
      accumulatedSeconds: timerElapsedRef.current,
      runningSince: running && timerSegmentStartRef.current !== null ? new Date(timerSegmentStartRef.current).toISOString() : null,
    };
    await preferencesRepo.setRaw(timerStorageKey(workoutId), JSON.stringify(state));
  }

  /** Inicia o reanuda el temporizador del entrenamiento; en el primer arranque persiste `start_time` en el entrenamiento. */
  async function handleStartTimer() {
    if (!activeWorkout?.id) return;
    timerSegmentStartRef.current = Date.now();
    setTimerState("running");
    await persistTimerState(activeWorkout.id, true);
    if (!activeWorkout.start_time) {
      const startTime = new Date().toISOString();
      await repo.updateWorkout(activeWorkout.id, { start_time: startTime });
      setWorkoutStartTime(startTime);
    }
  }

  /** Pausa el temporizador, acumulando el tiempo transcurrido del segmento actual en `timerElapsedRef`. */
  async function handlePauseTimer() {
    if (timerSegmentStartRef.current !== null) {
      timerElapsedRef.current += Math.floor((Date.now() - timerSegmentStartRef.current) / 1000);
      timerSegmentStartRef.current = null;
    }
    if (durationRef.current) clearInterval(durationRef.current);
    setTimerDisplay(timerElapsedRef.current);
    setTimerState("paused");
    if (activeWorkout?.id) await persistTimerState(activeWorkout.id, false);
  }

  /** Abre el modal de "iniciar entrenamiento" y carga la lista de rutinas disponibles para registrar. */
  async function openStartModal() {
    setShowStartModal(true);
    setRoutineDaysToPick(null);
    setStartModalLoading(true);
    const { data } = await routineRepo.getRoutines();
    setStartRoutines(data ?? []);
    setStartModalLoading(false);
  }

  /**
   * Inicia un entrenamiento vacío en la fecha actual, sin pasar por ninguna rutina
   * (paridad con "Iniciar entrenamiento" en web). Siempre crea uno nuevo, sin
   * preguntar ni reutilizar: se llega aquí desde el estado vacío (nada que
   * reutilizar) o desde "+ Nuevo" (que ya significa explícitamente "quiero otro").
   */
  async function handleStartBlankWorkout() {
    setLoggingRoutineId("blank");
    const { data, error } = await repo.createWorkout({ date: currentDate, start_time: new Date().toISOString() }, userId);
    if (error || !data) { setLoggingRoutineId(null); return; }
    addWorkoutToHistory({ id: data.id, date: currentDate });
    await loadWorkoutById(data.id);
    setLoggingRoutineId(null);
    setShowStartModal(false);
  }

  /**
   * Punto de entrada al elegir una rutina en "iniciar entrenamiento": si la
   * rutina tiene un único día lo registra directamente; si tiene varios
   * (p.ej. "Empuje"/"Tirón"/"Pierna") muestra un selector para que el
   * usuario escoja solo el día que corresponde, en vez de mezclar los
   * ejercicios de todos los días en un mismo entrenamiento.
   */
  async function handleLogRoutine(routineId: string) {
    setLoggingRoutineId(routineId);
    const { data: days } = await routineRepo.getDays(routineId);
    if (!days || days.length === 0) {
      Alert.alert(t("workout:alerts.noDaysTitle"), t("workout:alerts.noDaysMessage"));
      setLoggingRoutineId(null);
      return;
    }
    if (days.length === 1) {
      await handleLogRoutineDay(days[0]!.id, routineId);
      return;
    }
    setLoggingRoutineId(null);
    const routine = startRoutines.find((r) => r.id === routineId);
    setRoutineDaysToPick({ routineId, routineName: routine?.name ?? "", days });
  }

  /**
   * Registra un único día de una rutina como un entrenamiento nuevo de la
   * fecha actual (siempre crea uno, sin preguntar ni reutilizar): añade solo
   * los ejercicios de ESE día (no de toda la rutina) y sus series
   * predefinidas, y vuelca el resultado al store como entrenamiento activo.
   */
  async function handleLogRoutineDay(dayId: string, loadingKey: string = dayId) {
    setLoggingRoutineId(loadingKey);
    const { data: dayExs } = await routineRepo.getDayExercises(dayId);
    const dayExercises = (dayExs ?? []).map((rde) => ({ ...rde, group_id: rde.group_id ?? undefined, group_name: rde.group_name ?? undefined }));
    if (dayExercises.length === 0) {
      Alert.alert(t("workout:alerts.noExercisesTitle"), t("workout:alerts.noExercisesMessage"));
      setLoggingRoutineId(null);
      return;
    }
    const { data: workout, error } = await repo.createWorkout({ date: currentDate, start_time: new Date().toISOString() }, userId);
    if (error || !workout) { setLoggingRoutineId(null); return; }
    for (let i = 0; i < dayExercises.length; i++) {
      const rde = dayExercises[i]!;
      const { data: we } = await repo.addExercise(
        { workout_id: workout.id, exercise_id: rde.exercise_id, order_index: i, group_id: rde.group_id, group_name: rde.group_name }, userId
      );
      if (!we) continue;
      const { data: pSets } = await routineRepo.getPredefinedSets(rde.id);
      for (const ps of pSets ?? []) {
        await repo.createSet({
          workout_exercise_id: we.id,
          weight: ps.weight ?? undefined, reps: ps.reps ?? undefined,
          distance: ps.distance ?? undefined, time_seconds: ps.time_seconds ?? undefined,
          order_index: ps.order_index,
        }, userId);
      }
    }
    await loadWorkoutById(workout.id);
    addWorkoutToHistory({ id: workout.id, date: currentDate });
    setLoggingRoutineId(null);
    setRoutineDaysToPick(null);
    setShowStartModal(false);
  }

  /** Cierra el modal de "iniciar entrenamiento" y limpia el selector de días si estaba abierto. */
  function closeStartModal() {
    setShowStartModal(false);
    setRoutineDaysToPick(null);
  }

  /**
   * Pide confirmación y finaliza el entrenamiento activo: detiene el
   * temporizador, persiste `end_time`/`duration_minutes`, calcula el resumen
   * final (series completadas sin calentamiento, volumen total excluyendo
   * calentamiento) para el modal de resumen, y limpia el entrenamiento activo
   * del store.
   */
  async function handleFinish() {
    if (!activeWorkout) return;
    Alert.alert(t("workout:alerts.finishTitle"), t("workout:alerts.finishMessage"), [
      { text: t("common:cancel"), style: "cancel" },
      { text: t("workout:alerts.finishConfirmButton"), onPress: async () => {
        // Snapshot elapsed time before stopping
        if (timerSegmentStartRef.current !== null) {
          timerElapsedRef.current += Math.floor((Date.now() - timerSegmentStartRef.current) / 1000);
          timerSegmentStartRef.current = null;
        }
        if (durationRef.current) clearInterval(durationRef.current);
        setTimerState("idle");
        const endTime = new Date().toISOString();

        // Si el cronómetro manual nunca se inició (p.ej. el usuario no pulsó
        // play, o la app se reinició durante el entrenamiento), su acumulador
        // se queda a 0 y subestimaría la duración real: en ese caso se usa
        // como respaldo el tiempo transcurrido entre start_time y end_time.
        const dur = timerElapsedRef.current > 0 || !activeWorkout.start_time
          ? timerElapsedRef.current
          : Math.round((new Date(endTime).getTime() - new Date(activeWorkout.start_time).getTime()) / 1000);

        await repo.updateWorkout(activeWorkout.id, { end_time: endTime, duration_minutes: Math.round(dur / 60) });
        await preferencesRepo.deleteRaw(timerStorageKey(activeWorkout.id));

        // Compute summary before clearing store (warmup sets excluded from volume)
        const allSets = Object.values(sets).flat();
        const totalSets = allSets.filter((s) => s.is_complete && !s.is_warmup).length;
        const totalVolume = allSets.filter((s) => !s.is_warmup).reduce((acc, s) => acc + (s.weight && s.reps ? s.weight * s.reps : 0), 0);
        setSummaryStats({ duration: dur, exercises: workoutExercises.length, sets: totalSets, volume: totalVolume });
        setShowSummary(true);

        finishWorkout();
      }},
    ]);
  }

  /** Activa/desactiva el modo de selección múltiple de ejercicios del entrenamiento, limpiando la selección al alternar. */
  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedWEIds(new Set());
  }

  /** Añade/quita un `workout_exercise` del conjunto seleccionado en modo selección múltiple. */
  function toggleSelectWE(id: string) {
    setSelectedWEIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** Pide confirmación y elimina en bloque todos los ejercicios (y sus series) seleccionados en modo selección múltiple. */
  function handleDeleteSelected() {
    if (selectedWEIds.size === 0) return;
    Alert.alert(
      t("workout:alerts.deleteSelectedTitle", { count: selectedWEIds.size }),
      t("workout:alerts.deleteSetsAlsoMessage"),
      [
        { text: t("common:cancel"), style: "cancel" },
        { text: t("common:delete"), style: "destructive", onPress: async () => {
          const ids = [...selectedWEIds];
          for (const id of ids) {
            removeExerciseFromWorkout(id);
            await repo.removeExercise(id);
          }
          setSelectMode(false);
          setSelectedWEIds(new Set());
        }},
      ]
    );
  }

  /** Aplica el nuevo orden de ejercicios del entrenamiento tras un drag&drop, actualizando store y repo. */
  function handleReorderExercises(data: WorkoutExercise[]) {
    const orderedIds = data.map((we) => we.id);
    reorderExercises(orderedIds);
    void repo.reorderExercises(data.map((we, i) => ({ id: we.id, order_index: i })));
  }

  /** Pide confirmación y elimina un único ejercicio del entrenamiento (y todas sus series). */
  async function handleRemoveExercise(workoutExerciseId: string, exerciseName: string) {
    Alert.alert(t("workout:alerts.deleteExerciseTitle", { name: exerciseName }), t("workout:alerts.deleteSetsAlsoMessage"), [
      { text: t("common:cancel"), style: "cancel" },
      { text: t("common:delete"), style: "destructive", onPress: async () => {
        removeExerciseFromWorkout(workoutExerciseId);
        await repo.removeExercise(workoutExerciseId);
      }},
    ]);
  }

  /**
   * Pide confirmación y elimina permanentemente un entrenamiento completo de "Actividad
   * reciente". Si era el que se estaba viendo, recarga la vista con `loadWorkoutForDate`
   * (resuelve el que quede, o el estado vacío si no queda ninguno — sin esto, borrar el
   * que se estaba viendo dejaba "Sin entrenamiento aún" aunque el día todavía tuviera otro).
   */
  async function handleDeleteWorkout(workoutId: string, date: string) {
    Alert.alert(t("workout:alerts.deleteWorkoutTitle", { date: formatWorkoutDate(date) }), t("workout:alerts.deleteWorkoutMessage"), [
      { text: t("common:cancel"), style: "cancel" },
      { text: t("common:delete"), style: "destructive", onPress: async () => {
        removeWorkoutFromHistory(workoutId);
        await repo.deleteWorkout(workoutId);
        await preferencesRepo.deleteRaw(timerStorageKey(workoutId));
        if (date === currentDate && workoutId === activeWorkout?.id) {
          await loadWorkoutForDate(currentDate);
        }
      }},
    ]);
  }

  /** Persiste la nota del entrenamiento activo al perder el foco del campo de comentario. */
  async function handleSaveComment() {
    setWorkoutComment(workoutComment);
    if (activeWorkout?.id) await repo.updateWorkout(activeWorkout.id, { comment: workoutComment || undefined });
  }

  /** Mueve el entrenamiento activo a `moveDate`, cierra el modal y recarga la pantalla en la nueva fecha. */
  async function handleMoveWorkout() {
    if (!activeWorkout?.id || !moveDate || moveDate === activeWorkout.date || moveConflict) return;
    await repo.moveWorkout(activeWorkout.id, moveDate);
    setShowMoveModal(false);
    setCurrentDate(moveDate);
    await loadWorkoutForDate(moveDate);
  }

  /**
   * Copia los ejercicios (sin series) de `sourceWorkoutId` al entrenamiento
   * del día actual, creándolo primero si no existe todavía; omite los
   * ejercicios que ya estén presentes en el destino.
   */
  async function handleCopyWorkout(sourceWorkoutId: string) {
    setCopyLoading(true);
    setShowCopyModal(false);
    let workoutId = activeWorkout?.id;
    if (!workoutId) {
      const { data, error } = await repo.createWorkout({ date: currentDate, start_time: new Date().toISOString() }, userId);
      if (error || !data) { Alert.alert(t("workout:alerts.errorTitle"), error?.message ?? t("workout:alerts.workoutCreateErrorMessage")); setCopyLoading(false); return; }
      workoutId = data.id;
    }
    const { data: weList } = await repo.getWorkoutExercises(sourceWorkoutId);
    for (let i = 0; i < (weList ?? []).length; i++) {
      const we = weList![i]!;
      const alreadyIn = workoutExercises.some((e) => e.exercise_id === we.exercise_id);
      if (!alreadyIn) {
        const { data: newWe } = await repo.addExercise({ workout_id: workoutId, exercise_id: we.exercise_id, order_index: workoutExercises.length + i }, userId);
        if (newWe) addExerciseToWorkout(we.exercise_id, newWe.id);
      }
    }
    await loadWorkoutForDate(currentDate);
    setCopyLoading(false);
  }

  /** Navega `delta` días desde la fecha actual (negativo = atrás, positivo = adelante) y recarga el entrenamiento de esa fecha. */
  async function handleNavigateDate(delta: number) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + delta);
    const newDate = date.toISOString().split("T")[0]!;
    setCurrentDate(newDate);
    await loadWorkoutForDate(newDate);
  }

  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));

  // Streak: consecutive days with workouts ending at today or yesterday
  const workoutDateSet = new Set(workouts.map((w) => w.date));
  /** Racha de días consecutivos con entrenamiento, contando hacia atrás desde hoy (o desde ayer si hoy aún no tiene entrenamiento). */
  const streak = (() => {
    let count = 0;
    const d = new Date(today + "T00:00:00");
    // If today has no workout start counting from yesterday
    if (!workoutDateSet.has(today)) d.setDate(d.getDate() - 1);
    while (true) {
      const dateStr = d.toISOString().split("T")[0]!;
      if (!workoutDateSet.has(dateStr)) break;
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  })();

  // This-week workout days (Mon–Sun of current calendar week)
  /** Los 7 días (lunes a domingo) de la semana natural actual, con si cada uno tiene entrenamiento, si es hoy y si es futuro — para la franja semanal. */
  const weekDays = (() => {
    const todayDate = new Date(today + "T00:00:00");
    const dow = todayDate.getDay(); // 0=Sun
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { dateStr, has: workoutDateSet.has(dateStr), isToday: dateStr === today, isFuture: dateStr > today };
    });
  })();

  const WEEK_LABELS = [
    t("workout:weekLabels.mon"), t("workout:weekLabels.tue"), t("workout:weekLabels.wed"), t("workout:weekLabels.thu"),
    t("workout:weekLabels.fri"), t("workout:weekLabels.sat"), t("workout:weekLabels.sun"),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Date nav header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 }}>
        <TouchableOpacity onPress={() => handleNavigateDate(-1)} style={{ padding: 6 }} accessibilityLabel={t("workout:previousDayLabel")}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>
            {currentDate === today ? t("workout:todayLabel") : formatWorkoutDate(currentDate)}
          </Text>
          {currentDate === today && (
            <Text style={{ fontSize: 13, color: colors.textMuted }}>{formatWorkoutDate(today)}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => handleNavigateDate(1)} disabled={currentDate >= today} style={{ padding: 6, opacity: currentDate >= today ? 0.4 : 1 }} accessibilityLabel={t("workout:nextDayLabel")}>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        {syncStatus === "syncing" ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 4 }} />
        ) : syncStatus === "error" ? (
          <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
        ) : pendingCount > 0 ? (
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.background }}>{pendingCount}</Text>
          </View>
        ) : null}
      </View>

      {/* Weekly summary strip */}
      {!isLoading && (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8, gap: 0 }}>
          {weekDays.map((wd, i) => (
            <TouchableOpacity
              key={wd.dateStr}
              onPress={() => { setCurrentDate(wd.dateStr); void loadWorkoutForDate(wd.dateStr); }}
              style={{ flex: 1, alignItems: "center", gap: 4 }}
            >
              <Text style={{ fontSize: 10, fontWeight: "600", color: wd.isToday ? colors.primary : colors.textMuted }}>{WEEK_LABELS[i]}</Text>
              <View style={{
                width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center",
                backgroundColor: wd.dateStr === currentDate ? colors.primary : wd.has ? colors.primaryLight : "transparent",
                borderWidth: wd.isToday && wd.dateStr !== currentDate ? 1.5 : 0,
                borderColor: colors.primary,
              }}>
                {wd.has && !wd.isFuture
                  ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: wd.dateStr === currentDate ? colors.background : colors.primary }} />
                  : null}
              </View>
            </TouchableOpacity>
          ))}
          {streak > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.streakBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 }}>
              <Ionicons name="flame" size={13} color={colors.streakText} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.streakText }}>{streak}</Text>
            </View>
          )}
        </View>
      )}

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <NestableScrollContainer contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60, gap: 12 }}>
          {!activeWorkout || !activeWorkout.id ? (
            /* No workout */
            <View style={{ borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: 20, padding: 40, alignItems: "center", gap: 12, marginTop: 8 }}>
              <Ionicons name="barbell-outline" size={40} color={colors.textMuted} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>{t("workout:emptyTitle")}</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center" }}>
                {t("workout:emptySubtitle")}
              </Text>
              <TouchableOpacity onPress={openStartModal} style={{ backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 12 }}>
                <Text style={{ color: colors.background, fontSize: 14, fontWeight: "600" }}>{t("workout:startWorkoutButton")}</Text>
              </TouchableOpacity>
              {workouts.length > 0 && (
                <TouchableOpacity onPress={() => setShowCopyModal(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="copy-outline" size={15} color={colors.primary} />
                  <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "500" }}>{t("workout:copyPreviousButton")}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* Active workout */
            <View style={{ gap: 8 }}>
              {/* Workout header: timer + share */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#f8fafc", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flex: 1, minWidth: 120 }}>
                  {!activeWorkout.end_time && (
                    <TouchableOpacity
                      onPress={timerState === "running" ? handlePauseTimer : handleStartTimer}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={timerState === "running" ? t("workout:pauseTimerLabel") : t("workout:startTimerLabel")}
                    >
                      <Ionicons
                        name={timerState === "running" ? "pause-circle" : "play-circle"}
                        size={22}
                        color="#6366f1"
                      />
                    </TouchableOpacity>
                  )}
                  {activeWorkout.end_time && <Ionicons name="time-outline" size={14} color="#6366f1" />}
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#6366f1" }} numberOfLines={1}>{formatClockDuration(timerDisplay)}</Text>
                  {timerState === "paused" && timerDisplay > 0 && (
                    <Text style={{ fontSize: 11, color: "#94a3b8" }} numberOfLines={1}>{t("workout:pausedLabel")}</Text>
                  )}
                  {activeWorkout.end_time && <Text style={{ fontSize: 11, color: "#94a3b8" }} numberOfLines={1}>{t("workout:finishedLabel")}</Text>}
                </View>
                <TouchableOpacity
                  onPress={() => { setMoveDate(activeWorkout.date); setShowMoveModal(true); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Ionicons name="calendar-outline" size={16} color="#64748b" />
                  <Text style={{ fontSize: 13, color: "#64748b" }}>{t("workout:moveButton")}</Text>
                </TouchableOpacity>
                {/* Solo tiene sentido añadir un entrenamiento nuevo cuando el activo ya ha finalizado. */}
                {activeWorkout.end_time && (
                  <TouchableOpacity
                    onPress={openStartModal}
                    style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                    accessibilityLabel={t("workout:addAnotherWorkoutLabel")}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#64748b" />
                    <Text style={{ fontSize: 13, color: "#64748b" }}>{t("workout:newButton")}</Text>
                  </TouchableOpacity>
                )}
                {workoutExercises.length > 0 && (
                  <TouchableOpacity
                    onPress={toggleSelectMode}
                    style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: selectMode ? "#6366f1" : "#e2e8f0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                    accessibilityLabel={selectMode ? t("workout:cancelSelectionLabel") : t("workout:selectMultipleLabel")}
                  >
                    <Ionicons name="checkbox-outline" size={16} color={selectMode ? "#6366f1" : "#64748b"} />
                  </TouchableOpacity>
                )}
              </View>

              {selectMode && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#eff0fe", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ fontSize: 13, color: "#6366f1", fontWeight: "500" }}>{t("workout:selectedCount", { count: selectedWEIds.size })}</Text>
                  <TouchableOpacity
                    onPress={handleDeleteSelected}
                    disabled={selectedWEIds.size === 0}
                    style={{ opacity: selectedWEIds.size === 0 ? 0.4 : 1 }}
                  >
                    <Text style={{ fontSize: 13, color: "#ef4444", fontWeight: "600" }}>{t("workout:deleteSelectedButton")}</Text>
                  </TouchableOpacity>
                </View>
              )}

              <NestableDraggableFlatList
                // fuerza remount al cambiar de entrenamiento activo (p.ej. desde "Actividad
                // reciente"): sin esto, el layout cacheado de la lista anterior deja la
                // tarjeta del ejercicio colapsada a altura casi cero (mismo índice 0, distinto
                // contenido) hasta que la pantalla se remonta por completo.
                key={activeWorkout.id}
                data={workoutExercises}
                keyExtractor={(we) => we.id}
                scrollEnabled={false}
                onDragEnd={({ data }) => handleReorderExercises(data)}
                renderItem={({ item: we, drag, isActive, getIndex }: RenderItemParams<WorkoutExercise>) => {
                  const weIdx = getIndex() ?? 0;
                  const ex = exerciseMap[we.exercise_id];
                  const weSets = (sets[we.id] ?? []);
                  const completedCount = weSets.filter((s) => s.is_complete).length;
                  const totalCount = weSets.length;
                  const allDone = totalCount > 0 && completedCount === totalCount;
                  const progress = totalCount > 0 ? completedCount / totalCount : 0;
                  const exName = ex?.name ?? we.exercise_id;
                  const isGrouped = !!we.group_id;
                  const prevGrouped = weIdx > 0 && workoutExercises[weIdx - 1]?.group_id === we.group_id;
                  const nextGrouped = weIdx < workoutExercises.length - 1 && workoutExercises[weIdx + 1]?.group_id === we.group_id;
                  const isSelected = selectedWEIds.has(we.id);
                  return (
                    <ScaleDecorator activeScale={0.98}>
                      <View style={{ flexDirection: "row" }}>
                        {isGrouped ? (
                          <View style={{ width: 4, backgroundColor: "#8b5cf6", borderRadius: 2, marginRight: 8, marginTop: prevGrouped ? 0 : 8, marginBottom: nextGrouped ? 0 : 8 }} />
                        ) : <View style={{ width: 12 }} />}
                      <View style={{ flex: 1, marginBottom: 8, borderWidth: 1, borderColor: isSelected ? "#6366f1" : allDone ? "#22c55e30" : isGrouped ? "#8b5cf620" : "#f1f5f9", borderRadius: 16, backgroundColor: isSelected ? "#eff0fe" : allDone ? "#f0fdf4" : "#fff", overflow: "hidden" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 8 }}>
                          {selectMode && (
                            <TouchableOpacity
                              onPress={() => toggleSelectWE(we.id)}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              style={{ paddingLeft: 14 }}
                              accessibilityLabel={isSelected ? t("workout:deselectLabel") : t("workout:selectLabel")}
                            >
                              <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={20} color={isSelected ? "#6366f1" : "#94a3b8"} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => selectMode ? toggleSelectWE(we.id) : router.push(`/workout/${we.exercise_id}`)}
                            style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{exName}</Text>
                              {showSetCountHome && (
                                <Text style={{ fontSize: 12, color: allDone ? "#16a34a" : "#94a3b8", marginTop: 2 }}>
                                  {totalCount === 0
                                    ? t("workout:noSetsLabel")
                                    : allDone
                                    ? t("workout:setsCompletedLabel", { count: totalCount })
                                    : t("workout:setsProgressLabel", { completed: completedCount, total: totalCount })}
                                </Text>
                              )}
                            </View>
                            {allDone
                              ? <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                              : !selectMode ? <Ionicons name="chevron-forward" size={16} color="#94a3b8" /> : null}
                          </TouchableOpacity>
                          {!selectMode && (
                            <>
                              <TouchableOpacity
                                onPress={() => handleRemoveExercise(we.id, exName)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={{ padding: 8 }}
                                accessibilityLabel={t("workout:removeExerciseLabel")}
                              >
                                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                              </TouchableOpacity>
                              {!activeWorkout.end_time && workoutExercises.length > 1 && (
                                <TouchableOpacity
                                  onLongPress={drag}
                                  disabled={isActive}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  style={{ padding: 8 }}
                                  accessibilityLabel={t("workout:reorderExerciseHintLabel")}
                                >
                                  <Ionicons name="reorder-three-outline" size={18} color="#94a3b8" />
                                </TouchableOpacity>
                              )}
                            </>
                          )}
                        </View>
                        {totalCount > 0 && !allDone && (
                          <View style={{ height: 3, backgroundColor: "#f1f5f9" }}>
                            <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: progress > 0 ? "#6366f1" : "#f1f5f9", borderRadius: 2 }} />
                          </View>
                        )}
                      </View>
                      </View>
                    </ScaleDecorator>
                  );
                }}
              />

              {!activeWorkout.end_time && (
                <TouchableOpacity
                  onPress={() => router.push("/exercises")}
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 13, color: "#94a3b8" }}>{t("workout:addExerciseButton")}</Text>
                </TouchableOpacity>
              )}

              {/* Workout comment */}
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 13, color: "#0f172a", backgroundColor: "#fafafa", minHeight: 44 }}
                placeholder={t("workout:commentPlaceholder")}
                placeholderTextColor="#94a3b8"
                value={workoutComment}
                onChangeText={setWorkoutCommentLocal}
                onBlur={handleSaveComment}
                multiline
                editable={!activeWorkout.end_time}
              />

              {!activeWorkout.end_time && (
                <TouchableOpacity onPress={handleFinish} style={{ borderWidth: 1, borderColor: "#ef4444", borderRadius: 14, paddingVertical: 12, alignItems: "center", marginTop: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#ef4444" }}>{t("workout:finishButton")}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Recent workouts — solo los del día que se está viendo */}
          {workouts.filter((w) => w.date === currentDate).length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>{t("workout:recentActivityTitle")}</Text>
              {workouts.filter((w) => w.date === currentDate).map((w) => {
                const s = recentSummaries[w.id];
                return (
                  <View key={w.id} style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 14, paddingRight: 8 }}>
                    <TouchableOpacity
                      onPress={() => loadWorkoutById(w.id)}
                      style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12 }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "500", color: "#0f172a" }}>{formatWorkoutDate(w.date)}</Text>
                      {s && s.exerciseCount > 0 ? (
                        <View style={{ flexDirection: "row", gap: 10, marginTop: 3 }}>
                          <Text style={{ fontSize: 11, color: "#94a3b8" }}>
                            {t("routines:exercisesCount", { count: s.exerciseCount })}
                          </Text>
                          {s.volume > 0 && (
                            <Text style={{ fontSize: 11, color: "#6366f1", fontWeight: "600" }}>
                              {s.volume >= 1000 ? `${(s.volume / 1000).toFixed(1)}k` : s.volume} kg
                            </Text>
                          )}
                        </View>
                      ) : null}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteWorkout(w.id, w.date)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ padding: 8 }}
                      accessibilityLabel={t("workout:deleteWorkoutLabel")}
                    >
                      <Ionicons name="trash-outline" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </NestableScrollContainer>
      )}
      {/* Start workout modal — routine selector (o selector de día si la rutina tiene varios) */}
      <Modal visible={showStartModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeStartModal}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
            {routineDaysToPick ? (
              <TouchableOpacity onPress={() => setRoutineDaysToPick(null)} accessibilityLabel={t("workout:startModal.backLabel")} style={{ paddingRight: 12 }}>
                <Ionicons name="chevron-back" size={22} color="#64748b" />
              </TouchableOpacity>
            ) : null}
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: "#0f172a" }}>
              {routineDaysToPick ? t("workout:startModal.chooseDayTitle", { routineName: routineDaysToPick.routineName }) : t("workout:startModal.chooseRoutineTitle")}
            </Text>
            <TouchableOpacity onPress={closeStartModal} accessibilityLabel={t("common:close")}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {routineDaysToPick ? (
            <FlatList
              data={routineDaysToPick.days}
              keyExtractor={(d) => d.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item: d }) => (
                <TouchableOpacity
                  onPress={() => handleLogRoutineDay(d.id)}
                  disabled={!!loggingRoutineId}
                  style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, gap: 14, backgroundColor: "#fff", opacity: loggingRoutineId && loggingRoutineId !== d.id ? 0.4 : 1 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#6366f115", alignItems: "center", justifyContent: "center" }}>
                    {loggingRoutineId === d.id
                      ? <ActivityIndicator size="small" color="#6366f1" />
                      : <Ionicons name="barbell-outline" size={20} color="#6366f1" />}
                  </View>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: "#0f172a" }}>{d.name}</Text>
                  <Ionicons name="play-circle-outline" size={24} color="#6366f1" />
                </TouchableOpacity>
              )}
            />
          ) : startModalLoading ? (
            <ActivityIndicator style={{ flex: 1 }} color="#6366f1" />
          ) : startRoutines.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 }}>
              <Ionicons name="clipboard-outline" size={48} color="#cbd5e1" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#64748b", textAlign: "center" }}>{t("workout:startModal.noRoutinesTitle")}</Text>
              <Text style={{ fontSize: 14, color: "#94a3b8", textAlign: "center" }}>
                {t("workout:startModal.noRoutinesSubtitle")}
              </Text>
              <TouchableOpacity
                onPress={handleStartBlankWorkout}
                disabled={!!loggingRoutineId}
                style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                {loggingRoutineId === "blank"
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>{t("workout:startModal.blankWorkoutButton")}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setShowStartModal(false); router.push("/tools"); }}
                style={{ paddingHorizontal: 24, paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#6366f1" }}>{t("workout:startModal.goToRoutinesButton")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={startRoutines}
              keyExtractor={(r) => r.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              ListHeaderComponent={
                <TouchableOpacity
                  onPress={handleStartBlankWorkout}
                  disabled={!!loggingRoutineId}
                  style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderStyle: "dashed", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, gap: 14, backgroundColor: "#fff", marginBottom: 10, opacity: loggingRoutineId && loggingRoutineId !== "blank" ? 0.4 : 1 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#6366f115", alignItems: "center", justifyContent: "center" }}>
                    {loggingRoutineId === "blank"
                      ? <ActivityIndicator size="small" color="#6366f1" />
                      : <Ionicons name="add-outline" size={22} color="#6366f1" />}
                  </View>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: "#0f172a" }}>{t("workout:startModal.blankWorkoutButton")}</Text>
                </TouchableOpacity>
              }
              renderItem={({ item: r }) => (
                <TouchableOpacity
                  onPress={() => handleLogRoutine(r.id)}
                  disabled={!!loggingRoutineId}
                  style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, gap: 14, backgroundColor: "#fff", opacity: loggingRoutineId && loggingRoutineId !== r.id ? 0.4 : 1 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#6366f115", alignItems: "center", justifyContent: "center" }}>
                    {loggingRoutineId === r.id
                      ? <ActivityIndicator size="small" color="#6366f1" />
                      : <Ionicons name="clipboard-outline" size={20} color="#6366f1" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#0f172a" }}>{r.name}</Text>
                    {r.notes ? <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }} numberOfLines={1}>{r.notes}</Text> : null}
                  </View>
                  <Ionicons name="play-circle-outline" size={24} color="#6366f1" />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Move workout modal */}
      <Modal visible={showMoveModal} animationType="fade" transparent onRequestClose={() => setShowMoveModal(false)}>
        <View style={{ flex: 1, backgroundColor: "#00000060", justifyContent: "center", paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>{t("workout:moveModal.heading")}</Text>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, color: "#64748b" }}>{t("workout:moveModal.newDateLabel")}</Text>
              <DateInput value={moveDate} onChange={setMoveDate} />
              {moveConflict && (
                <Text style={{ fontSize: 12, color: "#ef4444" }}>
                  {t("workout:moveModal.conflictMessage")}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setShowMoveModal(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center" }}>
                <Text style={{ fontSize: 14, color: "#64748b" }}>{t("common:cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleMoveWorkout}
                disabled={!moveDate || moveDate === activeWorkout?.date || moveConflict}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: moveDate && moveDate !== activeWorkout?.date && !moveConflict ? "#6366f1" : "#e2e8f0", alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: moveDate && moveDate !== activeWorkout?.date && !moveConflict ? "#fff" : "#94a3b8" }}>{t("workout:moveButton")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Copy workout modal */}
      <Modal visible={showCopyModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCopyModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: "#0f172a" }}>{t("workout:copyModal.heading")}</Text>
            <TouchableOpacity onPress={() => setShowCopyModal(false)} accessibilityLabel={t("common:close")}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={workouts.filter((w) => w.id !== activeWorkout?.id).slice(0, 10)}
            keyExtractor={(w) => w.id}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            ListEmptyComponent={<Text style={{ color: "#94a3b8", textAlign: "center", marginTop: 40 }}>{t("workout:copyModal.emptyMessage")}</Text>}
            renderItem={({ item: w }) => (
              <TouchableOpacity
                onPress={() => handleCopyWorkout(w.id)}
                style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
              >
                <Ionicons name="calendar-outline" size={20} color="#6366f1" />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: "#0f172a" }}>{formatWorkoutDate(w.date)}</Text>
                <Ionicons name="copy-outline" size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      {copyLoading && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#00000030", justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center", gap: 12 }}>
            <ActivityIndicator color="#6366f1" />
            <Text style={{ fontSize: 14, color: "#64748b" }}>{t("workout:copyModal.copyingMessage")}</Text>
          </View>
        </View>
      )}

      {/* Workout finish summary modal */}
      <Modal visible={showSummary} animationType="fade" transparent onRequestClose={() => setShowSummary(false)}>
        <View style={{ flex: 1, backgroundColor: "#00000050", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 24, padding: 28, width: "100%", alignItems: "center", gap: 20 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#6366f115", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="trophy" size={28} color="#6366f1" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#0f172a" }}>{t("workout:summaryModal.heading")}</Text>
            {summaryStats && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", width: "100%" }}>
                {[
                  { icon: "time-outline" as const, label: t("workout:summaryModal.durationLabel"), value: formatClockDuration(summaryStats.duration) },
                  { icon: "barbell-outline" as const, label: t("workout:summaryModal.exercisesLabel"), value: String(summaryStats.exercises) },
                  { icon: "list-outline" as const, label: t("workout:summaryModal.setsLabel"), value: String(summaryStats.sets) },
                  { icon: "flame-outline" as const, label: t("workout:summaryModal.volumeLabel"), value: summaryStats.volume > 0 ? (summaryStats.volume >= 1000 ? `${(summaryStats.volume / 1000).toFixed(1)}k kg` : `${summaryStats.volume} kg`) : "—" },
                ].map((stat) => (
                  <View key={stat.label} style={{ width: "45%", backgroundColor: "#f8fafc", borderRadius: 14, padding: 14, alignItems: "center", gap: 4 }}>
                    <Ionicons name={stat.icon} size={20} color="#6366f1" />
                    <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>{stat.value}</Text>
                    <Text style={{ fontSize: 11, color: "#94a3b8", fontWeight: "600", textTransform: "uppercase" }}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity
              onPress={() => setShowSummary(false)}
              style={{ backgroundColor: "#6366f1", borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, width: "100%", alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{t("workout:summaryModal.closeButton")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

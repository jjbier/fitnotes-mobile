import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Alert, TextInput, Share, Modal, FlatList } from "react-native";
import { NestableScrollContainer, NestableDraggableFlatList, ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useWorkoutStore, useExerciseStore, formatWorkoutDate, todayISO, ExerciseType } from "@fitnotes/core";
import type { WorkoutExercise } from "@fitnotes/core";
import { createWorkoutRepository, createExerciseRepository, createRoutineRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import { useSyncStatus } from "../../contexts/SyncContext";
import DateInput from "../../components/DateInput";
import { useTheme } from "../../lib/theme";

export default function HomeScreen() {
  const colors = useTheme();
  const router = useRouter();
  const today = todayISO();

  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const workoutExercises = useWorkoutStore((s) => s.exercises);
  const sets = useWorkoutStore((s) => s.sets);
  const workouts = useWorkoutStore((s) => s.workouts);
  const isLoading = useWorkoutStore((s) => s.isLoading);
  const loadWorkout = useWorkoutStore((s) => s.loadWorkout);
  const loadWorkouts = useWorkoutStore((s) => s.loadWorkouts);
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

  const [userId, setUserId] = useState("");
  const [showSetCountHome, setShowSetCountHome] = useState(true);
  const [currentDate, setCurrentDate] = useState(today);
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
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [summaryStats, setSummaryStats] = useState<{ duration: number; exercises: number; sets: number; volume: number } | null>(null);
  const [recentSummaries, setRecentSummaries] = useState<Record<string, { exerciseCount: number; volume: number }>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selectedWEIds, setSelectedWEIds] = useState<Set<string>>(new Set());
  const { status: syncStatus, pendingCount, refetchSignal } = useSyncStatus();

  const repo = useMemo(() => createWorkoutRepository(supabase), []);
  const exRepo = useMemo(() => createExerciseRepository(supabase), []);
  const routineRepo = useMemo(() => createRoutineRepository(supabase), []);

  const loadWorkoutForDate = useCallback(async (date: string) => {
    const { data: workout } = await repo.getWorkoutByDate(date);
    if (!workout) {
      loadWorkout({ id: "", date }, [], {});
      return;
    }
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

  useEffect(() => {
    async function init() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        setShowSetCountHome((session.user.user_metadata?.show_set_count_home as boolean | undefined) ?? true);
      }

      const [recentRes, catRes, exRes] = await Promise.all([
        repo.getWorkouts(60),
        exercises.length > 0 ? Promise.resolve({ data: null }) : exRepo.getCategories(),
        exercises.length > 0 ? Promise.resolve({ data: null }) : exRepo.getExercises(),
      ]);
      if (catRes.data && exRes.data) {
        loadExercises(catRes.data, exRes.data.map((ex) => ({
          id: ex.id, name: ex.name, category_id: ex.category_id ?? "",
          type: ex.type as ExerciseType, weight_unit: ex.weight_unit as "kg" | "lb",
          notes: ex.notes ?? undefined, is_favorite: ex.is_favorite, created_at: ex.created_at,
        })));
      }
      if (recentRes.data) {
        loadWorkouts(recentRes.data.map((w) => ({
          id: w.id, date: w.date, comment: w.comment ?? undefined,
          start_time: w.start_time ?? undefined, end_time: w.end_time ?? undefined,
        })));
      }
      const { data: summaries } = await repo.getWorkoutsWithSummary(10);
      const summaryMap: Record<string, { exerciseCount: number; volume: number }> = {};
      for (const s of summaries) summaryMap[s.id] = { exerciseCount: s.exerciseCount, volume: s.volume };
      setRecentSummaries(summaryMap);
      await loadWorkoutForDate(today);
      setLoading(false);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refetchSignal === 0) return;
    loadWorkoutForDate(currentDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchSignal]);

  // Sync local comment with store
  useEffect(() => {
    setWorkoutCommentLocal(activeWorkout?.comment ?? "");
  }, [activeWorkout?.id]);

  // Reset timer when workout changes
  useEffect(() => {
    if (durationRef.current) clearInterval(durationRef.current);
    setTimerDisplay(0);
    setTimerState("idle");
    timerElapsedRef.current = 0;
    timerSegmentStartRef.current = null;
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

  async function handleStartTimer() {
    if (!activeWorkout?.id) return;
    timerSegmentStartRef.current = Date.now();
    setTimerState("running");
    if (!activeWorkout.start_time) {
      const startTime = new Date().toISOString();
      await repo.updateWorkout(activeWorkout.id, { start_time: startTime });
      setWorkoutStartTime(startTime);
    }
  }

  function handlePauseTimer() {
    if (timerSegmentStartRef.current !== null) {
      timerElapsedRef.current += Math.floor((Date.now() - timerSegmentStartRef.current) / 1000);
      timerSegmentStartRef.current = null;
    }
    if (durationRef.current) clearInterval(durationRef.current);
    setTimerDisplay(timerElapsedRef.current);
    setTimerState("paused");
  }

  async function openStartModal() {
    setShowStartModal(true);
    setStartModalLoading(true);
    const { data } = await routineRepo.getRoutines();
    setStartRoutines(data ?? []);
    setStartModalLoading(false);
  }

  async function handleLogRoutine(routineId: string) {
    setLoggingRoutineId(routineId);
    const { data: days } = await routineRepo.getDays(routineId);
    const allDayExercises: { id: string; exercise_id: string; routine_day_id: string; order_index: number; group_id?: string; group_name?: string }[] = [];
    for (const day of days ?? []) {
      const { data: dayExs } = await routineRepo.getDayExercises(day.id);
      for (const rde of dayExs ?? []) {
        if (!allDayExercises.some((e) => e.exercise_id === rde.exercise_id)) {
          allDayExercises.push({ ...rde, group_id: rde.group_id ?? undefined, group_name: rde.group_name ?? undefined });
        }
      }
    }
    if (allDayExercises.length === 0) {
      Alert.alert("Sin ejercicios", "Esta rutina no tiene ejercicios. Añádelos en el editor de rutinas.");
      setLoggingRoutineId(null);
      return;
    }
    const { data: workout, error: wError } = await repo.createWorkout(
      { date: currentDate }, userId
    );
    if (wError || !workout) {
      Alert.alert("Error", wError?.message ?? "No se pudo crear el entrenamiento");
      setLoggingRoutineId(null);
      return;
    }
    const workoutExercisesCreated: Parameters<typeof loadWorkout>[1] = [];
    const setsMap: Parameters<typeof loadWorkout>[2] = {};
    for (let i = 0; i < allDayExercises.length; i++) {
      const rde = allDayExercises[i]!;
      const { data: we } = await repo.addExercise(
        { workout_id: workout.id, exercise_id: rde.exercise_id, order_index: i, group_id: rde.group_id, group_name: rde.group_name }, userId
      );
      if (!we) continue;
      workoutExercisesCreated.push({
        id: we.id, workout_id: we.workout_id, exercise_id: we.exercise_id,
        order_index: we.order_index, group_id: we.group_id ?? undefined, group_name: we.group_name ?? undefined,
      });
      const { data: pSets } = await routineRepo.getPredefinedSets(rde.id);
      const createdSets: Parameters<typeof loadWorkout>[2][string] = [];
      for (const ps of pSets ?? []) {
        const { data: newSet } = await repo.createSet({
          workout_exercise_id: we.id,
          weight: ps.weight ?? undefined, reps: ps.reps ?? undefined,
          distance: ps.distance ?? undefined, time_seconds: ps.time_seconds ?? undefined,
          order_index: ps.order_index,
        }, userId);
        if (newSet) {
          createdSets.push({
            id: newSet.id, workout_exercise_id: newSet.workout_exercise_id,
            weight: newSet.weight ?? undefined, reps: newSet.reps ?? undefined,
            distance: newSet.distance ?? undefined, time_seconds: newSet.time_seconds ?? undefined,
            is_complete: newSet.is_complete, is_warmup: newSet.is_warmup ?? false,
            comment: newSet.comment ?? undefined, order_index: newSet.order_index,
          });
        }
      }
      setsMap[we.id] = createdSets;
    }
    loadWorkout(
      { id: workout.id, date: workout.date },
      workoutExercisesCreated,
      setsMap
    );
    loadWorkouts([{ id: workout.id, date: workout.date }]);
    setLoggingRoutineId(null);
    setShowStartModal(false);
  }

  async function handleFinish() {
    if (!activeWorkout) return;
    Alert.alert("¿Finalizar entrenamiento?", "¿Estás seguro?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Finalizar", onPress: async () => {
        // Snapshot elapsed time before stopping
        if (timerSegmentStartRef.current !== null) {
          timerElapsedRef.current += Math.floor((Date.now() - timerSegmentStartRef.current) / 1000);
          timerSegmentStartRef.current = null;
        }
        if (durationRef.current) clearInterval(durationRef.current);
        setTimerState("idle");
        const dur = timerElapsedRef.current;

        const endTime = new Date().toISOString();
        await repo.updateWorkout(activeWorkout.id, { end_time: endTime, duration_minutes: Math.round(dur / 60) });

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

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedWEIds(new Set());
  }

  function toggleSelectWE(id: string) {
    setSelectedWEIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleDeleteSelected() {
    if (selectedWEIds.size === 0) return;
    Alert.alert(
      `¿Eliminar ${selectedWEIds.size} ejercicio(s)?`,
      "Se eliminarán también todas sus series.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: async () => {
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

  function handleReorderExercises(data: WorkoutExercise[]) {
    const orderedIds = data.map((we) => we.id);
    reorderExercises(orderedIds);
    void repo.reorderExercises(data.map((we, i) => ({ id: we.id, order_index: i })));
  }

  async function handleRemoveExercise(workoutExerciseId: string, exerciseName: string) {
    Alert.alert(`¿Eliminar "${exerciseName}"?`, "Se eliminarán también todas sus series.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        removeExerciseFromWorkout(workoutExerciseId);
        await repo.removeExercise(workoutExerciseId);
      }},
    ]);
  }

  async function handleDeleteWorkout(workoutId: string, date: string) {
    Alert.alert(`¿Eliminar entrenamiento del ${formatWorkoutDate(date)}?`, "Se eliminará permanentemente.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        removeWorkoutFromHistory(workoutId);
        await repo.deleteWorkout(workoutId);
      }},
    ]);
  }

  async function handleSaveComment() {
    setWorkoutComment(workoutComment);
    if (activeWorkout?.id) await repo.updateWorkout(activeWorkout.id, { comment: workoutComment || undefined });
  }

  async function handleMoveWorkout() {
    if (!activeWorkout?.id || !moveDate) return;
    await repo.updateWorkout(activeWorkout.id, { comment: activeWorkout.comment });
    await supabase.from("workouts").update({ date: moveDate }).eq("id", activeWorkout.id);
    setShowMoveModal(false);
    setCurrentDate(moveDate);
    await loadWorkoutForDate(moveDate);
  }

  async function handleShareWorkout() {
    if (!activeWorkout?.id) return;
    const text = await repo.shareWorkout(activeWorkout.id);
    if (text) await Share.share({ message: text });
  }

  function formatDuration(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  async function handleCopyWorkout(sourceWorkoutId: string) {
    setCopyLoading(true);
    setShowCopyModal(false);
    let workoutId = activeWorkout?.id;
    if (!workoutId) {
      const { data, error } = await repo.createWorkout({ date: currentDate }, userId);
      if (error || !data) { Alert.alert("Error", error?.message ?? "No se pudo crear el entrenamiento"); setCopyLoading(false); return; }
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
  const weekDays = (() => {
    const todayDate = new Date(today + "T00:00:00");
    const dow = todayDate.getDay(); // 0=Sun
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split("T")[0]!;
      return { dateStr, has: workoutDateSet.has(dateStr), isToday: dateStr === today, isFuture: dateStr > today };
    });
  })();

  const WEEK_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Date nav header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 }}>
        <TouchableOpacity onPress={() => handleNavigateDate(-1)} style={{ padding: 6 }} accessibilityLabel="Día anterior">
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>
            {currentDate === today ? "Hoy" : formatWorkoutDate(currentDate)}
          </Text>
          {currentDate === today && (
            <Text style={{ fontSize: 13, color: colors.textMuted }}>{formatWorkoutDate(today)}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => handleNavigateDate(1)} disabled={currentDate >= today} style={{ padding: 6, opacity: currentDate >= today ? 0.4 : 1 }} accessibilityLabel="Día siguiente">
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
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>Sin entrenamiento aún</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center" }}>
                Inicia un entrenamiento para registrar tus series y hacer seguimiento del progreso.
              </Text>
              <TouchableOpacity onPress={openStartModal} style={{ backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 12 }}>
                <Text style={{ color: colors.background, fontSize: 14, fontWeight: "600" }}>Iniciar entrenamiento</Text>
              </TouchableOpacity>
              {workouts.length > 0 && (
                <TouchableOpacity onPress={() => setShowCopyModal(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="copy-outline" size={15} color={colors.primary} />
                  <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "500" }}>Copiar entrenamiento anterior</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* Active workout */
            <View style={{ gap: 8 }}>
              {/* Workout header: timer + share */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#f8fafc", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flex: 1 }}>
                  {!activeWorkout.end_time && (
                    <TouchableOpacity
                      onPress={timerState === "running" ? handlePauseTimer : handleStartTimer}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={timerState === "running" ? "Pausar temporizador" : "Iniciar temporizador"}
                    >
                      <Ionicons
                        name={timerState === "running" ? "pause-circle" : "play-circle"}
                        size={22}
                        color="#6366f1"
                      />
                    </TouchableOpacity>
                  )}
                  {activeWorkout.end_time && <Ionicons name="time-outline" size={14} color="#6366f1" />}
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#6366f1" }}>{formatDuration(timerDisplay)}</Text>
                  {timerState === "paused" && timerDisplay > 0 && (
                    <Text style={{ fontSize: 11, color: "#94a3b8" }}>pausado</Text>
                  )}
                  {activeWorkout.end_time && <Text style={{ fontSize: 11, color: "#94a3b8" }}>finalizado</Text>}
                </View>
                <TouchableOpacity
                  onPress={() => { setMoveDate(activeWorkout.date); setShowMoveModal(true); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Ionicons name="calendar-outline" size={16} color="#64748b" />
                  <Text style={{ fontSize: 13, color: "#64748b" }}>Mover</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleShareWorkout} style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Ionicons name="share-outline" size={16} color="#64748b" />
                  <Text style={{ fontSize: 13, color: "#64748b" }}>Compartir</Text>
                </TouchableOpacity>
                {workoutExercises.length > 0 && (
                  <TouchableOpacity
                    onPress={toggleSelectMode}
                    style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: selectMode ? "#6366f1" : "#e2e8f0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                    accessibilityLabel={selectMode ? "Cancelar selección" : "Seleccionar varios ejercicios"}
                  >
                    <Ionicons name="checkbox-outline" size={16} color={selectMode ? "#6366f1" : "#64748b"} />
                  </TouchableOpacity>
                )}
              </View>

              {selectMode && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#eff0fe", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ fontSize: 13, color: "#6366f1", fontWeight: "500" }}>{selectedWEIds.size} seleccionado(s)</Text>
                  <TouchableOpacity
                    onPress={handleDeleteSelected}
                    disabled={selectedWEIds.size === 0}
                    style={{ opacity: selectedWEIds.size === 0 ? 0.4 : 1 }}
                  >
                    <Text style={{ fontSize: 13, color: "#ef4444", fontWeight: "600" }}>Eliminar seleccionados</Text>
                  </TouchableOpacity>
                </View>
              )}

              <NestableDraggableFlatList
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
                              accessibilityLabel={isSelected ? "Deseleccionar" : "Seleccionar"}
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
                                    ? "Sin series"
                                    : allDone
                                    ? `${totalCount} series completadas`
                                    : `${completedCount}/${totalCount} series`}
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
                                accessibilityLabel="Eliminar ejercicio"
                              >
                                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                              </TouchableOpacity>
                              {!activeWorkout.end_time && workoutExercises.length > 1 && (
                                <TouchableOpacity
                                  onLongPress={drag}
                                  disabled={isActive}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  style={{ padding: 8 }}
                                  accessibilityLabel="Mantener pulsado para reordenar"
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
                  <Text style={{ fontSize: 13, color: "#94a3b8" }}>+ Añadir ejercicio</Text>
                </TouchableOpacity>
              )}

              {/* Workout comment */}
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 13, color: "#0f172a", backgroundColor: "#fafafa", minHeight: 44 }}
                placeholder="Añadir nota al entrenamiento…"
                placeholderTextColor="#94a3b8"
                value={workoutComment}
                onChangeText={setWorkoutCommentLocal}
                onBlur={handleSaveComment}
                multiline
                editable={!activeWorkout.end_time}
              />

              {!activeWorkout.end_time && (
                <TouchableOpacity onPress={handleFinish} style={{ borderWidth: 1, borderColor: "#ef4444", borderRadius: 14, paddingVertical: 12, alignItems: "center", marginTop: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#ef4444" }}>Finalizar entrenamiento</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Recent workouts */}
          {workouts.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>Actividad reciente</Text>
              {workouts.slice(0, 5).map((w) => {
                const s = recentSummaries[w.id];
                return (
                  <View key={w.id} style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 14, paddingRight: 8 }}>
                    <TouchableOpacity
                      onPress={() => { setCurrentDate(w.date); void loadWorkoutForDate(w.date); }}
                      style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12 }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "500", color: "#0f172a" }}>{formatWorkoutDate(w.date)}</Text>
                      {s && s.exerciseCount > 0 ? (
                        <View style={{ flexDirection: "row", gap: 10, marginTop: 3 }}>
                          <Text style={{ fontSize: 11, color: "#94a3b8" }}>
                            {s.exerciseCount} ejercicio{s.exerciseCount !== 1 ? "s" : ""}
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
                      accessibilityLabel="Eliminar entrenamiento"
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
      {/* Start workout modal — routine selector */}
      <Modal visible={showStartModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowStartModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: "#0f172a" }}>Elige una rutina</Text>
            <TouchableOpacity onPress={() => setShowStartModal(false)} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {startModalLoading ? (
            <ActivityIndicator style={{ flex: 1 }} color="#6366f1" />
          ) : startRoutines.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 }}>
              <Ionicons name="clipboard-outline" size={48} color="#cbd5e1" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#64748b", textAlign: "center" }}>Sin rutinas</Text>
              <Text style={{ fontSize: 14, color: "#94a3b8", textAlign: "center" }}>
                Crea una rutina en el tab Rutinas para poder iniciar un entrenamiento.
              </Text>
              <TouchableOpacity
                onPress={() => { setShowStartModal(false); router.push("/tools"); }}
                style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Ir a Rutinas</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={startRoutines}
              keyExtractor={(r) => r.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
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
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>Mover entrenamiento</Text>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, color: "#64748b" }}>Nueva fecha</Text>
              <DateInput value={moveDate} onChange={setMoveDate} />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setShowMoveModal(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center" }}>
                <Text style={{ fontSize: 14, color: "#64748b" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleMoveWorkout}
                disabled={!moveDate}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: moveDate ? "#6366f1" : "#e2e8f0", alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: moveDate ? "#fff" : "#94a3b8" }}>Mover</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Copy workout modal */}
      <Modal visible={showCopyModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCopyModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: "#0f172a" }}>Copiar ejercicios de…</Text>
            <TouchableOpacity onPress={() => setShowCopyModal(false)} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={workouts.filter((w) => w.id !== activeWorkout?.id).slice(0, 10)}
            keyExtractor={(w) => w.id}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            ListEmptyComponent={<Text style={{ color: "#94a3b8", textAlign: "center", marginTop: 40 }}>Sin entrenamientos anteriores</Text>}
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
            <Text style={{ fontSize: 14, color: "#64748b" }}>Copiando ejercicios…</Text>
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
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#0f172a" }}>¡Entrenamiento completado!</Text>
            {summaryStats && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", width: "100%" }}>
                {[
                  { icon: "time-outline" as const, label: "Duración", value: formatDuration(summaryStats.duration) },
                  { icon: "barbell-outline" as const, label: "Ejercicios", value: String(summaryStats.exercises) },
                  { icon: "list-outline" as const, label: "Series", value: String(summaryStats.sets) },
                  { icon: "flame-outline" as const, label: "Volumen", value: summaryStats.volume > 0 ? `${(summaryStats.volume / 1000).toFixed(1)}k kg` : "—" },
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
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

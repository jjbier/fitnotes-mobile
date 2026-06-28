import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, Text, View, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { NestableScrollContainer, NestableDraggableFlatList, ScaleDecorator } from "react-native-draggable-flatlist";
import type { RenderItemParams } from "react-native-draggable-flatlist";
import { useRoutineStore, useExerciseStore, useWorkoutStore, ExerciseType, todayISO, getExerciseFields } from "@fitnotes/core";
import type { PredefinedSet, RoutineDay, RoutineDayExercise } from "@fitnotes/core";
import { createRoutineRepository, createExerciseRepository, createWorkoutRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

type LocalPS = { localId: string; weight: string; reps: string; distance: string; time_seconds: string };

export default function RoutineDetailScreen() {
  const { id: routineId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();

  const routines = useRoutineStore((s) => s.routines);
  const routineDays = useRoutineStore((s) => s.routineDays);
  const routineDayExercises = useRoutineStore((s) => s.routineDayExercises);
  const isLoading = useRoutineStore((s) => s.isLoading);
  const loadRoutines = useRoutineStore((s) => s.loadRoutines);
  const loadRoutineDays = useRoutineStore((s) => s.loadRoutineDays);
  const loadRoutineDayExercises = useRoutineStore((s) => s.loadRoutineDayExercises);
  const addRoutineDay = useRoutineStore((s) => s.addRoutineDay);
  const deleteRoutineDay = useRoutineStore((s) => s.deleteRoutineDay);
  const addExerciseToDay = useRoutineStore((s) => s.addExerciseToDay);
  const removeExerciseFromDay = useRoutineStore((s) => s.removeExerciseFromDay);
  const reorderDaysStore = useRoutineStore((s) => s.reorderDays);
  const reorderExercisesStore = useRoutineStore((s) => s.reorderExercisesInDay);
  const setLoading = useRoutineStore((s) => s.setLoading);

  const predefinedSets = useRoutineStore((s) => s.predefinedSets);
  const loadPredefinedSets = useRoutineStore((s) => s.loadPredefinedSets);
  const savePredefinedSetsStore = useRoutineStore((s) => s.savePredefinedSets);

  const exercises = useExerciseStore((s) => s.exercises);
  const loadExercises = useExerciseStore((s) => s.loadExercises);

  const loadWorkout = useWorkoutStore((s) => s.loadWorkout);
  const loadWorkouts = useWorkoutStore((s) => s.loadWorkouts);

  const [editMode, setEditMode] = useState(false);
  const [userId, setUserId] = useState("");
  const [newDayName, setNewDayName] = useState("");
  const [showDayInput, setShowDayInput] = useState(false);
  const [addingExToDay, setAddingExToDay] = useState<string | null>(null);
  const [selectedExId, setSelectedExId] = useState("");
  const [loggingDayId, setLoggingDayId] = useState<string | null>(null);

  // Predefined sets modal
  const [selectLogDayId, setSelectLogDayId] = useState<string | null>(null);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);

  const [psRdeId, setPsRdeId] = useState<string | null>(null);
  const [psExerciseId, setPsExerciseId] = useState<string>("");
  const [psLocalSets, setPsLocalSets] = useState<LocalPS[]>([]);
  const [psLoading, setPsLoading] = useState(false);
  const [psSaving, setPsSaving] = useState(false);
  const psLoadingForRef = useRef<string | null>(null);

  // Rename superset group modal
  const [showRenameGroup, setShowRenameGroup] = useState(false);
  const [renameGroupText, setRenameGroupText] = useState("");
  const [renamingGroup, setRenamingGroup] = useState<{ dayId: string; groupId: string } | null>(null);

  const routineRepo = useMemo(() => createRoutineRepository(supabase), []);
  const exRepo = useMemo(() => createExerciseRepository(supabase), []);
  const workoutRepo = useMemo(() => createWorkoutRepository(supabase), []);

  const routine = routines.find((r) => r.id === routineId);
  const days = (routineDays[routineId ?? ""] ?? []).slice().sort((a, b) => a.order_index - b.order_index);

  useEffect(() => {
    if (routine) navigation.setOptions({ headerTitle: routine.name });
  }, [routine, navigation]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) setUserId(session.user.id);

      const hasCache = exercises.length > 0;
      const [rRes, catRes, exRes] = await Promise.all([
        routineRepo.getRoutines(),
        hasCache ? Promise.resolve({ data: null }) : exRepo.getCategories(),
        hasCache ? Promise.resolve({ data: null }) : exRepo.getExercises(),
      ]);
      if (rRes.data) loadRoutines(rRes.data.map((r) => ({ id: r.id, name: r.name, notes: r.notes ?? undefined })));
      if (!hasCache && catRes.data && exRes.data) {
        loadExercises(catRes.data, exRes.data.map((ex) => ({
          id: ex.id, name: ex.name,
          category_id: ex.category_id ?? "",
          type: ex.type as ExerciseType,
          weight_unit: ex.weight_unit as "kg" | "lb",
          notes: ex.notes ?? undefined,
          is_favorite: ex.is_favorite,
          created_at: ex.created_at,
        })));
      }

      if (routineId) {
        const { data: daysData } = await routineRepo.getDays(routineId);
        if (daysData) {
          loadRoutineDays(routineId, daysData.map((d) => ({ id: d.id, routine_id: d.routine_id, name: d.name, order_index: d.order_index })));
          for (const day of daysData) {
            const { data: rdeData } = await routineRepo.getDayExercises(day.id);
            if (rdeData) {
              loadRoutineDayExercises(day.id, rdeData.map((e) => ({
                id: e.id, routine_day_id: e.routine_day_id, exercise_id: e.exercise_id,
                order_index: e.order_index, group_id: e.group_id ?? undefined,
                group_name: e.group_name ?? undefined,
              })));
            }
          }
        }
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineId]);

  async function handleAddDay() {
    if (!newDayName.trim() || !routineId) return;
    const { data, error } = await routineRepo.createDay({ routine_id: routineId, name: newDayName.trim(), order_index: days.length }, userId);
    if (error || !data) { Alert.alert("Error", error?.message ?? "Ha ocurrido un error"); return; }
    addRoutineDay({ id: data.id, routine_id: data.routine_id, name: data.name, order_index: data.order_index });
    loadRoutineDayExercises(data.id, []);
    setNewDayName("");
    setShowDayInput(false);
  }

  async function handleDeleteDay(dayId: string, name: string) {
    if (!routineId) return;
    Alert.alert("Eliminar día", `¿Eliminar "${name}" y todos sus ejercicios?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        await routineRepo.deleteDay(dayId);
        deleteRoutineDay(routineId, dayId);
      }},
    ]);
  }

  async function handleAddExercise(dayId: string, exerciseId: string) {
    const dayExs = routineDayExercises[dayId] ?? [];
    const { data, error } = await routineRepo.addExercise({ routine_day_id: dayId, exercise_id: exerciseId, order_index: dayExs.length }, userId);
    if (error || !data) { Alert.alert("Error", error?.message ?? "Ha ocurrido un error"); return; }
    addExerciseToDay({ id: data.id, routine_day_id: data.routine_day_id, exercise_id: data.exercise_id, order_index: data.order_index, group_id: data.group_id ?? undefined });
    setAddingExToDay(null);
    setSelectedExId("");
  }

  async function handleRemoveExercise(dayId: string, rdeId: string) {
    await routineRepo.removeExercise(rdeId);
    removeExerciseFromDay(dayId, rdeId);
  }

  async function handleRenameGroup(dayId: string, groupId: string, name: string) {
    const dayExs = routineDayExercises[dayId] ?? [];
    await routineRepo.updateDayGroupName(groupId, name);
    loadRoutineDayExercises(dayId, dayExs.map((e) =>
      e.group_id === groupId ? { ...e, group_name: name || undefined } : e
    ));
  }

  async function handleToggleSuperset(dayId: string, rde: RoutineDayExercise) {
    const dayExs = (routineDayExercises[dayId] ?? []).slice().sort((a, b) => a.order_index - b.order_index);

    if (rde.group_id) {
      Alert.alert("Superset", rde.group_name ?? "Superset", [
        {
          text: "Renombrar grupo",
          onPress: () => {
            setRenamingGroup({ dayId, groupId: rde.group_id! });
            setRenameGroupText(rde.group_name ?? "");
            setShowRenameGroup(true);
          },
        },
        {
          text: "Quitar del grupo",
          style: "destructive",
          onPress: async () => {
            const members = dayExs.filter((e) => e.group_id === rde.group_id);
            await Promise.all(members.map((e) => routineRepo.updateDayExercise(e.id, { group_id: null, group_name: null })));
            loadRoutineDayExercises(dayId, dayExs.map((e) =>
              members.find((m) => m.id === e.id) ? { ...e, group_id: undefined, group_name: undefined } : e
            ));
          },
        },
        { text: "Cancelar", style: "cancel" },
      ]);
      return;
    } else {
      // Agrupar con el siguiente ejercicio
      const idx = dayExs.findIndex((e) => e.id === rde.id);
      const next = dayExs[idx + 1];
      if (!next) {
        Alert.alert("Sin ejercicio siguiente", "Selecciona un ejercicio que no sea el último para crear un superset.");
        return;
      }
      // Si el siguiente ya pertenece a un grupo, unirse a ese grupo; si no, crear uno nuevo
      const groupId = next.group_id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await routineRepo.updateDayExercise(rde.id, { group_id: groupId });
      if (!next.group_id) await routineRepo.updateDayExercise(next.id, { group_id: groupId });
      loadRoutineDayExercises(dayId, dayExs.map((e) => {
        if (e.id === rde.id) return { ...e, group_id: groupId };
        if (e.id === next.id && !next.group_id) return { ...e, group_id: groupId };
        return e;
      }));
    }
  }

  async function handleDayDragEnd({ data }: { data: RoutineDay[] }) {
    if (!routineId) return;
    const prevOrder = days.map((d) => ({ id: d.id, order_index: d.order_index }));
    const updates = data.map((d, i) => ({ id: d.id, order_index: i }));
    reorderDaysStore(routineId, updates);
    const results = await routineRepo.reorderDays(updates);
    if (results.some((r) => r.error)) {
      reorderDaysStore(routineId, prevOrder);
      Alert.alert("Error", "No se pudo guardar el orden. Inténtalo de nuevo.");
    }
  }

  async function handleExDragEnd(dayId: string, data: RoutineDayExercise[]) {
    const prevOrder = (routineDayExercises[dayId] ?? []).map((e) => ({ id: e.id, order_index: e.order_index }));
    const updates = data.map((e, i) => ({ id: e.id, order_index: i }));
    reorderExercisesStore(dayId, updates);
    const results = await routineRepo.reorderExercises(updates);
    if (results.some((r) => r.error)) {
      reorderExercisesStore(dayId, prevOrder);
      Alert.alert("Error", "No se pudo guardar el orden. Inténtalo de nuevo.");
    }
  }

  // ─── Predefined sets ────────────────────────────────────────────────────────

  function psToLocal(sets: PredefinedSet[]): LocalPS[] {
    return sets.map((s, i) => ({
      localId: `${i}-${s.order_index}`,
      weight: s.weight != null ? String(s.weight) : "",
      reps: s.reps != null ? String(s.reps) : "",
      distance: s.distance != null ? String(s.distance) : "",
      time_seconds: s.time_seconds != null ? String(s.time_seconds) : "",
    }));
  }

  async function openPsModal(rdeId: string, exerciseId: string) {
    setPsRdeId(rdeId);
    setPsExerciseId(exerciseId);
    const cached = predefinedSets[rdeId];
    if (cached !== undefined) {
      setPsLocalSets(psToLocal(cached));
    } else {
      psLoadingForRef.current = rdeId;
      setPsLoading(true);
      const { data } = await routineRepo.getPredefinedSets(rdeId);
      if (psLoadingForRef.current !== rdeId) return; // modal cerrado/cambiado antes de que terminara
      const sets = (data ?? []).map((s) => ({
        id: s.id, routine_day_exercise_id: s.routine_day_exercise_id,
        weight: s.weight ?? undefined, reps: s.reps ?? undefined,
        distance: s.distance ?? undefined, time_seconds: s.time_seconds ?? undefined,
        order_index: s.order_index,
      }));
      loadPredefinedSets(rdeId, sets);
      setPsLocalSets(psToLocal(sets));
      setPsLoading(false);
    }
  }

  function psAddRow() {
    setPsLocalSets((prev) => [...prev, { localId: String(Date.now()), weight: "", reps: "", distance: "", time_seconds: "" }]);
  }

  function psUpdateRow(localId: string, field: "weight" | "reps" | "distance" | "time_seconds", value: string) {
    setPsLocalSets((prev) => prev.map((r) => r.localId === localId ? { ...r, [field]: value } : r));
  }

  function psRemoveRow(localId: string) {
    setPsLocalSets((prev) => prev.filter((r) => r.localId !== localId));
  }

  async function handleSavePredefinedSets() {
    if (!psRdeId) return;
    setPsSaving(true);
    const sets = psLocalSets.map((r, i) => ({
      weight: r.weight !== "" ? parseFloat(r.weight) : undefined,
      reps: r.reps !== "" ? parseInt(r.reps, 10) : undefined,
      distance: r.distance !== "" ? parseFloat(r.distance) : undefined,
      time_seconds: r.time_seconds !== "" ? parseInt(r.time_seconds, 10) : undefined,
      order_index: i,
    }));
    const { error } = await routineRepo.savePredefinedSets(psRdeId, sets, userId);
    if (error) { Alert.alert("Error", error.message); setPsSaving(false); return; }
    savePredefinedSetsStore(psRdeId, sets.map((s, i) => ({
      id: `local-${i}`, routine_day_exercise_id: psRdeId, ...s, order_index: i,
    })));
    setPsSaving(false);
    psLoadingForRef.current = null;
    setPsRdeId(null);
  }

  // ─── Log day ────────────────────────────────────────────────────────────────

  function openSelectLog(dayId: string) {
    const dayExs = (routineDayExercises[dayId] ?? []).slice().sort((a, b) => a.order_index - b.order_index);
    setSelectedExerciseIds(dayExs.map((rde) => rde.exercise_id));
    setSelectLogDayId(dayId);
  }

  async function handleLogDay(dayId: string, selectedIds: string[]) {
    const allDayExs = (routineDayExercises[dayId] ?? []).slice().sort((a, b) => a.order_index - b.order_index);
    const dayExs = allDayExs.filter((rde) => selectedIds.includes(rde.exercise_id));
    if (dayExs.length === 0) {
      Alert.alert("Sin ejercicios", "Añade ejercicios al día antes de registrar.");
      return;
    }

    setLoggingDayId(dayId);
    const today = todayISO();

    const { data: workout, error: wError } = await workoutRepo.createWorkout(
      { date: today, start_time: new Date().toISOString() },
      userId
    );
    if (wError || !workout) {
      Alert.alert("Error", wError?.message ?? "No se pudo crear el entrenamiento");
      setLoggingDayId(null);
      return;
    }

    const workoutExercisesCreated: Parameters<typeof loadWorkout>[1] = [];
    const setsMap: Parameters<typeof loadWorkout>[2] = {};

    for (let i = 0; i < dayExs.length; i++) {
      const rde = dayExs[i]!;
      const { data: we, error: weError } = await workoutRepo.addExercise(
        { workout_id: workout.id, exercise_id: rde.exercise_id, order_index: i, group_id: rde.group_id, group_name: rde.group_name },
        userId
      );
      if (weError || !we) continue;

      workoutExercisesCreated.push({
        id: we.id, workout_id: we.workout_id, exercise_id: we.exercise_id,
        order_index: we.order_index, group_id: we.group_id ?? undefined, group_name: we.group_name ?? undefined,
      });

      const { data: pSets } = await routineRepo.getPredefinedSets(rde.id);
      const createdSets: Parameters<typeof loadWorkout>[2][string] = [];

      for (const ps of pSets ?? []) {
        const { data: newSet } = await workoutRepo.createSet(
          {
            workout_exercise_id: we.id,
            weight: ps.weight ?? undefined, reps: ps.reps ?? undefined,
            distance: ps.distance ?? undefined, time_seconds: ps.time_seconds ?? undefined,
            order_index: ps.order_index,
          },
          userId
        );
        if (newSet) {
          createdSets.push({
            id: newSet.id, workout_exercise_id: newSet.workout_exercise_id,
            weight: newSet.weight ?? undefined, reps: newSet.reps ?? undefined,
            distance: newSet.distance ?? undefined, time_seconds: newSet.time_seconds ?? undefined,
            is_complete: newSet.is_complete, is_warmup: newSet.is_warmup ?? false, comment: newSet.comment ?? undefined,
            order_index: newSet.order_index,
          });
        }
      }

      setsMap[we.id] = createdSets;

      // Auto-update predefined sets with the values actually applied
      if ((pSets ?? []).length > 0 && createdSets.length > 0) {
        const updatedPs = createdSets.map((cs, pi) => ({
          weight: cs.weight, reps: cs.reps,
          distance: cs.distance, time_seconds: cs.time_seconds,
          order_index: pi,
        }));
        void routineRepo.savePredefinedSets(rde.id, updatedPs, userId).then(() => {
          savePredefinedSetsStore(rde.id, updatedPs.map((s, pi) => ({
            id: `local-${pi}`, routine_day_exercise_id: rde.id, ...s, order_index: pi,
          })));
        });
      }
    }

    loadWorkout(
      { id: workout.id, date: workout.date, start_time: workout.start_time ?? undefined },
      workoutExercisesCreated,
      setsMap
    );
    loadWorkouts([{ id: workout.id, date: workout.date }]);

    setLoggingDayId(null);
    Alert.alert("¡Listo!", "Entrenamiento registrado desde la rutina.", [
      { text: "Ver entrenamiento", onPress: () => router.replace("/(tabs)") },
    ]);
  }

  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));

  // ─── Render item: exercise row ───────────────────────────────────────────────

  function renderExerciseItem(dayId: string) {
    return ({ item: rde, drag }: RenderItemParams<RoutineDayExercise>) => {
      const ex = exerciseMap[rde.exercise_id];
      const psCount = (predefinedSets[rde.id] ?? []).length;
      const dayExsSorted = (routineDayExercises[dayId] ?? []).slice().sort((a, b) => a.order_index - b.order_index);
      const isFirstInGroup = rde.group_id && dayExsSorted.find((e) => e.group_id === rde.group_id)?.id === rde.id;
      return (
        <ScaleDecorator>
          <View>
            {isFirstInGroup && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2, paddingLeft: 11 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#6366f1" }} />
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#6366f1" }}>
                  {rde.group_name ?? "Superset"}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}>
              {rde.group_id && <View style={{ width: 3, height: 28, borderRadius: 2, backgroundColor: "#6366f1" }} />}
              {editMode && (
                <TouchableOpacity onLongPress={drag} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <Ionicons name="menu-outline" size={16} color="#cbd5e1" />
                </TouchableOpacity>
              )}
              <Text style={{ flex: 1, fontSize: 13, color: "#0f172a" }}>{ex?.name ?? rde.exercise_id}</Text>
              {editMode && (
                <TouchableOpacity
                  onPress={() => handleToggleSuperset(dayId, rde)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="link-outline" size={16} color={rde.group_id ? "#6366f1" : "#cbd5e1"} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => openPsModal(rde.id, rde.exercise_id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
              >
                <Ionicons name="list-outline" size={14} color={psCount > 0 ? "#6366f1" : "#cbd5e1"} />
                {psCount > 0 && <Text style={{ fontSize: 11, color: "#6366f1", fontWeight: "600" }}>{psCount}</Text>}
              </TouchableOpacity>
              {editMode && (
                <TouchableOpacity onPress={() => handleRemoveExercise(dayId, rde.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
            {psCount > 0 && (
              <View style={{ marginLeft: rde.group_id ? 11 : 0, marginTop: 3, gap: 2 }}>
                {(predefinedSets[rde.id] ?? []).map((ps, pi) => {
                  const fields = ex ? getExerciseFields(ex.type) : { weight: false, reps: false, distance: false, time: false };
                  const parts: string[] = [];
                  if (fields.weight && ps.weight != null) parts.push(`${ps.weight} kg`);
                  else if (fields.weight) parts.push("— kg");
                  if (fields.reps && ps.reps != null) parts.push(`${ps.reps} reps`);
                  else if (fields.reps) parts.push("— reps");
                  if (fields.distance && ps.distance != null) parts.push(`${ps.distance} m`);
                  else if (fields.distance) parts.push("— m");
                  if (fields.time && ps.time_seconds != null) parts.push(`${ps.time_seconds} s`);
                  else if (fields.time) parts.push("— s");
                  return (
                    <Text key={pi} style={{ fontSize: 11, color: "#64748b" }}>
                      {pi + 1}. {parts.join("  ·  ")}
                    </Text>
                  );
                })}
              </View>
            )}
          </View>
        </ScaleDecorator>
      );
    };
  }

  // ─── Render item: day card ───────────────────────────────────────────────────

  function renderDayItem({ item: day, drag }: RenderItemParams<RoutineDay>) {
    const dayExs = (routineDayExercises[day.id] ?? []).slice().sort((a, b) => a.order_index - b.order_index);
    const isLoggingThis = loggingDayId === day.id;
    return (
      <ScaleDecorator>
        <View style={{ borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, backgroundColor: "#fff", overflow: "hidden", marginBottom: 12 }}>
          {/* Day header */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#f8fafc", gap: 8 }}>
            {editMode && (
              <TouchableOpacity onLongPress={drag} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Ionicons name="menu-outline" size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}
            <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{day.name}</Text>
            <Text style={{ fontSize: 12, color: "#94a3b8" }}>{dayExs.length} ejercicios</Text>
            {editMode && (
              <TouchableOpacity onPress={() => handleDeleteDay(day.id, day.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={14} color="#ef4444" />
              </TouchableOpacity>
            )}
            {!editMode && (
              <TouchableOpacity
                onPress={() => openSelectLog(day.id)}
                disabled={isLoggingThis}
                style={{ backgroundColor: "#6366f1", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, opacity: isLoggingThis ? 0.6 : 1, flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                {isLoggingThis && <ActivityIndicator size="small" color="#fff" />}
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#fff" }}>
                  {isLoggingThis ? "Registrando…" : "Registrar"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Exercises */}
          <View style={{ padding: 10, gap: 6 }}>
            <NestableDraggableFlatList
              data={dayExs}
              keyExtractor={(rde) => rde.id}
              onDragEnd={({ data }) => handleExDragEnd(day.id, data)}
              renderItem={renderExerciseItem(day.id)}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            />

            {/* Add exercise inline picker */}
            {editMode && addingExToDay === day.id ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {exercises.map((ex) => (
                    <TouchableOpacity
                      key={ex.id}
                      onPress={() => setSelectedExId(ex.id)}
                      style={{ borderRadius: 8, borderWidth: 1, borderColor: selectedExId === ex.id ? "#6366f1" : "#e2e8f0", backgroundColor: selectedExId === ex.id ? "#6366f1" : "transparent", paddingHorizontal: 10, paddingVertical: 5 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "500", color: selectedExId === ex.id ? "#fff" : "#0f172a" }}>{ex.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TouchableOpacity onPress={() => { setAddingExToDay(null); setSelectedExId(""); }} style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}>
                    <Text style={{ fontSize: 12 }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => selectedExId && handleAddExercise(day.id, selectedExId)} style={{ flex: 1, backgroundColor: "#6366f1", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}>Añadir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : editMode ? (
              <TouchableOpacity onPress={() => { setAddingExToDay(day.id); setSelectedExId(""); }} style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 8, paddingVertical: 8, alignItems: "center", marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: "#94a3b8" }}>+ Añadir ejercicio</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </ScaleDecorator>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Edit toggle */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 8 }}>
        {!editMode && (
          <Text style={{ fontSize: 12, color: "#94a3b8" }}>Pulsa Editar para gestionar días y ejercicios</Text>
        )}
        <TouchableOpacity
          onPress={() => setEditMode((v) => !v)}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: editMode ? "#6366f1" : "#6366f1" }}
        >
          <Ionicons name={editMode ? "checkmark" : "create-outline"} size={15} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#fff" }}>{editMode ? "Listo" : "Editar"}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <NestableScrollContainer contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}>
          {/* Notes */}
          {routine?.notes ? (
            <Text style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>{routine.notes}</Text>
          ) : null}

          {/* Days */}
          {days.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, padding: 32, alignItems: "center", gap: 12 }}>
              <Ionicons name="calendar-outline" size={36} color="#94a3b8" />
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>Sin días aún</Text>
              <Text style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>Pulsa el botón Editar (arriba a la derecha) y luego + Añadir día.</Text>
              <TouchableOpacity
                onPress={() => setEditMode(true)}
                style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}
              >
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Empezar a editar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <NestableDraggableFlatList
              data={days}
              keyExtractor={(item) => item.id}
              onDragEnd={handleDayDragEnd}
              renderItem={renderDayItem}
              scrollEnabled={false}
            />
          )}

          {/* Add day */}
          {editMode && (
            showDayInput ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <TextInput
                  style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 }}
                  placeholder="Nombre del día (ej. Empuje)"
                  value={newDayName}
                  onChangeText={setNewDayName}
                  autoFocus
                  onSubmitEditing={handleAddDay}
                />
                <TouchableOpacity onPress={handleAddDay} style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Añadir</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setShowDayInput(true)} style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, paddingVertical: 14, alignItems: "center", marginTop: 4 }}>
                <Text style={{ fontSize: 13, color: "#94a3b8" }}>+ Añadir día</Text>
              </TouchableOpacity>
            )
          )}
        </NestableScrollContainer>
      )}

      {/* Predefined Sets Modal */}
      <Modal visible={psRdeId !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPsRdeId(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: "#0f172a" }}>
                {exerciseMap[psExerciseId]?.name ?? "Series predefinidas"}
              </Text>
              <TouchableOpacity onPress={() => setPsRdeId(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 12, color: "#94a3b8" }}>
                Deja un campo vacío para que copie el valor del último entrenamiento registrado.
              </Text>

              {psLoading ? (
                <ActivityIndicator color="#6366f1" style={{ marginTop: 24 }} />
              ) : (
                <>
                  {psLocalSets.length > 0 && (() => {
                    const ex = exerciseMap[psExerciseId];
                    const fields = ex ? getExerciseFields(ex.type) : { weight: false, reps: false, distance: false, time: false };
                    return (
                      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 4 }}>
                        <Text style={{ width: 24, fontSize: 11, color: "#94a3b8" }}>#</Text>
                        {fields.weight && <Text style={{ flex: 1, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>Peso (kg)</Text>}
                        {fields.reps && <Text style={{ flex: 1, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>Reps</Text>}
                        {fields.distance && <Text style={{ flex: 1, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>Dist (m)</Text>}
                        {fields.time && <Text style={{ flex: 1, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>Tiempo (s)</Text>}
                        <View style={{ width: 24 }} />
                      </View>
                    );
                  })()}

                  {psLocalSets.map((row, idx) => {
                    const ex = exerciseMap[psExerciseId];
                    const fields = ex ? getExerciseFields(ex.type) : { weight: false, reps: false, distance: false, time: false };
                    return (
                      <View key={row.localId} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ width: 24, fontSize: 13, color: "#94a3b8", textAlign: "center" }}>{idx + 1}</Text>
                        {fields.weight && (
                          <TextInput
                            style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, textAlign: "center", color: "#0f172a" }}
                            placeholder="—" placeholderTextColor="#cbd5e1" keyboardType="decimal-pad"
                            value={row.weight} onChangeText={(v) => psUpdateRow(row.localId, "weight", v)}
                          />
                        )}
                        {fields.reps && (
                          <TextInput
                            style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, textAlign: "center", color: "#0f172a" }}
                            placeholder="—" placeholderTextColor="#cbd5e1" keyboardType="number-pad"
                            value={row.reps} onChangeText={(v) => psUpdateRow(row.localId, "reps", v)}
                          />
                        )}
                        {fields.distance && (
                          <TextInput
                            style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, textAlign: "center", color: "#0f172a" }}
                            placeholder="—" placeholderTextColor="#cbd5e1" keyboardType="decimal-pad"
                            value={row.distance} onChangeText={(v) => psUpdateRow(row.localId, "distance", v)}
                          />
                        )}
                        {fields.time && (
                          <TextInput
                            style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, textAlign: "center", color: "#0f172a" }}
                            placeholder="—" placeholderTextColor="#cbd5e1" keyboardType="number-pad"
                            value={row.time_seconds} onChangeText={(v) => psUpdateRow(row.localId, "time_seconds", v)}
                          />
                        )}
                        <TouchableOpacity onPress={() => psRemoveRow(row.localId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 24, alignItems: "center" }}>
                          <Ionicons name="close-circle" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    onPress={psAddRow}
                    style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 4 }}
                  >
                    <Text style={{ fontSize: 13, color: "#6366f1", fontWeight: "600" }}>+ Añadir serie</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSavePredefinedSets}
                    disabled={psSaving}
                    style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: psSaving ? 0.6 : 1, marginTop: 8 }}
                  >
                    <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{psSaving ? "Guardando…" : "Guardar"}</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Select exercises modal */}
      <Modal visible={selectLogDayId !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectLogDayId(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: "#0f172a" }}>Seleccionar ejercicios</Text>
            <TouchableOpacity onPress={() => setSelectLogDayId(null)}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
            {(routineDayExercises[selectLogDayId ?? ""] ?? [])
              .slice()
              .sort((a, b) => a.order_index - b.order_index)
              .map((rde) => {
                const ex = exerciseMap[rde.exercise_id];
                const isSelected = selectedExerciseIds.includes(rde.exercise_id);
                return (
                  <TouchableOpacity
                    key={rde.id}
                    onPress={() => setSelectedExerciseIds((prev) =>
                      isSelected ? prev.filter((id) => id !== rde.exercise_id) : [...prev, rde.exercise_id]
                    )}
                    style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: isSelected ? "#6366f1" : "#f1f5f9", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: isSelected ? "#6366f108" : "#fff" }}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: isSelected ? "#6366f1" : "#cbd5e1", backgroundColor: isSelected ? "#6366f1" : "transparent", alignItems: "center", justifyContent: "center" }}>
                      {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: "#0f172a" }}>{ex?.name ?? rde.exercise_id}</Text>
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
          <View style={{ padding: 16, borderTopWidth: 1, borderColor: "#f1f5f9", flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                const allIds = (routineDayExercises[selectLogDayId ?? ""] ?? []).map((rde) => rde.exercise_id);
                setSelectedExerciseIds(selectedExerciseIds.length === allIds.length ? [] : allIds);
              }}
              style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, color: "#64748b" }}>
                {selectedExerciseIds.length === (routineDayExercises[selectLogDayId ?? ""] ?? []).length ? "Deseleccionar todo" : "Seleccionar todo"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (selectedExerciseIds.length === 0) return;
                const dayId = selectLogDayId!;
                setSelectLogDayId(null);
                handleLogDay(dayId, selectedExerciseIds);
              }}
              disabled={selectedExerciseIds.length === 0}
              style={{ flex: 1, backgroundColor: selectedExerciseIds.length === 0 ? "#e2e8f0" : "#6366f1", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: selectedExerciseIds.length === 0 ? "#94a3b8" : "#fff" }}>
                Registrar {selectedExerciseIds.length} ejercicio{selectedExerciseIds.length !== 1 ? "s" : ""}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Rename superset group modal */}
      <Modal visible={showRenameGroup} animationType="fade" transparent onRequestClose={() => setShowRenameGroup(false)}>
        <View style={{ flex: 1, backgroundColor: "#00000060", justifyContent: "center", paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>Nombre del superset</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 }}
              value={renameGroupText}
              onChangeText={setRenameGroupText}
              placeholder="Ej. Pecho + Tríceps"
              placeholderTextColor="#cbd5e1"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                if (renamingGroup) void handleRenameGroup(renamingGroup.dayId, renamingGroup.groupId, renameGroupText);
                setShowRenameGroup(false);
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setShowRenameGroup(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center" }}>
                <Text style={{ fontSize: 14, color: "#64748b" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (renamingGroup) void handleRenameGroup(renamingGroup.dayId, renamingGroup.groupId, renameGroupText);
                  setShowRenameGroup(false);
                }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#6366f1", alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

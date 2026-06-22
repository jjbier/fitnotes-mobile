import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRoutineStore, useExerciseStore, useWorkoutStore, ExerciseType, todayISO } from "@fitnotes/core";
import { createRoutineRepository, createExerciseRepository, createWorkoutRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

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
  const setLoading = useRoutineStore((s) => s.setLoading);

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

  const routineRepo = createRoutineRepository(supabase);
  const exRepo = createExerciseRepository(supabase);
  const workoutRepo = createWorkoutRepository(supabase);

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

      const [rRes, catRes, exRes] = await Promise.all([
        routineRepo.getRoutines(),
        exRepo.getCategories(),
        exRepo.getExercises(),
      ]);
      if (rRes.data) loadRoutines(rRes.data.map((r) => ({ id: r.id, name: r.name, notes: r.notes ?? undefined })));
      if (catRes.data && exRes.data) {
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

  async function handleLogDay(dayId: string) {
    const dayExs = (routineDayExercises[dayId] ?? []).slice().sort((a, b) => a.order_index - b.order_index);
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
        { workout_id: workout.id, exercise_id: rde.exercise_id, order_index: i },
        userId
      );
      if (weError || !we) continue;

      workoutExercisesCreated.push({
        id: we.id,
        workout_id: we.workout_id,
        exercise_id: we.exercise_id,
        order_index: we.order_index,
        group_id: we.group_id ?? undefined,
      });

      const { data: predefinedSets } = await routineRepo.getPredefinedSets(rde.id);
      const createdSets: Parameters<typeof loadWorkout>[2][string] = [];

      for (const ps of predefinedSets ?? []) {
        const { data: newSet } = await workoutRepo.createSet(
          {
            workout_exercise_id: we.id,
            weight: ps.weight ?? undefined,
            reps: ps.reps ?? undefined,
            distance: ps.distance ?? undefined,
            time_seconds: ps.time_seconds ?? undefined,
            order_index: ps.order_index,
          },
          userId
        );
        if (newSet) {
          createdSets.push({
            id: newSet.id,
            workout_exercise_id: newSet.workout_exercise_id,
            weight: newSet.weight ?? undefined,
            reps: newSet.reps ?? undefined,
            distance: newSet.distance ?? undefined,
            time_seconds: newSet.time_seconds ?? undefined,
            is_complete: newSet.is_complete,
            comment: newSet.comment ?? undefined,
            order_index: newSet.order_index,
          });
        }
      }

      setsMap[we.id] = createdSets;
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Edit toggle */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        <TouchableOpacity
          onPress={() => setEditMode((v) => !v)}
          style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: editMode ? "#6366f1" : "#f1f5f9" }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: editMode ? "#fff" : "#0f172a" }}>{editMode ? "Listo" : "Editar"}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60, gap: 12 }}>
          {/* Notes */}
          {routine?.notes ? (
            <Text style={{ fontSize: 13, color: "#64748b" }}>{routine.notes}</Text>
          ) : null}

          {/* Days */}
          {days.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, padding: 32, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: "#94a3b8" }}>Sin días aún. Activa Editar para añadir días.</Text>
            </View>
          ) : (
            days.map((day) => {
              const dayExs = (routineDayExercises[day.id] ?? []).slice().sort((a, b) => a.order_index - b.order_index);
              const isLoggingThis = loggingDayId === day.id;
              return (
                <View key={day.id} style={{ borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, backgroundColor: "#fff", overflow: "hidden" }}>
                  {/* Day header */}
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#f8fafc", gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{day.name}</Text>
                    <Text style={{ fontSize: 12, color: "#94a3b8" }}>{dayExs.length} ejercicios</Text>
                    {editMode && (
                      <TouchableOpacity onPress={() => handleDeleteDay(day.id, day.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                    {!editMode && (
                      <TouchableOpacity
                        onPress={() => handleLogDay(day.id)}
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
                    {dayExs.map((rde) => {
                      const ex = exerciseMap[rde.exercise_id];
                      return (
                        <View key={rde.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          {rde.group_id && <View style={{ width: 3, height: 28, borderRadius: 2, backgroundColor: "#6366f1" }} />}
                          <Text style={{ flex: 1, fontSize: 13, color: "#0f172a" }}>{ex?.name ?? rde.exercise_id}</Text>
                          <Text style={{ fontSize: 11, color: "#94a3b8" }}>{ex?.type?.replace(/_/g, " ").toLowerCase()}</Text>
                          {editMode && (
                            <TouchableOpacity onPress={() => handleRemoveExercise(day.id, rde.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="close-circle" size={16} color="#ef4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}

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
              );
            })
          )}

          {/* Add day */}
          {editMode && (
            showDayInput ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
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
              <TouchableOpacity onPress={() => setShowDayInput(true)} style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, paddingVertical: 14, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: "#94a3b8" }}>+ Añadir día</Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

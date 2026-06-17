import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRoutineStore, useExerciseStore, ExerciseType } from "@fitnotes/core";
import { createRoutineRepository, createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

export default function RoutineDetailScreen() {
  const { id: routineId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

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

  const [editMode, setEditMode] = useState(false);
  const [userId, setUserId] = useState("");
  const [newDayName, setNewDayName] = useState("");
  const [showDayInput, setShowDayInput] = useState(false);
  const [addingExToDay, setAddingExToDay] = useState<string | null>(null);
  const [selectedExId, setSelectedExId] = useState("");

  const repo = createRoutineRepository(supabase);
  const exRepo = createExerciseRepository(supabase);

  const routine = routines.find((r) => r.id === routineId);
  const days = (routineDays[routineId ?? ""] ?? []).slice().sort((a, b) => a.order_index - b.order_index);

  useEffect(() => {
    if (routine) navigation.setOptions({ headerTitle: routine.name });
  }, [routine, navigation]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);

      const [rRes, catRes, exRes] = await Promise.all([
        repo.getRoutines(),
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
        const { data: daysData } = await repo.getDays(routineId);
        if (daysData) {
          loadRoutineDays(routineId, daysData.map((d) => ({ id: d.id, routine_id: d.routine_id, name: d.name, order_index: d.order_index })));
          for (const day of daysData) {
            const { data: rdeData } = await repo.getDayExercises(day.id);
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
    const { data, error } = await repo.createDay({ routine_id: routineId, name: newDayName.trim(), order_index: days.length }, userId);
    if (error || !data) { Alert.alert("Error", error?.message ?? "Failed"); return; }
    addRoutineDay({ id: data.id, routine_id: data.routine_id, name: data.name, order_index: data.order_index });
    loadRoutineDayExercises(data.id, []);
    setNewDayName("");
    setShowDayInput(false);
  }

  async function handleDeleteDay(dayId: string, name: string) {
    if (!routineId) return;
    Alert.alert("Delete day", `Delete "${name}" and all its exercises?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await repo.deleteDay(dayId);
        deleteRoutineDay(routineId, dayId);
      }},
    ]);
  }

  async function handleAddExercise(dayId: string, exerciseId: string) {
    const dayExs = routineDayExercises[dayId] ?? [];
    const { data, error } = await repo.addExercise({ routine_day_id: dayId, exercise_id: exerciseId, order_index: dayExs.length }, userId);
    if (error || !data) { Alert.alert("Error", error?.message ?? "Failed"); return; }
    addExerciseToDay({ id: data.id, routine_day_id: data.routine_day_id, exercise_id: data.exercise_id, order_index: data.order_index, group_id: data.group_id ?? undefined });
    setAddingExToDay(null);
    setSelectedExId("");
  }

  async function handleRemoveExercise(dayId: string, rdeId: string) {
    await repo.removeExercise(rdeId);
    removeExerciseFromDay(dayId, rdeId);
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
          <Text style={{ fontSize: 13, fontWeight: "600", color: editMode ? "#fff" : "#0f172a" }}>{editMode ? "Done" : "Edit"}</Text>
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
              <Text style={{ fontSize: 13, color: "#94a3b8" }}>No days yet. Toggle Edit to add days.</Text>
            </View>
          ) : (
            days.map((day) => {
              const dayExs = (routineDayExercises[day.id] ?? []).slice().sort((a, b) => a.order_index - b.order_index);
              return (
                <View key={day.id} style={{ borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, backgroundColor: "#fff", overflow: "hidden" }}>
                  {/* Day header */}
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#f8fafc", gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{day.name}</Text>
                    <Text style={{ fontSize: 12, color: "#94a3b8" }}>{dayExs.length} exercises</Text>
                    {editMode && (
                      <TouchableOpacity onPress={() => handleDeleteDay(day.id, day.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                    {!editMode && (
                      <TouchableOpacity onPress={() => Alert.alert("Log All", "Will be wired in Phase 3")} style={{ backgroundColor: "#6366f1", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: "#fff" }}>Log All</Text>
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
                            <Text style={{ fontSize: 12 }}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => selectedExId && handleAddExercise(day.id, selectedExId)} style={{ flex: 1, backgroundColor: "#6366f1", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}>Add</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : editMode ? (
                      <TouchableOpacity onPress={() => { setAddingExToDay(day.id); setSelectedExId(""); }} style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 8, paddingVertical: 8, alignItems: "center", marginTop: 4 }}>
                        <Text style={{ fontSize: 12, color: "#94a3b8" }}>+ Add exercise</Text>
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
                  placeholder="Day name (e.g. Push)"
                  value={newDayName}
                  onChangeText={setNewDayName}
                  autoFocus
                  onSubmitEditing={handleAddDay}
                />
                <TouchableOpacity onPress={handleAddDay} style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Add</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setShowDayInput(true)} style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, paddingVertical: 14, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: "#94a3b8" }}>+ Add day</Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

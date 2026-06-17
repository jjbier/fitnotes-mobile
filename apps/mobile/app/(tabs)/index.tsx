import { useEffect, useState, useCallback } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useWorkoutStore, useExerciseStore, formatWorkoutDate, todayISO, ExerciseType } from "@fitnotes/core";
import { createWorkoutRepository, createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

export default function HomeScreen() {
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
  const addExerciseToWorkout = useWorkoutStore((s) => s.addExerciseToWorkout);
  const finishWorkout = useWorkoutStore((s) => s.finishWorkout);
  const setLoading = useWorkoutStore((s) => s.setLoading);

  const exercises = useExerciseStore((s) => s.exercises);
  const loadExercises = useExerciseStore((s) => s.loadExercises);

  const [userId, setUserId] = useState("");
  const [currentDate, setCurrentDate] = useState(today);

  const repo = createWorkoutRepository(supabase);
  const exRepo = createExerciseRepository(supabase);

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
        is_complete: s.is_complete, comment: s.comment ?? undefined, order_index: s.order_index,
      }));
    }
    loadWorkout(
      { id: workout.id, date: workout.date, comment: workout.comment ?? undefined, start_time: workout.start_time ?? undefined, end_time: workout.end_time ?? undefined },
      (wExercises ?? []).map((we) => ({ id: we.id, workout_id: we.workout_id, exercise_id: we.exercise_id, order_index: we.order_index, group_id: we.group_id ?? undefined })),
      setsMap
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);

      const [catRes, exRes, recentRes] = await Promise.all([
        exRepo.getCategories(),
        exRepo.getExercises(),
        repo.getWorkouts(10),
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
      await loadWorkoutForDate(today);
      setLoading(false);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartWorkout() {
    const { data, error } = await repo.createWorkout({ date: currentDate, start_time: new Date().toISOString() }, userId);
    if (error || !data) { Alert.alert("Error", error?.message ?? "Failed"); return; }
    startWorkout(currentDate);
    loadWorkout({ id: data.id, date: data.date, start_time: data.start_time ?? undefined }, [], {});
  }

  async function handleFinish() {
    if (!activeWorkout) return;
    Alert.alert("Finish Workout?", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Finish", onPress: async () => {
        await repo.updateWorkout(activeWorkout.id, { end_time: new Date().toISOString() });
        finishWorkout();
      }},
    ]);
  }

  async function handleNavigateDate(delta: number) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + delta);
    const newDate = date.toISOString().split("T")[0]!;
    setCurrentDate(newDate);
    await loadWorkoutForDate(newDate);
  }

  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Date nav header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 }}>
        <TouchableOpacity onPress={() => handleNavigateDate(-1)} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={20} color="#64748b" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#0f172a" }}>
            {currentDate === today ? "Today" : formatWorkoutDate(currentDate)}
          </Text>
          {currentDate === today && (
            <Text style={{ fontSize: 13, color: "#94a3b8" }}>{formatWorkoutDate(today)}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => handleNavigateDate(1)} disabled={currentDate >= today} style={{ padding: 6, opacity: currentDate >= today ? 0.4 : 1 }}>
          <Ionicons name="chevron-forward" size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60, gap: 12 }}>
          {!activeWorkout || !activeWorkout.id ? (
            /* No workout */
            <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 20, padding: 40, alignItems: "center", gap: 12, marginTop: 8 }}>
              <Ionicons name="barbell-outline" size={40} color="#94a3b8" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>No workout yet</Text>
              <Text style={{ fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
                Start a workout to log your sets and track progress.
              </Text>
              <TouchableOpacity onPress={handleStartWorkout} style={{ backgroundColor: "#6366f1", borderRadius: 14, paddingHorizontal: 32, paddingVertical: 12 }}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Start Workout</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Active workout */
            <View style={{ gap: 8 }}>
              {workoutExercises.map((we) => {
                const ex = exerciseMap[we.exercise_id];
                const weSets = (sets[we.id] ?? []);
                const completedCount = weSets.filter((s) => s.is_complete).length;
                return (
                  <TouchableOpacity
                    key={we.id}
                    onPress={() => router.push(`/workout/${we.exercise_id}`)}
                    style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{ex?.name ?? we.exercise_id}</Text>
                      <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                        {weSets.length} sets · {completedCount} complete
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                onPress={() => router.push("/exercises")}
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, paddingVertical: 14, alignItems: "center" }}
              >
                <Text style={{ fontSize: 13, color: "#94a3b8" }}>+ Add Exercise</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleFinish} style={{ borderWidth: 1, borderColor: "#ef4444", borderRadius: 14, paddingVertical: 12, alignItems: "center", marginTop: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#ef4444" }}>Finish Workout</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Recent workouts */}
          {workouts.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>Recent Activity</Text>
              {workouts.slice(0, 5).map((w) => (
                <TouchableOpacity
                  key={w.id}
                  onPress={() => { setCurrentDate(w.date); loadWorkoutForDate(w.date); }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }}
                >
                  <Text style={{ fontSize: 13, color: "#0f172a" }}>{formatWorkoutDate(w.date)}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

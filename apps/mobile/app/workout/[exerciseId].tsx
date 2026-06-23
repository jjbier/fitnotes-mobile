import { useEffect, useRef, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useWorkoutStore, useExerciseStore, ExerciseType } from "@fitnotes/core";
import { createWorkoutRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import type { Set as FitSet } from "@fitnotes/core";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TrainingScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();

  const exercises = useExerciseStore((s) => s.exercises);
  const exercise = exercises.find((e) => e.id === exerciseId);

  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const workoutExercises = useWorkoutStore((s) => s.exercises);
  const sets = useWorkoutStore((s) => s.sets);
  const createSet = useWorkoutStore((s) => s.createSet);
  const updateSet = useWorkoutStore((s) => s.updateSet);
  const deleteSet = useWorkoutStore((s) => s.deleteSet);
  const markSetComplete = useWorkoutStore((s) => s.markSetComplete);
  const addExerciseToWorkout = useWorkoutStore((s) => s.addExerciseToWorkout);
  const removeExerciseFromWorkout = useWorkoutStore((s) => s.removeExerciseFromWorkout);

  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");

  // Rest timer
  const [timerDuration, setTimerDuration] = useState(90);
  const [timerRemaining, setTimerRemaining] = useState(90);
  const [timerRunning, setTimerRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const repo = createWorkoutRepository(supabase);

  const workoutExercise = workoutExercises.find((we) => we.exercise_id === exerciseId);
  const exerciseSets = (workoutExercise ? sets[workoutExercise.id] ?? [] : []).slice().sort((a, b) => a.order_index - b.order_index);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        setWeightUnit((session.user.user_metadata?.weight_unit as "kg" | "lb" | undefined) ?? "kg");
      }
    });
  }, []);

  useEffect(() => {
    if (exercise && userId) {
      if (activeWorkout && activeWorkout.id && !workoutExercise) {
        async function addToWorkout() {
          if (!activeWorkout?.id) return;
          const { data, error } = await repo.addExercise({
            workout_id: activeWorkout.id,
            exercise_id: exerciseId ?? "",
            order_index: workoutExercises.length,
          }, userId);
          if (!error && data) {
            addExerciseToWorkout(exerciseId ?? "", data.id);
          }
        }
        addToWorkout();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, activeWorkout?.id, userId]);

  // Timer tick
  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setTimerRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setTimerRunning(false);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerRunning]);

  function handleTimerToggle() {
    if (timerRemaining === 0) {
      setTimerRemaining(timerDuration);
      setTimerRunning(true);
    } else {
      setTimerRunning((v) => !v);
    }
  }

  function handleTimerReset() {
    setTimerRunning(false);
    setTimerRemaining(timerDuration);
  }

  function handleChangeDuration(delta: number) {
    const next = Math.max(15, timerDuration + delta);
    setTimerDuration(next);
    if (!timerRunning) setTimerRemaining(next);
  }

  async function handleRemoveExercise() {
    if (!workoutExercise) return;
    Alert.alert(`¿Eliminar "${exercise?.name ?? "ejercicio"}"?`, "Se eliminarán todas sus series.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        removeExerciseFromWorkout(workoutExercise.id);
        await repo.removeExercise(workoutExercise.id);
        router.back();
      }},
    ]);
  }

  async function handleAddSet() {
    if (!workoutExercise) return;
    setSaving(true);
    const { data, error } = await repo.createSet({
      workout_exercise_id: workoutExercise.id,
      order_index: exerciseSets.length,
    }, userId);
    if (!error && data) {
      createSet(workoutExercise.id, {
        id: data.id, workout_exercise_id: data.workout_exercise_id,
        is_complete: data.is_complete, order_index: data.order_index,
      });
    }
    setSaving(false);
  }

  async function handleUpdateField(setId: string, field: keyof FitSet, rawValue: string) {
    if (!workoutExercise) return;
    const numericFields = ["weight", "reps", "distance", "time_seconds"] as const;
    const isNumeric = numericFields.includes(field as typeof numericFields[number]);
    const value = isNumeric ? (rawValue ? parseFloat(rawValue) : undefined) : rawValue;
    const patch = { [field]: value } as Partial<FitSet>;
    updateSet(workoutExercise.id, setId, patch);
    await repo.updateSet(setId, patch);
  }

  async function handleToggleComplete(setId: string, current: boolean) {
    if (!workoutExercise) return;
    await repo.updateSet(setId, { is_complete: !current });
    markSetComplete(workoutExercise.id, setId, !current);
  }

  async function handleDeleteSet(setId: string) {
    if (!workoutExercise) return;
    Alert.alert("¿Eliminar serie?", undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        await repo.deleteSet(setId);
        deleteSet(workoutExercise.id, setId);
      }},
    ]);
  }

  const exerciseType = (exercise?.type ?? ExerciseType.WEIGHT_REPS) as ExerciseType;
  const showWeight = [ExerciseType.WEIGHT_REPS, ExerciseType.WEIGHT_ONLY, ExerciseType.WEIGHT_DISTANCE, ExerciseType.WEIGHT_TIME].includes(exerciseType);
  const showReps = [ExerciseType.WEIGHT_REPS, ExerciseType.REPS_ONLY, ExerciseType.REPS_DISTANCE, ExerciseType.REPS_TIME].includes(exerciseType);
  const showDistance = [ExerciseType.DISTANCE_TIME, ExerciseType.WEIGHT_DISTANCE, ExerciseType.REPS_DISTANCE, ExerciseType.DISTANCE_ONLY].includes(exerciseType);
  const showTime = [ExerciseType.DISTANCE_TIME, ExerciseType.TIME_ONLY, ExerciseType.WEIGHT_TIME, ExerciseType.REPS_TIME].includes(exerciseType);

  const timerFinished = timerRemaining === 0;
  const timerActive = timerRunning;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>{exercise?.name ?? "Ejercicio"}</Text>
          <Text style={{ fontSize: 11, color: "#94a3b8" }}>{exerciseType.replace(/_/g, " ").toLowerCase()}</Text>
        </View>
        <TouchableOpacity onPress={handleRemoveExercise} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* Rest Timer */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f8fafc", gap: 8, backgroundColor: timerActive ? "#f0f0ff" : timerFinished ? "#f0fff4" : "#fafafa" }}>
        <Ionicons name="timer-outline" size={16} color={timerActive ? "#6366f1" : timerFinished ? "#22c55e" : "#94a3b8"} />
        {/* Duration controls */}
        <TouchableOpacity onPress={() => handleChangeDuration(-15)} disabled={timerRunning} style={{ padding: 4, opacity: timerRunning ? 0.4 : 1 }}>
          <Ionicons name="remove-circle-outline" size={20} color="#64748b" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: timerActive ? "#6366f1" : timerFinished ? "#22c55e" : "#0f172a", minWidth: 52, textAlign: "center" }}>
          {formatTime(timerRemaining)}
        </Text>
        <TouchableOpacity onPress={() => handleChangeDuration(15)} disabled={timerRunning} style={{ padding: 4, opacity: timerRunning ? 0.4 : 1 }}>
          <Ionicons name="add-circle-outline" size={20} color="#64748b" />
        </TouchableOpacity>
        {/* Start / Pause */}
        <TouchableOpacity
          onPress={handleTimerToggle}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: timerActive ? "#6366f1" : "#6366f1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Ionicons name={timerActive ? "pause" : timerFinished ? "refresh" : "play"} size={14} color="#fff" />
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}>
            {timerActive ? "Pausar" : timerFinished ? "Reiniciar" : "Iniciar"}
          </Text>
        </TouchableOpacity>
        {/* Reset */}
        <TouchableOpacity onPress={handleTimerReset} style={{ padding: 4 }}>
          <Ionicons name="refresh-outline" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 60, gap: 8 }}>
        {/* Column headers */}
        {exerciseSets.length > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, marginBottom: 4 }}>
            <Text style={{ width: 24, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>#</Text>
            {showWeight && <Text style={{ width: 64, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>{weightUnit}</Text>}
            {showReps && <Text style={{ width: 56, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>reps</Text>}
            {showDistance && <Text style={{ width: 64, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>km</Text>}
            {showTime && <Text style={{ width: 56, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>sec</Text>}
            <View style={{ flex: 1 }} />
          </View>
        )}

        {/* Sets */}
        {exerciseSets.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }}>
            <Ionicons name="barbell-outline" size={32} color="#94a3b8" />
            <Text style={{ fontSize: 13, color: "#94a3b8" }}>Sin series aún. Toca abajo para añadir tu primera serie.</Text>
          </View>
        ) : (
          exerciseSets.map((s, idx) => (
            <View
              key={s.id}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: s.is_complete ? "#6366f120" : "#f1f5f9", borderRadius: 12, backgroundColor: s.is_complete ? "#6366f108" : "#fff", paddingHorizontal: 10, paddingVertical: 8 }}
            >
              {/* Set number */}
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748b" }}>{idx + 1}</Text>
              </View>

              {/* Weight */}
              {showWeight && (
                <TextInput
                  style={{ width: 64, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, fontSize: 14, fontWeight: "500", textAlign: "center" }}
                  keyboardType="decimal-pad"
                  value={s.weight !== undefined ? String(s.weight) : ""}
                  onChangeText={(v) => handleUpdateField(s.id, "weight", v)}
                  placeholder="—"
                  placeholderTextColor="#cbd5e1"
                />
              )}

              {/* Reps */}
              {showReps && (
                <TextInput
                  style={{ width: 56, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, fontSize: 14, fontWeight: "500", textAlign: "center" }}
                  keyboardType="number-pad"
                  value={s.reps !== undefined ? String(s.reps) : ""}
                  onChangeText={(v) => handleUpdateField(s.id, "reps", v)}
                  placeholder="—"
                  placeholderTextColor="#cbd5e1"
                />
              )}

              {/* Distance */}
              {showDistance && (
                <TextInput
                  style={{ width: 64, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, fontSize: 14, fontWeight: "500", textAlign: "center" }}
                  keyboardType="decimal-pad"
                  value={s.distance !== undefined ? String(s.distance) : ""}
                  onChangeText={(v) => handleUpdateField(s.id, "distance", v)}
                  placeholder="—"
                  placeholderTextColor="#cbd5e1"
                />
              )}

              {/* Time */}
              {showTime && (
                <TextInput
                  style={{ width: 56, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, fontSize: 14, fontWeight: "500", textAlign: "center" }}
                  keyboardType="number-pad"
                  value={s.time_seconds !== undefined ? String(s.time_seconds) : ""}
                  onChangeText={(v) => handleUpdateField(s.id, "time_seconds", v)}
                  placeholder="—"
                  placeholderTextColor="#cbd5e1"
                />
              )}

              <View style={{ flex: 1 }} />

              {/* Delete */}
              <TouchableOpacity onPress={() => handleDeleteSet(s.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={14} color="#ef4444" />
              </TouchableOpacity>

              {/* Complete */}
              <TouchableOpacity
                onPress={() => handleToggleComplete(s.id, s.is_complete)}
                style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: s.is_complete ? "#6366f1" : "#cbd5e1", backgroundColor: s.is_complete ? "#6366f1" : "transparent", alignItems: "center", justifyContent: "center" }}
              >
                {s.is_complete && <Ionicons name="checkmark" size={14} color="white" />}
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Add set */}
        <TouchableOpacity
          onPress={handleAddSet}
          disabled={saving}
          style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
        >
          {saving ? <ActivityIndicator size="small" color="#6366f1" /> : <Ionicons name="add-circle-outline" size={18} color="#6366f1" />}
          <Text style={{ fontSize: 14, fontWeight: "500", color: "#6366f1" }}>{saving ? "Añadiendo…" : "Añadir serie"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

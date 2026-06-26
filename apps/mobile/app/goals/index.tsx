import { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView, ScrollView, Text, View, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useExerciseStore, useProgressStore, calculate1RM, ExerciseType } from "@fitnotes/core";
import { createGoalsRepository, createExerciseRepository, createProgressRepository, type ExerciseGoalRow } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import type { Exercise } from "@fitnotes/core";
import DateInput from "../../components/DateInput";

export default function GoalsScreen() {
  const navigation = useNavigation();
  const router = useRouter();

  const exercises = useExerciseStore((s) => s.exercises);
  const categories = useExerciseStore((s) => s.categories);
  const loadExercises = useExerciseStore((s) => s.loadExercises);
  const personalRecords = useProgressStore((s) => s.personalRecords);
  const loadPersonalRecords = useProgressStore((s) => s.loadPersonalRecords);

  const [goals, setGoals] = useState<ExerciseGoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [bestSets, setBestSets] = useState<Record<string, { maxReps: number; maxDistance: number; maxTime: number }>>({});

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editGoal, setEditGoal] = useState<ExerciseGoalRow | null>(null);
  const [selectedExId, setSelectedExId] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [targetReps, setTargetReps] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [goalNotes, setGoalNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [exSearch, setExSearch] = useState("");

  const goalsRepo = useMemo(() => createGoalsRepository(supabase), []);
  const exRepo = useMemo(() => createExerciseRepository(supabase), []);
  const progressRepo = useMemo(() => createProgressRepository(supabase), []);

  useEffect(() => {
    navigation.setOptions({ headerTitle: "Objetivos" });
  }, [navigation]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) setUserId(session.user.id);

      const hasCache = exercises.length > 0 && categories.length > 0;
      const [prRes, goalsData, catRes, exRes] = await Promise.all([
        progressRepo.getAllPersonalRecords(),
        goalsRepo.getGoals(),
        hasCache ? Promise.resolve({ data: null }) : exRepo.getCategories(),
        hasCache ? Promise.resolve({ data: null }) : exRepo.getExercises(),
      ]);

      if (!hasCache && catRes.data && exRes.data) {
        loadExercises(catRes.data, exRes.data.map((ex) => ({
          id: ex.id, name: ex.name, category_id: ex.category_id ?? "",
          type: ex.type as ExerciseType, weight_unit: ex.weight_unit as "kg" | "lb",
          notes: ex.notes ?? undefined, is_favorite: ex.is_favorite, created_at: ex.created_at,
        })));
      }
      const prsByExercise: Record<string, { weight: number; reps: number }[]> = {};
      if (prRes.data) {
        loadPersonalRecords(prRes.data.map((r) => ({
          id: r.id, exercise_id: r.exercise_id, reps: r.reps, weight: r.weight, achieved_at: r.achieved_at,
        })));
        for (const r of prRes.data) {
          if (!prsByExercise[r.exercise_id]) prsByExercise[r.exercise_id] = [];
          prsByExercise[r.exercise_id]!.push({ weight: r.weight, reps: r.reps });
        }
      }
      setGoals(goalsData);

      // For exercises with goals but no PR (e.g. REPS_ONLY), fetch best sets directly
      if (prRes.data) {
        const exIdsWithPr = new Set(prRes.data.map((r) => r.exercise_id));
        const exIdsWithoutPr = goalsData
          .map((g) => g.exercise_id)
          .filter((id) => !exIdsWithPr.has(id));
        if (exIdsWithoutPr.length > 0) {
          const bs = await progressRepo.getBestSetsByExercise(exIdsWithoutPr);
          setBestSets(bs);
          // Merge into prsByExercise for autoCheckAchievements
          for (const [exId, s] of Object.entries(bs)) {
            if (s.maxReps > 0) {
              if (!prsByExercise[exId]) prsByExercise[exId] = [];
              prsByExercise[exId]!.push({ weight: 0, reps: s.maxReps });
            }
          }
        }
      }

      setLoading(false);
      if (goalsData.length > 0) void autoCheckAchievements(goalsData, prsByExercise);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));

  function openCreate() {
    setEditGoal(null);
    setSelectedExId("");
    setTargetWeight("");
    setTargetReps("");
    setTargetDate("");
    setGoalNotes("");
    setExSearch("");
    setShowModal(true);
  }

  function openEdit(goal: ExerciseGoalRow) {
    setEditGoal(goal);
    setSelectedExId(goal.exercise_id);
    setTargetWeight(goal.target_weight != null ? String(goal.target_weight) : "");
    setTargetReps(goal.target_reps != null ? String(goal.target_reps) : "");
    setTargetDate(goal.target_date ?? "");
    setGoalNotes(goal.notes ?? "");
    setExSearch("");
    setShowModal(true);
  }

  async function handleSave() {
    if (!selectedExId) { Alert.alert("Error", "Selecciona un ejercicio"); return; }
    const tw = targetWeight ? parseFloat(targetWeight) : undefined;
    const tr = targetReps ? parseInt(targetReps, 10) : undefined;
    if (!tw && !tr) { Alert.alert("Error", "Define al menos un objetivo (peso o reps)"); return; }
    setSaving(true);
    const saved = await goalsRepo.upsertGoal({
      exercise_id: selectedExId,
      target_weight: tw, target_reps: tr,
      target_date: targetDate || undefined,
      notes: goalNotes || undefined,
      achieved_at: editGoal?.achieved_at,
    }, userId);
    if (saved) {
      setGoals((prev) => {
        const existing = prev.findIndex((g) => g.exercise_id === selectedExId);
        if (existing >= 0) return prev.map((g) => g.exercise_id === selectedExId ? saved : g);
        return [saved, ...prev];
      });
    }
    setSaving(false);
    setShowModal(false);
  }

  async function handleDelete(goal: ExerciseGoalRow, exName: string) {
    Alert.alert("Eliminar objetivo", `¿Eliminar el objetivo de "${exName}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        await goalsRepo.deleteGoal(goal.exercise_id);
        setGoals((prev) => prev.filter((g) => g.exercise_id !== goal.exercise_id));
      }},
    ]);
  }

  async function handleMarkAchieved(goal: ExerciseGoalRow) {
    await goalsRepo.markAchieved(goal.exercise_id);
    setGoals((prev) => prev.map((g) => g.exercise_id === goal.exercise_id ? { ...g, achieved_at: new Date().toISOString() } : g));
  }

  function getCurrentBest(exId: string): { weight: number; reps: number; orm: number } | null {
    const prs = personalRecords[exId];
    if (prs && prs.length > 0) {
      const best = prs.reduce((top, r) => calculate1RM(r.weight, r.reps) > calculate1RM(top.weight, top.reps) ? r : top, prs[0]!);
      return { weight: best.weight, reps: best.reps, orm: calculate1RM(best.weight, best.reps) };
    }
    // Fallback for reps-only / no-weight exercises that lack PR entries
    const bs = bestSets[exId];
    if (bs && (bs.maxReps > 0 || bs.maxDistance > 0 || bs.maxTime > 0)) {
      return { weight: 0, reps: bs.maxReps, orm: 0 };
    }
    return null;
  }

  async function autoCheckAchievements(
    currentGoals: ExerciseGoalRow[],
    prsByExercise: Record<string, { weight: number; reps: number }[]>
  ) {
    const toAchieve: string[] = [];
    for (const goal of currentGoals) {
      if (goal.achieved_at || (!goal.target_weight && !goal.target_reps)) continue;
      const prs = prsByExercise[goal.exercise_id];
      if (!prs || prs.length === 0) continue;
      const bestWeight = Math.max(...prs.map((r) => r.weight));
      const bestReps = Math.max(...prs.map((r) => r.reps));
      const weightMet = goal.target_weight ? bestWeight >= goal.target_weight : true;
      const repsMet = goal.target_reps ? bestReps >= goal.target_reps : true;
      if (weightMet && repsMet) toAchieve.push(goal.exercise_id);
    }
    if (toAchieve.length === 0) return;
    await Promise.all(toAchieve.map((exId) => goalsRepo.markAchieved(exId)));
    const achievedAt = new Date().toISOString();
    setGoals((prev) =>
      prev.map((g) => toAchieve.includes(g.exercise_id) ? { ...g, achieved_at: achievedAt } : g)
    );
  }

  const filteredExercises = exSearch
    ? exercises.filter((e) => e.name.toLowerCase().includes(exSearch.toLowerCase()))
    : exercises;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#0f172a" }}>Objetivos</Text>
        <TouchableOpacity
          onPress={openCreate}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {goals.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, padding: 40, alignItems: "center", gap: 12 }}>
              <Ionicons name="flag-outline" size={36} color="#94a3b8" />
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>Sin objetivos</Text>
              <Text style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>Toca + para añadir un objetivo de peso o reps para un ejercicio.</Text>
              <TouchableOpacity onPress={openCreate} style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Añadir objetivo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            goals.map((goal) => {
              const ex = exerciseMap[goal.exercise_id] as Exercise | undefined;
              const best = getCurrentBest(goal.exercise_id);
              const isAchieved = !!goal.achieved_at;

              // Progress toward weight goal
              let weightProgress: number | null = null;
              if (goal.target_weight && best) {
                weightProgress = Math.min(best.weight / goal.target_weight, 1);
              }
              // Progress toward reps goal
              let repsProgress: number | null = null;
              if (goal.target_reps && best) {
                repsProgress = Math.min(best.reps / goal.target_reps, 1);
              }

              const mainProgress = weightProgress ?? repsProgress ?? 0;
              const progressPct = Math.round(mainProgress * 100);

              return (
                <View
                  key={goal.id}
                  style={{ borderWidth: 1, borderColor: isAchieved ? "#22c55e30" : "#f1f5f9", borderRadius: 16, backgroundColor: isAchieved ? "#f0fdf4" : "#fff", overflow: "hidden" }}
                >
                  <View style={{ padding: 14, gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {isAchieved && <Ionicons name="checkmark-circle" size={16} color="#22c55e" />}
                          <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{ex?.name ?? goal.exercise_id}</Text>
                        </View>
                        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                          {goal.target_weight != null && (
                            <Text style={{ fontSize: 12, color: "#64748b" }}>
                              Peso: {best && best.weight > 0 ? `${best.weight}` : "—"} / <Text style={{ fontWeight: "700", color: "#6366f1" }}>{goal.target_weight} kg</Text>
                            </Text>
                          )}
                          {goal.target_reps != null && (
                            <Text style={{ fontSize: 12, color: "#64748b" }}>
                              Reps: {best && best.reps > 0 ? `${best.reps}` : "—"} / <Text style={{ fontWeight: "700", color: "#6366f1" }}>{goal.target_reps}</Text>
                            </Text>
                          )}
                        </View>
                        {goal.target_date && (
                          <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Fecha límite: {goal.target_date}</Text>
                        )}
                        {goal.notes ? (
                          <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }} numberOfLines={1}>{goal.notes}</Text>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                        {!isAchieved && (
                          <TouchableOpacity onPress={() => handleMarkAchieved(goal)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="checkmark-circle-outline" size={20} color="#22c55e" />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => openEdit(goal)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="pencil-outline" size={16} color="#94a3b8" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(goal, ex?.name ?? goal.exercise_id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Progress bar */}
                    {!isAchieved && (
                      <View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ fontSize: 11, color: "#94a3b8" }}>Progreso</Text>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: progressPct >= 100 ? "#22c55e" : "#6366f1" }}>{progressPct}%</Text>
                        </View>
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: "#f1f5f9" }}>
                          <View style={{ height: 6, borderRadius: 3, width: `${progressPct}%`, backgroundColor: progressPct >= 100 ? "#22c55e" : "#6366f1" }} />
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add/Edit Goal Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: "#0f172a" }}>
                {editGoal ? "Editar objetivo" : "Nuevo objetivo"}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
              {/* Exercise picker */}
              {!editGoal && (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Ejercicio</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 12, gap: 8 }}>
                    <Ionicons name="search" size={14} color="#94a3b8" />
                    <TextInput
                      style={{ flex: 1, paddingVertical: 10, fontSize: 14 }}
                      placeholder="Buscar ejercicio…"
                      value={exSearch}
                      onChangeText={setExSearch}
                    />
                  </View>
                  <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                    {filteredExercises.map((ex) => (
                      <TouchableOpacity
                        key={ex.id}
                        onPress={() => setSelectedExId(ex.id)}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: "#f8fafc", gap: 10 }}
                      >
                        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selectedExId === ex.id ? "#6366f1" : "#cbd5e1", backgroundColor: selectedExId === ex.id ? "#6366f1" : "transparent", alignItems: "center", justifyContent: "center" }}>
                          {selectedExId === ex.id && <Ionicons name="checkmark" size={11} color="#fff" />}
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, color: "#0f172a" }}>{ex.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              {editGoal && (
                <View style={{ backgroundColor: "#f8fafc", borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{exerciseMap[editGoal.exercise_id]?.name ?? editGoal.exercise_id}</Text>
                </View>
              )}

              {/* Weight target */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Peso objetivo (kg)</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 }}
                  keyboardType="decimal-pad"
                  placeholder="ej. 100"
                  placeholderTextColor="#cbd5e1"
                  value={targetWeight}
                  onChangeText={setTargetWeight}
                />
              </View>

              {/* Reps target */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Reps objetivo</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 }}
                  keyboardType="number-pad"
                  placeholder="ej. 10"
                  placeholderTextColor="#cbd5e1"
                  value={targetReps}
                  onChangeText={setTargetReps}
                />
              </View>

              {/* Date */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Fecha límite (opcional)</Text>
                <DateInput value={targetDate} onChange={setTargetDate} placeholder="Sin fecha límite" clearable />
              </View>

              {/* Notes */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Notas</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 72, textAlignVertical: "top" }}
                  placeholder="Motivación, estrategia…"
                  placeholderTextColor="#cbd5e1"
                  value={goalNotes}
                  onChangeText={setGoalNotes}
                  multiline
                />
              </View>

              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: saving ? 0.6 : 1 }}
              >
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{saving ? "Guardando…" : "Guardar objetivo"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

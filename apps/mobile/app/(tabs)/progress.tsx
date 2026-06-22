import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProgressStore, useExerciseStore, calculate1RM, ExerciseType } from "@fitnotes/core";
import { createProgressRepository, createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

export default function ProgressScreen() {
  const personalRecords = useProgressStore((s) => s.personalRecords);
  const isLoading = useProgressStore((s) => s.isLoading);
  const loadPersonalRecords = useProgressStore((s) => s.loadPersonalRecords);
  const setLoading = useProgressStore((s) => s.setLoading);

  const exercises = useExerciseStore((s) => s.exercises);
  const loadExercises = useExerciseStore((s) => s.loadExercises);

  const [expanded, setExpanded] = useState<string | null>(null);

  const progressRepo = createProgressRepository(supabase);
  const exRepo = createExerciseRepository(supabase);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [catRes, exRes, prRes] = await Promise.all([
        exRepo.getCategories(),
        exRepo.getExercises(),
        progressRepo.getAllPersonalRecords(),
      ]);
      if (catRes.data && exRes.data) {
        loadExercises(catRes.data, exRes.data.map((ex) => ({
          id: ex.id, name: ex.name, category_id: ex.category_id ?? "",
          type: ex.type as ExerciseType, weight_unit: ex.weight_unit as "kg" | "lb",
          notes: ex.notes ?? undefined, is_favorite: ex.is_favorite, created_at: ex.created_at,
        })));
      }
      if (prRes.data) {
        loadPersonalRecords(prRes.data.map((r) => ({
          id: r.id, exercise_id: r.exercise_id, reps: r.reps, weight: r.weight, achieved_at: r.achieved_at,
        })));
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));

  const exercisesWithPRs = Object.entries(personalRecords)
    .map(([exId, prs]) => {
      const ex = exerciseMap[exId];
      const sorted = [...prs].sort((a, b) => a.reps - b.reps);
      const best = sorted.reduce((top, r) =>
        calculate1RM(r.weight, r.reps) > calculate1RM(top.weight, top.reps) ? r : top, sorted[0]!);
      return { exId, ex, prs: sorted, best };
    })
    .filter((item) => item.ex);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 80, gap: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#0f172a", marginBottom: 4 }}>Progreso</Text>

          {exercisesWithPRs.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, padding: 40, alignItems: "center", gap: 10 }}>
              <Ionicons name="trophy-outline" size={36} color="#94a3b8" />
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>Sin récords aún</Text>
              <Text style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
                Completa series para registrar automáticamente tus marcas personales.
              </Text>
            </View>
          ) : (
            exercisesWithPRs.map(({ exId, ex, prs, best }) => (
              <View key={exId} style={{ borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, backgroundColor: "#fff", overflow: "hidden" }}>
                {/* Exercise header */}
                <TouchableOpacity
                  onPress={() => setExpanded((prev) => prev === exId ? null : exId)}
                  style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 10 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{ex?.name}</Text>
                    <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                      Mejor: {best.weight} kg × {best.reps} reps · 1RM ≈ {calculate1RM(best.weight, best.reps).toFixed(1)} kg
                    </Text>
                  </View>
                  <Ionicons
                    name={expanded === exId ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#94a3b8"
                  />
                </TouchableOpacity>

                {/* Expanded PR list */}
                {expanded === exId && (
                  <View style={{ borderTopWidth: 1, borderColor: "#f1f5f9", padding: 10, gap: 6 }}>
                    <View style={{ flexDirection: "row", paddingHorizontal: 4, marginBottom: 2 }}>
                      <Text style={{ flex: 1, fontSize: 10, color: "#94a3b8", fontWeight: "600" }}>RM</Text>
                      <Text style={{ width: 80, fontSize: 10, color: "#94a3b8", fontWeight: "600", textAlign: "right" }}>Peso</Text>
                      <Text style={{ width: 80, fontSize: 10, color: "#94a3b8", fontWeight: "600", textAlign: "right" }}>1RM Est.</Text>
                    </View>
                    {prs.map((pr) => (
                      <View key={pr.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingVertical: 4 }}>
                        <Text style={{ flex: 1, fontSize: 13, color: "#0f172a" }}>{pr.reps} rep máx</Text>
                        <Text style={{ width: 80, fontSize: 13, fontWeight: "600", color: "#0f172a", textAlign: "right" }}>
                          {pr.weight} kg
                        </Text>
                        <Text style={{ width: 80, fontSize: 12, color: "#6366f1", textAlign: "right" }}>
                          {calculate1RM(pr.weight, pr.reps).toFixed(1)} kg
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

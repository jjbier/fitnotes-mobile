import { useEffect, useMemo, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProgressStore, useExerciseStore, calculate1RM, ExerciseType, getWeekRange, todayISO } from "@fitnotes/core";
import { createProgressRepository, createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import { useRouter } from "expo-router";

export default function ProgressScreen() {
  const router = useRouter();
  const personalRecords = useProgressStore((s) => s.personalRecords);
  const isLoading = useProgressStore((s) => s.isLoading);
  const loadPersonalRecords = useProgressStore((s) => s.loadPersonalRecords);
  const setLoading = useProgressStore((s) => s.setLoading);

  const exercises = useExerciseStore((s) => s.exercises);
  const categories = useExerciseStore((s) => s.categories);
  const loadExercises = useExerciseStore((s) => s.loadExercises);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [weeklyByCategory, setWeeklyByCategory] = useState<{ catId: string; name: string; color: string; sets: number; volume: number }[]>([]);

  const progressRepo = useMemo(() => createProgressRepository(supabase), []);
  const exRepo = useMemo(() => createExerciseRepository(supabase), []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const weekStart = getWeekRange(todayISO()).start;
      const hasCache = exercises.length > 0 && categories.length > 0;
      const [prRes, weeklyRes, catRes, exRes] = await Promise.all([
        progressRepo.getAllPersonalRecords(),
        progressRepo.getWeeklyTraining(weekStart),
        hasCache ? Promise.resolve({ data: null }) : exRepo.getCategories(),
        hasCache ? Promise.resolve({ data: null }) : exRepo.getExercises(),
      ]);

      let catMap: Record<string, { name: string; color: string }> = {};
      let exCatMap: Record<string, string> = {};

      if (hasCache) {
        catMap = Object.fromEntries(categories.map((c) => [c.id, { name: c.name, color: c.color }]));
        exCatMap = Object.fromEntries(exercises.map((e) => [e.id, e.category_id ?? ""]));
      } else if (catRes.data && exRes.data) {
        catMap = Object.fromEntries(catRes.data.map((c) => [c.id, { name: c.name, color: c.color }]));
        exCatMap = Object.fromEntries(exRes.data.map((e) => [e.id, e.category_id ?? ""]));
        loadExercises(catRes.data, exRes.data.map((ex) => ({
          id: ex.id, name: ex.name, category_id: ex.category_id ?? "",
          type: ex.type as ExerciseType, weight_unit: ex.weight_unit as "kg" | "lb",
          notes: ex.notes ?? undefined, is_favorite: ex.is_favorite, created_at: ex.created_at,
        })));
      }

      if (Object.keys(catMap).length > 0) {
        // Group weekly training by category
        const byCat: Record<string, { name: string; color: string; sets: number; volume: number }> = {};
        for (const item of weeklyRes) {
          const catId = exCatMap[item.exerciseId] ?? "";
          const cat = catMap[catId];
          if (!cat) continue;
          if (!byCat[catId]) byCat[catId] = { name: cat.name, color: cat.color, sets: 0, volume: 0 };
          byCat[catId]!.sets += item.setCount;
          byCat[catId]!.volume += item.volume;
        }
        setWeeklyByCategory(
          Object.entries(byCat)
            .map(([catId, vals]) => ({ catId, ...vals }))
            .sort((a, b) => b.sets - a.sets)
        );
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
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: 22, fontWeight: "700", color: "#0f172a" }}>Progreso</Text>
            <TouchableOpacity
              onPress={() => router.push("/goals" as never)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Ionicons name="flag-outline" size={15} color="#6366f1" />
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#6366f1" }}>Objetivos</Text>
            </TouchableOpacity>
          </View>

          {/* Weekly muscle group summary */}
          {weeklyByCategory.length > 0 && (
            <View style={{ borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, padding: 14, gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#0f172a", marginBottom: 2 }}>Esta semana</Text>
              {weeklyByCategory.map((cat) => {
                const maxSets = weeklyByCategory[0]?.sets ?? 1;
                const barWidth = Math.max(cat.sets / maxSets, 0.05);
                return (
                  <View key={cat.catId} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
                        <Text style={{ fontSize: 13, fontWeight: "500", color: "#0f172a" }}>{cat.name}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: "#64748b" }}>{cat.sets} {cat.sets === 1 ? "serie" : "series"}</Text>
                    </View>
                    <View style={{ height: 4, backgroundColor: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                      <View style={{ height: 4, width: `${barWidth * 100}%`, backgroundColor: cat.color, borderRadius: 2 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

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
                    {prs.map((pr) => {
                      const dateStr = pr.achieved_at ? new Date(pr.achieved_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" }) : null;
                      return (
                      <View key={pr.id} style={{ paddingHorizontal: 4, paddingVertical: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ flex: 1, fontSize: 13, color: "#0f172a" }}>{pr.reps} rep máx</Text>
                          <Text style={{ width: 80, fontSize: 13, fontWeight: "600", color: "#0f172a", textAlign: "right" }}>
                            {pr.weight} kg
                          </Text>
                          <Text style={{ width: 80, fontSize: 12, color: "#6366f1", textAlign: "right" }}>
                            {calculate1RM(pr.weight, pr.reps).toFixed(1)} kg
                          </Text>
                        </View>
                        {dateStr ? (
                          <Text style={{ fontSize: 10, color: "#cbd5e1", marginTop: 1 }}>{dateStr}</Text>
                        ) : null}
                      </View>
                      );
                    })}
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

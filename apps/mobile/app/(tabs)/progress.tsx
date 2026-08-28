import { useEffect, useState, useCallback } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProgressStore, useExerciseStore, calculate1RM, ExerciseType, getWeekRange, todayISO } from "@fitnotes/core";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { useSyncStatus } from "../../contexts/SyncContext";
import { useRepositories } from "../../contexts/RepositoryContext";

/**
 * Tab Progreso: resumen semanal de series/volumen por categoría muscular y
 * lista de récords personales (PRs) por ejercicio, expandible para ver el
 * detalle de cada marca (peso × reps y 1RM estimado con la fórmula de
 * Brzycki vía `calculate1RM`) ordenado por número de repeticiones. Incluye
 * acceso a la pantalla de Objetivos (`/goals`). Recarga (con caché de
 * ejercicios/categorías) cada vez que la tab gana foco — necesario para
 * reflejar altas/bajas de PRs hechas en otra tab (p.ej. borrar un
 * entrenamiento en Hoy) sin depender de un reinicio de la app — y también al
 * recibir `refetchSignal` tras un sync.
 */
export default function ProgressScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const personalRecords = useProgressStore((s) => s.personalRecords);
  const isLoading = useProgressStore((s) => s.isLoading);
  const loadPersonalRecords = useProgressStore((s) => s.loadPersonalRecords);
  const setLoading = useProgressStore((s) => s.setLoading);

  const exercises = useExerciseStore((s) => s.exercises);
  const categories = useExerciseStore((s) => s.categories);
  const loadExercises = useExerciseStore((s) => s.loadExercises);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [weeklyByCategory, setWeeklyByCategory] = useState<{ catId: string; name: string; color: string; sets: number; volume: number }[]>([]);

  const { exerciseRepo: exRepo, progressRepo } = useRepositories();
  const { refetchSignal } = useSyncStatus();

  /**
   * Carga los PRs y el entrenamiento semanal agregado por categoría. Usa la
   * caché de ejercicios/categorías del store si ya está poblada (evita ir al
   * repo), salvo que `forceReload` sea `true` (usado tras un sync remoto).
   */
  const load = useCallback(async (forceReload = false) => {
    setLoading(true);
    const weekStart = getWeekRange(todayISO()).start;
    const hasCache = !forceReload && exercises.length > 0 && categories.length > 0;
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
        demo_url: ex.demo_url ?? undefined,
      })));
    }

    if (Object.keys(catMap).length > 0) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressRepo, exRepo]);

  useFocusEffect(
    useCallback(() => {
      load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    if (refetchSignal === 0) return;
    load(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchSignal]);

  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));

  /** Para cada ejercicio con PRs, resuelve el ejercicio, ordena sus marcas por reps y calcula cuál tiene el mejor 1RM estimado. */
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 80, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: 22, fontWeight: "700", color: theme.text }}>{t("progress:title")}</Text>
            <TouchableOpacity
              onPress={() => router.push("/goals" as never)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Ionicons name="flag-outline" size={15} color={theme.primary} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.primary }}>{t("progress:tabs.goals")}</Text>
            </TouchableOpacity>
          </View>

          {/* Weekly muscle group summary */}
          {weeklyByCategory.length > 0 && (
            <View style={{ borderWidth: 1, borderColor: theme.borderLight, borderRadius: 16, padding: 14, gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 2 }}>{t("progress:weekSectionTitleMobile")}</Text>
              {weeklyByCategory.map((cat) => {
                const maxSets = weeklyByCategory[0]?.sets ?? 1;
                const barWidth = Math.max(cat.sets / maxSets, 0.05);
                return (
                  <View key={cat.catId} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
                        <Text style={{ fontSize: 13, fontWeight: "500", color: theme.text }}>{cat.name}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t("progress:setsCount", { count: cat.sets })}</Text>
                    </View>
                    <View style={{ height: 4, backgroundColor: theme.surface, borderRadius: 2, overflow: "hidden" }}>
                      <View style={{ height: 4, width: `${barWidth * 100}%`, backgroundColor: cat.color, borderRadius: 2 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {exercisesWithPRs.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: theme.border, borderStyle: "dashed", borderRadius: 16, padding: 40, alignItems: "center", gap: 10 }}>
              <Ionicons name="trophy-outline" size={36} color={theme.textMuted} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{t("progress:noRecordsTitleMobile")}</Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: "center" }}>
                {t("progress:noRecordsSubtitleMobile")}
              </Text>
            </View>
          ) : (
            exercisesWithPRs.map(({ exId, ex, prs, best }) => (
              <View key={exId} style={{ borderWidth: 1, borderColor: theme.borderLight, borderRadius: 16, backgroundColor: theme.surfaceCard, overflow: "hidden" }}>
                {/* Exercise header */}
                <TouchableOpacity
                  onPress={() => setExpanded((prev) => prev === exId ? null : exId)}
                  accessibilityLabel={`${ex?.name ?? t("progress:exerciseLabel")} — ${expanded === exId ? t("progress:collapseRecordsMobile") : t("progress:expandRecordsMobile")}`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: expanded === exId }}
                  style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 10 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{ex?.name}</Text>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                      {t("progress:bestSummaryMobile", { weight: best.weight, reps: best.reps, oneRM: calculate1RM(best.weight, best.reps).toFixed(1) })}
                    </Text>
                  </View>
                  <Ionicons
                    name={expanded === exId ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={theme.textMuted}
                  />
                </TouchableOpacity>

                {/* Expanded PR list */}
                {expanded === exId && (
                  <View style={{ borderTopWidth: 1, borderColor: theme.borderLight, padding: 10, gap: 6 }}>
                    <View style={{ flexDirection: "row", paddingHorizontal: 4, marginBottom: 2 }}>
                      <Text style={{ flex: 1, fontSize: 10, color: theme.textMuted, fontWeight: "600" }}>{t("progress:rmColumnHeaderMobile")}</Text>
                      <Text style={{ width: 80, fontSize: 10, color: theme.textMuted, fontWeight: "600", textAlign: "right" }}>{t("progress:weightFieldLabel")}</Text>
                      <Text style={{ width: 80, fontSize: 10, color: theme.textMuted, fontWeight: "600", textAlign: "right" }}>{t("progress:est1RMColumnHeaderMobile")}</Text>
                    </View>
                    {prs.map((pr) => {
                      const dateStr = pr.achieved_at ? new Date(pr.achieved_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" }) : null;
                      return (
                      <View key={pr.id} style={{ paddingHorizontal: 4, paddingVertical: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ flex: 1, fontSize: 13, color: theme.text }}>{t("progress:repMaxRowLabelMobile", { reps: pr.reps })}</Text>
                          <Text style={{ width: 80, fontSize: 13, fontWeight: "600", color: theme.text, textAlign: "right" }}>
                            {pr.weight} kg
                          </Text>
                          <Text style={{ width: 80, fontSize: 12, color: theme.primary, textAlign: "right" }}>
                            {calculate1RM(pr.weight, pr.reps).toFixed(1)} kg
                          </Text>
                        </View>
                        {dateStr ? (
                          <Text style={{ fontSize: 10, color: theme.textDisabled, marginTop: 1 }}>{dateStr}</Text>
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

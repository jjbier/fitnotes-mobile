import { useEffect, useState, useCallback } from "react";
import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useProgressStore, useExerciseStore, calculate1RM, ExerciseType, getWeekRange, todayISO } from "@fitnotes/core";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { intlLocale } from "../../lib/i18n";
import { useSyncStatus } from "../../contexts/SyncContext";
import { useRepositories } from "../../contexts/RepositoryContext";
import LineChart from "../../components/LineChart";

type Period = "week" | "month" | "year" | "all";

/** Días hacia atrás desde hoy para cada periodo (`"all"` usa una fecha centinela). */
const PERIOD_DAYS: Record<Exclude<Period, "all">, number> = { week: 7, month: 30, year: 365 };

/** Suma/resta `delta` días a una fecha `YYYY-MM-DD` en hora local, devolviendo el mismo formato (evita el desfase de un día de `toISOString`, que usa UTC). */
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fecha de inicio del periodo elegido, relativa a `today`. `"all"` usa una fecha centinela muy anterior a cualquier dato real. */
function periodFrom(period: Period, today: string): string {
  if (period === "all") return "2000-01-01";
  return addDays(today, -PERIOD_DAYS[period]);
}

/** Rango del periodo inmediatamente anterior al elegido (misma duración), para la comparación de tendencia. `null` para `"all"` (no hay periodo anterior significativo). */
function previousPeriodRange(period: Period, today: string): { from: string; to: string } | null {
  if (period === "all") return null;
  const days = PERIOD_DAYS[period];
  return { from: addDays(today, -days * 2), to: addDays(today, -days - 1) };
}

/** Calcula la racha de días consecutivos con entrenamiento contando hacia atrás desde hoy (o desde ayer si hoy aún no tiene entrenamiento), a partir de un conjunto de fechas `YYYY-MM-DD` — misma lógica que la franja semanal del tab Hoy. */
function computeStreak(dateSet: Set<string>, today: string): number {
  let count = 0;
  const d = new Date(today + "T00:00:00");
  if (!dateSet.has(today)) d.setDate(d.getDate() - 1);
  while (true) {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!dateSet.has(dateStr)) break;
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

/** Formatea un volumen para mostrar, abreviando a "Nk" a partir de 1000. */
function formatVolume(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}

/**
 * Tab Progreso: racha de días consecutivos, cifras de cabecera (entrenamientos/
 * series/volumen) y resumen por categoría muscular para un periodo elegible
 * (semana/mes/año/todo), gráfico de tendencia de volumen semanal de las
 * últimas 12 semanas, y lista de récords personales (PRs) por ejercicio
 * —ordenada por el PR más reciente primero, con badge para los batidos en
 * los últimos 7 días—, expandible para ver el detalle de cada marca (peso ×
 * reps y 1RM estimado con la fórmula de Brzycki vía `calculate1RM`) ordenado
 * por número de repeticiones. Incluye acceso a la pantalla de Objetivos
 * (`/goals`). Recarga (con caché de ejercicios/categorías) cada vez que la
 * tab gana foco — necesario para reflejar altas/bajas de PRs hechas en otra
 * tab (p.ej. borrar un entrenamiento en Hoy) sin depender de un reinicio de
 * la app — y también al recibir `refetchSignal` tras un sync, o al cambiar
 * de periodo.
 */
export default function ProgressScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const personalRecords = useProgressStore((s) => s.personalRecords);
  const isLoading = useProgressStore((s) => s.isLoading);
  const loadPersonalRecords = useProgressStore((s) => s.loadPersonalRecords);
  const setLoading = useProgressStore((s) => s.setLoading);

  const exercises = useExerciseStore((s) => s.exercises);
  const categories = useExerciseStore((s) => s.categories);
  const loadExercises = useExerciseStore((s) => s.loadExercises);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [weeklyByCategory, setWeeklyByCategory] = useState<{ catId: string; name: string; color: string; sets: number; volume: number }[]>([]);
  const [dailyTimeline, setDailyTimeline] = useState<{ date: string; setCount: number; volume: number }[]>([]);

  const { exerciseRepo: exRepo, progressRepo } = useRepositories();
  const { refetchSignal } = useSyncStatus();

  /**
   * Carga los PRs, la serie diaria de entrenamiento (racha/cabecera/tendencia,
   * siempre desde el origen para cubrir cualquier periodo) y el resumen por
   * categoría del periodo elegido. Usa la caché de ejercicios/categorías del
   * store si ya está poblada (evita ir al repo), salvo que `forceReload` sea
   * `true` (usado tras un sync remoto).
   */
  const load = useCallback(async (selectedPeriod: Period, forceReload = false) => {
    setLoading(true);
    const today = todayISO();
    const hasCache = !forceReload && exercises.length > 0 && categories.length > 0;
    const [prRes, dailyRes, weeklyRes, catRes, exRes] = await Promise.all([
      progressRepo.getAllPersonalRecords(),
      progressRepo.getDailyTraining("2000-01-01"),
      progressRepo.getWeeklyTraining(periodFrom(selectedPeriod, today)),
      hasCache ? Promise.resolve({ data: null }) : exRepo.getCategories(),
      hasCache ? Promise.resolve({ data: null }) : exRepo.getExercises(),
    ]);

    setDailyTimeline(dailyRes);

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
    } else {
      setWeeklyByCategory([]);
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
      load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period])
  );

  useEffect(() => {
    if (refetchSignal === 0) return;
    load(period, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchSignal]);

  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const today = todayISO();

  const dateSet = new Set(dailyTimeline.map((d) => d.date));
  const streak = computeStreak(dateSet, today);

  const currentFrom = periodFrom(period, today);
  const currentEntries = dailyTimeline.filter((d) => d.date >= currentFrom);
  const periodTotals = {
    workouts: currentEntries.length,
    sets: currentEntries.reduce((acc, d) => acc + d.setCount, 0),
    volume: currentEntries.reduce((acc, d) => acc + d.volume, 0),
  };

  const prevRange = previousPeriodRange(period, today);
  const prevTotals = prevRange
    ? dailyTimeline
        .filter((d) => d.date >= prevRange.from && d.date <= prevRange.to)
        .reduce((acc, d) => ({ sets: acc.sets + d.setCount, volume: acc.volume + d.volume }), { sets: 0, volume: 0 })
    : null;
  const setsChangePercent = prevTotals && prevTotals.sets > 0
    ? Math.round(((periodTotals.sets - prevTotals.sets) / prevTotals.sets) * 100)
    : null;

  /** Volumen total por semana natural (lunes-domingo) de las últimas 12 semanas, para el gráfico de tendencia. */
  const trendData = (() => {
    const curWeekStart = getWeekRange(today).start;
    return Array.from({ length: 12 }, (_, i) => {
      const start = addDays(curWeekStart, -7 * (11 - i));
      const end = addDays(start, 6);
      const volume = dailyTimeline
        .filter((d) => d.date >= start && d.date <= end)
        .reduce((acc, d) => acc + d.volume, 0);
      const label = new Date(start + "T12:00:00").toLocaleDateString(intlLocale(i18n.language), { day: "numeric", month: "short" });
      return { label, value: Math.round(volume) };
    });
  })();
  const hasTrendData = trendData.some((p) => p.value > 0);

  const recentPrCutoff = addDays(today, -7);

  /** Para cada ejercicio con PRs, resuelve el ejercicio, ordena sus marcas por reps, calcula cuál tiene el mejor 1RM estimado y la fecha del PR más reciente (para ordenar y para el badge de "PR esta semana"). */
  const exercisesWithPRs = Object.entries(personalRecords)
    .map(([exId, prs]) => {
      const ex = exerciseMap[exId];
      const sorted = [...prs].sort((a, b) => a.reps - b.reps);
      const best = sorted.reduce((top, r) =>
        calculate1RM(r.weight, r.reps) > calculate1RM(top.weight, top.reps) ? r : top, sorted[0]!);
      const mostRecentAchievedAt = sorted.reduce((max, r) => r.achieved_at > max ? r.achieved_at : max, sorted[0]!.achieved_at);
      const isRecent = mostRecentAchievedAt.slice(0, 10) >= recentPrCutoff;
      return { exId, ex, prs: sorted, best, mostRecentAchievedAt, isRecent };
    })
    .filter((item) => item.ex)
    .sort((a, b) => b.mostRecentAchievedAt.localeCompare(a.mostRecentAchievedAt));

  const PERIOD_OPTIONS: { key: Period; labelKey: string }[] = [
    { key: "week", labelKey: "progress:period.lastWeek" },
    { key: "month", labelKey: "progress:period.lastMonth" },
    { key: "year", labelKey: "progress:period.lastYear" },
    { key: "all", labelKey: "progress:period.all" },
  ];

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
            {streak > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: theme.streakBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 }}>
                <Ionicons name="flame" size={13} color={theme.streakText} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: theme.streakText }}>
                  {t("progress:streakDaysCount", { count: streak })}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => router.push("/goals" as never)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Ionicons name="flag-outline" size={15} color={theme.primary} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.primary }}>{t("progress:tabs.goals")}</Text>
            </TouchableOpacity>
          </View>

          {/* Period selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {PERIOD_OPTIONS.map(({ key, labelKey }) => (
              <TouchableOpacity
                key={key}
                onPress={() => setPeriod(key)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, borderWidth: 1.5, borderColor: period === key ? theme.primary : theme.border, backgroundColor: period === key ? theme.primary : "transparent" }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: period === key ? "#fff" : theme.textSecondary }}>{t(labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Headline stat tiles */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: theme.borderLight, borderRadius: 14, padding: 10, alignItems: "center", gap: 2 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>{periodTotals.workouts}</Text>
              <Text numberOfLines={1} style={{ fontSize: 9, color: theme.textMuted, fontWeight: "600", textTransform: "uppercase" }}>{t("progress:workoutsLabel")}</Text>
            </View>
            <View style={{ flex: 1, borderWidth: 1, borderColor: theme.borderLight, borderRadius: 14, padding: 10, alignItems: "center", gap: 2 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>{periodTotals.sets}</Text>
              <Text numberOfLines={1} style={{ fontSize: 9, color: theme.textMuted, fontWeight: "600", textTransform: "uppercase" }}>{t("workout:summaryModal.setsLabel")}</Text>
              {setsChangePercent !== null && (
                <Text style={{ fontSize: 10, fontWeight: "600", color: setsChangePercent >= 0 ? theme.success : theme.danger }}>
                  {t("progress:vsPreviousPeriodMobile", { percent: `${setsChangePercent >= 0 ? "+" : ""}${setsChangePercent}%` })}
                </Text>
              )}
            </View>
            <View style={{ flex: 1, borderWidth: 1, borderColor: theme.borderLight, borderRadius: 14, padding: 10, alignItems: "center", gap: 2 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>{formatVolume(periodTotals.volume)}</Text>
              <Text numberOfLines={1} style={{ fontSize: 9, color: theme.textMuted, fontWeight: "600", textTransform: "uppercase" }}>{t("workout:summaryModal.volumeLabel")}</Text>
            </View>
          </View>

          {/* Weekly volume trend chart */}
          {hasTrendData && (
            <View style={{ borderWidth: 1, borderColor: theme.borderLight, borderRadius: 16, padding: 14, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text }}>{t("progress:trendChartTitleMobile")}</Text>
              <LineChart
                data={trendData}
                width={width - 16 * 2 - 14 * 2 - 2}
                height={140}
                color={theme.primary}
                gridColor={theme.borderLight}
                axisLabelColor={theme.textMuted}
              />
            </View>
          )}

          {/* By-category summary for the selected period */}
          {weeklyByCategory.length > 0 && (
            <View style={{ borderWidth: 1, borderColor: theme.borderLight, borderRadius: 16, padding: 14, gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 2 }}>{t("progress:byCategorySectionTitleMobile")}</Text>
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
                      <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                        {t("progress:setsCount", { count: cat.sets })} · {formatVolume(cat.volume)} kg
                      </Text>
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
            exercisesWithPRs.map(({ exId, ex, prs, best, isRecent }) => (
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{ex?.name}</Text>
                      {isRecent && (
                        <View style={{ backgroundColor: theme.prBadge, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: theme.prText }}>{t("progress:newPRBadgeLabel")}</Text>
                        </View>
                      )}
                    </View>
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
                      const dateStr = pr.achieved_at ? new Date(pr.achieved_at).toLocaleDateString(intlLocale(i18n.language), { day: "numeric", month: "short", year: "2-digit" }) : null;
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

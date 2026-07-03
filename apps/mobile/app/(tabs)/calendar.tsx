import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, PanResponder, SafeAreaView, ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Modal, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatWorkoutDate, useExerciseStore, usePreferencesStore, ExerciseType } from "@fitnotes/core";
import { createCalendarRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { useSyncStatus } from "../../contexts/SyncContext";
import { useRepositories } from "../../contexts/RepositoryContext";

function pad(n: number): string { return String(n).padStart(2, "0"); }

type DaySummary = { id: string; date: string; comment: string | null; exercises: { id: string; name: string }[] };

export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set());
  const [categoryColors, setCategoryColors] = useState<Record<string, string[]>>({});
  const [categoryIdsPerDate, setCategoryIdsPerDate] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [daySummaryLoading, setDaySummaryLoading] = useState(false);
  const [listView, setListView] = useState(false);
  const [history, setHistory] = useState<{ id: string; date: string; comment: string | null; categories: { id: string; name: string; color: string }[] }[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<Record<string, { exerciseName: string; sets: string[] }[]>>({});
  const [historyDetailLoading, setHistoryDetailLoading] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(new Set());
  const [catMatchMode, setCatMatchMode] = useState<"any" | "all">("any");
  const [filterExId, setFilterExId] = useState<string | null>(null);
  const [filterExName, setFilterExName] = useState<string | null>(null);
  const [filterMinWeight, setFilterMinWeight] = useState("");
  const [filterMinReps, setFilterMinReps] = useState("");
  const [filteredExDates, setFilteredExDates] = useState<Set<string> | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);

  const weekStart = usePreferencesStore((s) => s.preferences.calendar_week_start);
  const showDayPanel = usePreferencesStore((s) => s.preferences.calendar_show_day_panel);
  const showCategoryDots = usePreferencesStore((s) => s.preferences.calendar_show_category_dots);
  const setPreferenceInStore = usePreferencesStore((s) => s.setPreference);

  const storeExercises = useExerciseStore((s) => s.exercises);
  const storeCategories = useExerciseStore((s) => s.categories);
  const loadExercises = useExerciseStore((s) => s.loadExercises);

  // Swipe between months
  const SCREEN_W = Dimensions.get("window").width;
  const translateX = useRef(new Animated.Value(0)).current;
  const yearRef = useRef(year);
  const monthRef = useRef(month);
  useEffect(() => { yearRef.current = year; }, [year]);
  useEffect(() => { monthRef.current = month; }, [month]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 12,
      onPanResponderMove: (_, g) => { translateX.setValue(g.dx); },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 60) {
          Animated.timing(translateX, { toValue: SCREEN_W, duration: 180, useNativeDriver: true }).start(() => {
            const m = monthRef.current; const y = yearRef.current;
            if (m === 1) { setYear(y - 1); setMonth(12); } else setMonth(m - 1);
            translateX.setValue(-SCREEN_W);
            Animated.timing(translateX, { toValue: 0, duration: 180, useNativeDriver: true }).start();
          });
        } else if (g.dx < -60) {
          Animated.timing(translateX, { toValue: -SCREEN_W, duration: 180, useNativeDriver: true }).start(() => {
            const m = monthRef.current; const y = yearRef.current;
            if (m === 12) { setYear(y + 1); setMonth(1); } else setMonth(m + 1);
            translateX.setValue(SCREEN_W);
            Animated.timing(translateX, { toValue: 0, duration: 180, useNativeDriver: true }).start();
          });
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 100, friction: 10 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const { refetchSignal } = useSyncStatus();

  const repo = useMemo(() => createCalendarRepository(supabase), []);
  const { exerciseRepo: exRepo, preferencesRepo, isGuest } = useRepositories();
  const today = now.toISOString().split("T")[0]!;

  const loadMonth = useCallback(async (y: number, m: number) => {
    setIsLoading(true);
    const [workoutsRes, colors, catIds] = await Promise.all([
      repo.getWorkoutsForMonth(y, m),
      repo.getWorkoutCategoryColorsForMonth(y, m),
      repo.getWorkoutCategoryIdsForMonth(y, m),
    ]);
    if (workoutsRes.data) setWorkoutDates(new Set(workoutsRes.data.map((w: { date: string }) => w.date)));
    setCategoryColors(colors);
    setCategoryIdsPerDate(catIds);
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  useEffect(() => {
    async function boot() {
      if (storeExercises.length === 0) {
        const [catRes, exRes] = await Promise.all([exRepo.getCategories(), exRepo.getExercises()]);
        if (catRes.data && exRes.data) {
          loadExercises(catRes.data, exRes.data.map((ex) => ({
            id: ex.id, name: ex.name, category_id: ex.category_id ?? "",
            type: ex.type as ExerciseType,
            weight_unit: ex.weight_unit as "kg" | "lb",
            notes: ex.notes ?? undefined,
            is_favorite: ex.is_favorite,
            created_at: ex.created_at,
          })));
        }
      }
    }
    boot();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMonth(year, month);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => {
    if (refetchSignal === 0) return;
    loadMonth(year, month);
    if (listView) {
      repo.getWorkoutHistoryDetailed(50).then((data) => setHistory(data));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchSignal]);

  useEffect(() => {
    if (listView) {
      repo.getWorkoutHistoryDetailed(50).then((data) => setHistory(data));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listView]);

  function toggleShowDayPanel() {
    const next = !showDayPanel;
    setPreferenceInStore("calendar_show_day_panel", next);
    void preferencesRepo.set("calendar_show_day_panel", next);
    if (!isGuest) void supabase.auth.updateUser({ data: { calendar_show_day_panel: next } });
  }

  function toggleShowCategoryDots() {
    const next = !showCategoryDots;
    setPreferenceInStore("calendar_show_category_dots", next);
    void preferencesRepo.set("calendar_show_category_dots", next);
    if (!isGuest) void supabase.auth.updateUser({ data: { calendar_show_category_dots: next } });
  }

  async function handleSelectDate(dateStr: string) {
    const newSelected = selectedDate === dateStr ? null : dateStr;
    setSelectedDate(newSelected);
    setDaySummary(null);
    if (newSelected && workoutDates.has(newSelected)) {
      setDaySummaryLoading(true);
      const { data } = await repo.getWorkoutSummary(newSelected);
      if (data) {
        type WE = { exercise_id: string; exercises: { name: string } | null };
        const wes = (data.workout_exercises as WE[] | undefined) ?? [];
        setDaySummary({
          id: data.id,
          date: data.date,
          comment: data.comment ?? null,
          exercises: wes.map((we) => ({ id: we.exercise_id, name: we.exercises?.name ?? "Desconocido" })),
        });
      }
      setDaySummaryLoading(false);
    }
  }

  function toggleCategory(id: string) {
    setSelectedCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function applyExerciseFilter() {
    if (!filterExId) { setFilteredExDates(null); return; }
    setFilterLoading(true);
    const minWeight = filterMinWeight ? parseFloat(filterMinWeight) : undefined;
    const minReps = filterMinReps ? parseInt(filterMinReps, 10) : undefined;
    const dates = await repo.getWorkoutDatesForExerciseWithConditions(filterExId, minWeight, minReps);
    setFilteredExDates(new Set(dates));
    setFilterLoading(false);
    setShowFilters(false);
  }

  async function toggleHistoryExpand(workoutId: string) {
    const next = expandedHistoryId === workoutId ? null : workoutId;
    setExpandedHistoryId(next);
    if (next && !historyDetail[workoutId]) {
      setHistoryDetailLoading(workoutId);
      const { data } = await repo.getWorkoutSetDetail(workoutId);
      if (data) {
        type SetRow = { weight: number | null; reps: number | null; distance: number | null; time_seconds: number | null; is_complete: boolean; is_warmup: boolean | null; order_index: number };
        type WeRow = { order_index: number; exercises: { name: string } | null; sets: SetRow[] | null };
        const wes = ((data.workout_exercises as WeRow[] | null) ?? []).slice().sort((a, b) => a.order_index - b.order_index);
        const detail = wes.map((we) => ({
          exerciseName: we.exercises?.name ?? "Desconocido",
          sets: (we.sets ?? [])
            .filter((s) => s.is_complete && !s.is_warmup)
            .slice().sort((a, b) => a.order_index - b.order_index)
            .map((s) => {
              if (s.weight != null && s.reps != null) return `${s.weight} kg × ${s.reps}`;
              if (s.reps != null) return `${s.reps} reps`;
              if (s.distance != null && s.time_seconds != null) return `${s.distance} km · ${s.time_seconds}s`;
              if (s.distance != null) return `${s.distance} km`;
              if (s.time_seconds != null) return `${s.time_seconds}s`;
              return "—";
            }),
        }));
        setHistoryDetail((prev) => ({ ...prev, [workoutId]: detail }));
      }
      setHistoryDetailLoading(null);
    }
  }

  function clearFilters() {
    setSelectedCatIds(new Set());
    setCatMatchMode("any");
    setFilterExId(null);
    setFilterExName(null);
    setFilterMinWeight("");
    setFilterMinReps("");
    setFilteredExDates(null);
  }

  const catFilteredDates = useMemo<Set<string> | null>(() => {
    if (selectedCatIds.size === 0) return null;
    return new Set(
      Object.entries(categoryIdsPerDate)
        .filter(([, ids]) =>
          catMatchMode === "any"
            ? ids.some((id) => selectedCatIds.has(id))
            : [...selectedCatIds].every((id) => ids.includes(id))
        )
        .map(([date]) => date)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCatIds, catMatchMode, categoryIdsPerDate]);

  const activeFilterDates = useMemo<Set<string> | null>(() => {
    if (!catFilteredDates && !filteredExDates) return null;
    if (catFilteredDates && !filteredExDates) return catFilteredDates;
    if (!catFilteredDates && filteredExDates) return filteredExDates;
    return new Set([...catFilteredDates!].filter((d) => filteredExDates!.has(d)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catFilteredDates, filteredExDates]);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const rawFirstDow = new Date(year, month - 1, 1).getDay();
  const firstDow = weekStart === 1 ? (rawFirstDow + 6) % 7 : rawFirstDow;
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });

  const DAYS = weekStart === 1
    ? ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"]
    : ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

  const activeFilterCount = (selectedCatIds.size > 0 ? 1 : 0) + (filteredExDates !== null ? 1 : 0);
  const isFiltered = activeFilterDates !== null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: theme.text }}>Calendario</Text>
        {filterLoading && <ActivityIndicator size="small" color={theme.primary} />}
        <TouchableOpacity
          onPress={() => setShowFilters(true)}
          style={{ borderWidth: 1, borderColor: activeFilterCount > 0 ? theme.primary : theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: activeFilterCount > 0 ? theme.primary : "transparent", flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Ionicons name="filter-outline" size={14} color={activeFilterCount > 0 ? "#fff" : theme.textSecondary} />
          <Text style={{ fontSize: 12, fontWeight: "500", color: activeFilterCount > 0 ? "#fff" : theme.textSecondary }} numberOfLines={1}>
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Text>
        </TouchableOpacity>
        {activeFilterCount > 0 && (
          <TouchableOpacity onPress={clearFilters}>
            <Text style={{ fontSize: 12, color: theme.textMuted }}>Limpiar</Text>
          </TouchableOpacity>
        )}
        {!listView && (
          <>
            <TouchableOpacity
              onPress={toggleShowCategoryDots}
              accessibilityLabel={showCategoryDots ? "Mostrar indicador único" : "Mostrar puntos de categoría"}
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: showCategoryDots ? theme.surface : "transparent" }}
            >
              <Ionicons name={showCategoryDots ? "ellipsis-horizontal" : "ellipse"} size={14} color={theme.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={toggleShowDayPanel}
              accessibilityLabel={showDayPanel ? "Ocultar panel del día" : "Mostrar panel del día"}
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: showDayPanel ? theme.surface : "transparent" }}
            >
              <Ionicons name={showDayPanel ? "chevron-down" : "chevron-up"} size={14} color={theme.textSecondary} />
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity onPress={() => setListView((v) => !v)} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: listView ? theme.primary : "transparent" }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: listView ? "#fff" : theme.text }}>{listView ? "Mes" : "Lista"}</Text>
        </TouchableOpacity>
      </View>

      {listView ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 8 }}>
          {history.length === 0 ? (
            <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", paddingTop: 32 }}>Sin entrenamientos aún.</Text>
          ) : (
            history.map((w) => {
              const isExpanded = expandedHistoryId === w.id;
              return (
                <View key={w.id} style={{ borderWidth: 1, borderColor: theme.borderLight, borderRadius: 14, overflow: "hidden" }}>
                  <TouchableOpacity
                    onPress={() => toggleHistoryExpand(w.id)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }}>{formatWorkoutDate(w.date)}</Text>
                        {w.categories.map((c) => (
                          <View key={c.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color }} />
                        ))}
                      </View>
                      {w.categories.length > 0 && (
                        <Text style={{ fontSize: 11, color: theme.textMuted }} numberOfLines={1}>
                          {w.categories.map((c) => c.name).join(", ")}
                        </Text>
                      )}
                      {w.comment && (
                        <Text style={{ fontSize: 11, color: theme.textMuted }} numberOfLines={1}>{w.comment}</Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => router.push({ pathname: "/(tabs)", params: { date: w.date } })} style={{ padding: 4 }}>
                      <Ionicons name="open-outline" size={16} color={theme.primary} />
                    </TouchableOpacity>
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={theme.textMuted} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={{ borderTopWidth: 1, borderColor: theme.borderLight, paddingHorizontal: 16, paddingVertical: 10, gap: 6, backgroundColor: theme.surface }}>
                      {historyDetailLoading === w.id ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (historyDetail[w.id]?.length ?? 0) === 0 ? (
                        <Text style={{ fontSize: 12, color: theme.textMuted }}>Sin ejercicios registrados.</Text>
                      ) : (
                        historyDetail[w.id]!.map((ex, i) => (
                          <View key={i}>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: theme.text }}>{ex.exerciseName}</Text>
                            {ex.sets.length > 0 && (
                              <Text style={{ fontSize: 11, color: theme.textMuted }}>{ex.sets.join(", ")}</Text>
                            )}
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {/* Swipeable calendar area */}
          <View style={{ overflow: "hidden" }}>
            <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
              {/* Month nav */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
                  <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: theme.text }}>{monthName}</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>
                    {workoutDates.size} entrenamiento{workoutDates.size !== 1 ? "s" : ""}
                  </Text>
                </View>
                <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
                  <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* DOW headers */}
              <View style={{ flexDirection: "row", marginBottom: 4 }}>
                {DAYS.map((d) => (
                  <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600", color: theme.textMuted }}>{d}</Text>
                ))}
              </View>

              {isLoading ? (
                <View style={{ height: 200, justifyContent: "center", alignItems: "center" }}>
                  <ActivityIndicator color={theme.primary} />
                </View>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {Array.from({ length: firstDow }).map((_, i) => (
                    <View key={`e${i}`} style={{ width: `${100/7}%`, aspectRatio: 1 }} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
                    const hasWorkout = workoutDates.has(dateStr);
                    const matchesFilter = !isFiltered || activeFilterDates!.has(dateStr);
                    const dimmed = isFiltered && hasWorkout && !matchesFilter;
                    const isToday = dateStr === today;
                    const isSelected = dateStr === selectedDate;
                    const dots = showCategoryDots
                      ? (categoryColors[dateStr] ?? (hasWorkout ? [theme.primary] : []))
                      : (hasWorkout ? [theme.primary] : []);
                    const visibleDots = dots.slice(0, showCategoryDots ? 4 : 1);
                    return (
                      <TouchableOpacity
                        key={day}
                        onPress={() => handleSelectDate(dateStr)}
                        style={{ width: `${100/7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", opacity: dimmed ? 0.3 : 1 }}
                      >
                        <View style={{
                          width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
                          backgroundColor: isSelected ? theme.primary : "transparent",
                          borderWidth: isToday && !isSelected ? 2 : (isFiltered && matchesFilter && hasWorkout && !isSelected ? 1.5 : 0),
                          borderColor: theme.primary,
                        }}>
                          <Text style={{ fontSize: 14, fontWeight: isToday || hasWorkout ? "600" : "400", color: isSelected ? "#fff" : isToday ? theme.primary : theme.text }}>
                            {day}
                          </Text>
                          {visibleDots.length > 0 && (
                            <View style={{ flexDirection: "row", gap: 2, position: "absolute", bottom: 2 }}>
                              {visibleDots.map((color, ci) => (
                                <View key={ci} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? "#fff" : color }} />
                              ))}
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </Animated.View>
          </View>

          {/* Selected date panel */}
          {showDayPanel && selectedDate && (
            <View style={{ borderWidth: 1, borderColor: theme.borderLight, borderRadius: 16, padding: 14, marginTop: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }}>{formatWorkoutDate(selectedDate)}</Text>
                {workoutDates.has(selectedDate) && (
                  <TouchableOpacity onPress={() => router.push({ pathname: "/(tabs)", params: { date: selectedDate } })}>
                    <Text style={{ fontSize: 12, color: theme.primary, fontWeight: "600" }}>Ver →</Text>
                  </TouchableOpacity>
                )}
              </View>
              {!workoutDates.has(selectedDate) ? (
                <Text style={{ fontSize: 12, color: theme.textMuted }}>Sin entrenamiento este día</Text>
              ) : daySummaryLoading ? (
                <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 8, alignSelf: "flex-start" }} />
              ) : daySummary ? (
                <View style={{ gap: 4, marginTop: 2 }}>
                  {daySummary.comment ? (
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 2 }}>{daySummary.comment}</Text>
                  ) : null}
                  {daySummary.exercises.map((ex, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        const full = storeExercises.find((se) => se.id === ex.id);
                        router.push({
                          pathname: "/exercise-history/[exerciseId]",
                          params: { exerciseId: ex.id, name: ex.name, type: full?.type ?? "WEIGHT_REPS", weightUnit: full?.weight_unit ?? "kg" },
                        } as never);
                      }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 }}
                    >
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.primary }} />
                      <Text style={{ fontSize: 13, color: theme.primary, flex: 1 }}>{ex.name}</Text>
                      <Ionicons name="chevron-forward" size={12} color={theme.textDisabled} />
                    </TouchableOpacity>
                  ))}
                  {daySummary.exercises.length === 0 && (
                    <Text style={{ fontSize: 12, color: theme.textMuted }}>Sin ejercicios registrados</Text>
                  )}
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}

      {/* Filters modal */}
      <Modal visible={showFilters} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFilters(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.borderLight }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: theme.text }}>Filtros</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
            {/* Category filter */}
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Categorías musculares
                </Text>
                <View style={{ flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: theme.border, overflow: "hidden" }}>
                  {(["any", "all"] as const).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setCatMatchMode(mode)}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: catMatchMode === mode ? theme.primary : "transparent" }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600", color: catMatchMode === mode ? "#fff" : theme.textSecondary }}>
                        {mode === "any" ? "Cualquiera" : "Todas"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {storeCategories.length === 0 ? (
                <Text style={{ fontSize: 12, color: theme.textMuted }}>Sin categorías disponibles</Text>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {storeCategories.map((cat) => {
                    const active = selectedCatIds.has(cat.id);
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => toggleCategory(cat.id)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, borderWidth: 1.5, borderColor: active ? cat.color : theme.border, backgroundColor: active ? `${cat.color}22` : "transparent", paddingHorizontal: 12, paddingVertical: 6 }}
                      >
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
                        <Text style={{ fontSize: 12, fontWeight: "500", color: active ? cat.color : theme.textSecondary }}>{cat.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={{ height: 1, backgroundColor: theme.borderLight }} />

            {/* Exercise + conditions filter */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Por ejercicio
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {storeExercises.map((ex) => (
                  <TouchableOpacity
                    key={ex.id}
                    onPress={() => { setFilterExId(ex.id); setFilterExName(ex.name); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1.5, borderColor: filterExId === ex.id ? theme.primary : theme.border, backgroundColor: filterExId === ex.id ? theme.primary : "transparent" }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: filterExId === ex.id ? "#fff" : theme.textSecondary }}>{ex.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {filterExId && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>Peso mín. (kg)</Text>
                    <TextInput
                      value={filterMinWeight}
                      onChangeText={setFilterMinWeight}
                      keyboardType="decimal-pad"
                      placeholder="Ej. 100"
                      placeholderTextColor={theme.textDisabled}
                      style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: theme.text }}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>Reps mín.</Text>
                    <TextInput
                      value={filterMinReps}
                      onChangeText={setFilterMinReps}
                      keyboardType="number-pad"
                      placeholder="Ej. 5"
                      placeholderTextColor={theme.textDisabled}
                      style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: theme.text }}
                    />
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={applyExerciseFilter}
              disabled={filterLoading}
              style={{ backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: filterLoading ? 0.6 : 1 }}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                {filterLoading ? "Aplicando…" : "Aplicar filtro"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

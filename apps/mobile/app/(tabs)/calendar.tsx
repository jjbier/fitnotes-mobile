import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, PanResponder, SafeAreaView, ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatWorkoutDate, useExerciseStore, ExerciseType } from "@fitnotes/core";
import { createCalendarRepository, createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

function pad(n: number): string { return String(n).padStart(2, "0"); }

type DaySummary = { id: string; date: string; comment: string | null; exercises: { name: string }[] };

export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set());
  const [categoryColors, setCategoryColors] = useState<Record<string, string[]>>({});
  const [filteredDates, setFilteredDates] = useState<Set<string> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [daySummaryLoading, setDaySummaryLoading] = useState(false);
  const [listView, setListView] = useState(false);
  const [history, setHistory] = useState<{ id: string; date: string }[]>([]);

  // Exercise filter
  const [showExFilter, setShowExFilter] = useState(false);
  const [filterExId, setFilterExId] = useState<string | null>(null);
  const [filterExName, setFilterExName] = useState<string | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);
  const [weekStart, setWeekStart] = useState<0 | 1>(1);

  const storeExercises = useExerciseStore((s) => s.exercises);
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

  const repo = useMemo(() => createCalendarRepository(supabase), []);
  const exRepo = useMemo(() => createExerciseRepository(supabase), []);
  const today = now.toISOString().split("T")[0]!;

  useEffect(() => {
    async function boot() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setWeekStart((session.user.user_metadata?.calendar_week_start as 0 | 1 | undefined) ?? 1);
      }
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
    async function load() {
      setIsLoading(true);
      const [workoutsRes, colors] = await Promise.all([
        repo.getWorkoutsForMonth(year, month),
        repo.getWorkoutCategoryColorsForMonth(year, month),
      ]);
      if (workoutsRes.data) setWorkoutDates(new Set(workoutsRes.data.map((w: { date: string }) => w.date)));
      setCategoryColors(colors);
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => {
    if (listView) {
      repo.getWorkoutHistory(50).then(({ data }: { data: { id: string; date: string }[] | null }) => { if (data) setHistory(data); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listView]);

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
          exercises: wes.map((we) => ({ name: we.exercises?.name ?? "Desconocido" })),
        });
      }
      setDaySummaryLoading(false);
    }
  }

  async function applyExerciseFilter(exId: string, exName: string) {
    setFilterExId(exId);
    setFilterExName(exName);
    setShowExFilter(false);
    setFilterLoading(true);
    const { data } = await repo.getWorkoutDatesForExercise(exId);
    type Row = { workouts: { date: string } | null };
    if (data) {
      const dates = new Set((data as Row[]).map((r) => r.workouts?.date).filter(Boolean) as string[]);
      setFilteredDates(dates);
    }
    setFilterLoading(false);
  }

  function clearFilter() {
    setFilterExId(null);
    setFilterExName(null);
    setFilteredDates(null);
  }

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

  const activeDates = filteredDates ?? workoutDates;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: theme.text }}>Calendario</Text>
        {filterLoading && <ActivityIndicator size="small" color={theme.primary} />}
        <TouchableOpacity
          onPress={() => filterExId ? clearFilter() : setShowExFilter(true)}
          style={{ borderWidth: 1, borderColor: filterExId ? theme.primary : theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: filterExId ? theme.primaryLight : "transparent", flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Ionicons name={filterExId ? "close-circle" : "filter-outline"} size={14} color={filterExId ? theme.primary : theme.textSecondary} />
          <Text style={{ fontSize: 12, fontWeight: "500", color: filterExId ? theme.primary : theme.textSecondary }} numberOfLines={1}>
            {filterExId ? filterExName : "Filtrar"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setListView((v) => !v)} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: listView ? theme.primary : "transparent" }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: listView ? "#fff" : theme.text }}>{listView ? "Mes" : "Lista"}</Text>
        </TouchableOpacity>
      </View>

      {listView ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 8 }}>
          {history.length === 0 ? (
            <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", paddingTop: 32 }}>Sin entrenamientos aún.</Text>
          ) : (
            history.map((w) => (
              <TouchableOpacity
                key={w.id}
                onPress={() => router.push({ pathname: "/(tabs)", params: { date: w.date } })}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: theme.borderLight, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 13, color: theme.text }}>{formatWorkoutDate(w.date)}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
              </TouchableOpacity>
            ))
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
                <Text style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: "600", color: theme.text }}>{monthName}</Text>
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
                    const isHighlighted = activeDates.has(dateStr);
                    const isToday = dateStr === today;
                    const isSelected = dateStr === selectedDate;
                    const dots = filteredDates
                      ? (isHighlighted ? [theme.warning] : [])
                      : (categoryColors[dateStr] ?? (hasWorkout ? [theme.primary] : []));
                    const visibleDots = dots.slice(0, 4);
                    return (
                      <TouchableOpacity
                        key={day}
                        onPress={() => handleSelectDate(dateStr)}
                        style={{ width: `${100/7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" }}
                      >
                        <View style={{
                          width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
                          backgroundColor: isSelected ? theme.primary : "transparent",
                          borderWidth: isToday && !isSelected ? 2 : 0,
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
          {selectedDate && (
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
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.primary }} />
                      <Text style={{ fontSize: 13, color: theme.text }}>{ex.name}</Text>
                    </View>
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

      {/* Exercise filter modal */}
      <Modal visible={showExFilter} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowExFilter(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.borderLight }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: theme.text }}>Filtrar por ejercicio</Text>
            <TouchableOpacity onPress={() => setShowExFilter(false)}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
            {storeExercises.length === 0 ? (
              <Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 24 }}>Sin ejercicios disponibles</Text>
            ) : (
              storeExercises.map((ex) => (
                <TouchableOpacity
                  key={ex.id}
                  onPress={() => applyExerciseFilter(ex.id, ex.name)}
                  style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.borderLight, borderRadius: 12, gap: 10 }}
                >
                  <Text style={{ flex: 1, fontSize: 14, color: theme.text }}>{ex.name}</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.textDisabled} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

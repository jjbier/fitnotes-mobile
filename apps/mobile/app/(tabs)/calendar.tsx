import { useEffect, useMemo, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatWorkoutDate, useExerciseStore, ExerciseType } from "@fitnotes/core";
import { createCalendarRepository, createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

function pad(n: number): string { return String(n).padStart(2, "0"); }

type DaySummary = { id: string; date: string; comment: string | null; exercises: { name: string }[] };

export default function CalendarScreen() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set());
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
      const { data } = await repo.getWorkoutsForMonth(year, month);
      if (data) setWorkoutDates(new Set(data.map((w: { date: string }) => w.date)));
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#0f172a" }}>Calendario</Text>
        {filterLoading && <ActivityIndicator size="small" color="#6366f1" />}
        <TouchableOpacity
          onPress={() => filterExId ? clearFilter() : setShowExFilter(true)}
          style={{ borderWidth: 1, borderColor: filterExId ? "#6366f1" : "#e2e8f0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: filterExId ? "#6366f115" : "transparent", flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Ionicons name={filterExId ? "close-circle" : "filter-outline"} size={14} color={filterExId ? "#6366f1" : "#64748b"} />
          <Text style={{ fontSize: 12, fontWeight: "500", color: filterExId ? "#6366f1" : "#64748b" }} numberOfLines={1}>
            {filterExId ? filterExName : "Filtrar"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setListView((v) => !v)} style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: listView ? "#6366f1" : "transparent" }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: listView ? "#fff" : "#0f172a" }}>{listView ? "Mes" : "Lista"}</Text>
        </TouchableOpacity>
      </View>

      {listView ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 8 }}>
          {history.length === 0 ? (
            <Text style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", paddingTop: 32 }}>Sin entrenamientos aún.</Text>
          ) : (
            history.map((w) => (
              <TouchableOpacity
                key={w.id}
                onPress={() => router.push({ pathname: "/(tabs)", params: { date: w.date } })}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 13, color: "#0f172a" }}>{formatWorkoutDate(w.date)}</Text>
                <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {/* Month nav */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
              <Ionicons name="chevron-back" size={20} color="#64748b" />
            </TouchableOpacity>
            <Text style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: "600", color: "#0f172a" }}>{monthName}</Text>
            <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
              <Ionicons name="chevron-forward" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* DOW headers */}
          <View style={{ flexDirection: "row", marginBottom: 4 }}>
            {DAYS.map((d) => (
              <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600", color: "#94a3b8" }}>{d}</Text>
            ))}
          </View>

          {isLoading ? (
            <View style={{ height: 200, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator color="#6366f1" />
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
                const dotColor = filteredDates ? "#f97316" : "#6366f1";
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => handleSelectDate(dateStr)}
                    style={{ width: `${100/7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" }}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
                      backgroundColor: isSelected ? "#6366f1" : "transparent",
                      borderWidth: isToday && !isSelected ? 2 : 0,
                      borderColor: "#6366f1",
                    }}>
                      <Text style={{ fontSize: 14, fontWeight: isToday || hasWorkout ? "600" : "400", color: isSelected ? "#fff" : isToday ? "#6366f1" : "#0f172a" }}>
                        {day}
                      </Text>
                      {isHighlighted && (
                        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isSelected ? "#fff" : dotColor, position: "absolute", bottom: 2 }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Selected date panel */}
          {selectedDate && (
            <View style={{ borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, padding: 14, marginTop: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#0f172a" }}>{formatWorkoutDate(selectedDate)}</Text>
                {workoutDates.has(selectedDate) && (
                  <TouchableOpacity onPress={() => router.push({ pathname: "/(tabs)", params: { date: selectedDate } })}>
                    <Text style={{ fontSize: 12, color: "#6366f1", fontWeight: "600" }}>Ver →</Text>
                  </TouchableOpacity>
                )}
              </View>
              {!workoutDates.has(selectedDate) ? (
                <Text style={{ fontSize: 12, color: "#94a3b8" }}>Sin entrenamiento este día</Text>
              ) : daySummaryLoading ? (
                <ActivityIndicator size="small" color="#6366f1" style={{ marginTop: 8, alignSelf: "flex-start" }} />
              ) : daySummary ? (
                <View style={{ gap: 4, marginTop: 2 }}>
                  {daySummary.comment ? (
                    <Text style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>{daySummary.comment}</Text>
                  ) : null}
                  {daySummary.exercises.map((ex, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#6366f1" }} />
                      <Text style={{ fontSize: 13, color: "#334155" }}>{ex.name}</Text>
                    </View>
                  ))}
                  {daySummary.exercises.length === 0 && (
                    <Text style={{ fontSize: 12, color: "#94a3b8" }}>Sin ejercicios registrados</Text>
                  )}
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}

      {/* Exercise filter modal */}
      <Modal visible={showExFilter} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowExFilter(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: "#0f172a" }}>Filtrar por ejercicio</Text>
            <TouchableOpacity onPress={() => setShowExFilter(false)}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
            {storeExercises.length === 0 ? (
              <Text style={{ color: "#94a3b8", textAlign: "center", marginTop: 24 }}>Sin ejercicios disponibles</Text>
            ) : (
              storeExercises.map((ex) => (
                <TouchableOpacity
                  key={ex.id}
                  onPress={() => applyExerciseFilter(ex.id, ex.name)}
                  style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 12, gap: 10 }}
                >
                  <Text style={{ flex: 1, fontSize: 14, color: "#0f172a" }}>{ex.name}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

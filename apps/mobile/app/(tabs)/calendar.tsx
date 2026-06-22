import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatWorkoutDate } from "@fitnotes/core";
import { createCalendarRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

function pad(n: number): string { return String(n).padStart(2, "0"); }

export default function CalendarScreen() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [listView, setListView] = useState(false);
  const [history, setHistory] = useState<{id: string; date: string}[]>([]);

  const repo = createCalendarRepository(supabase);
  const today = now.toISOString().split("T")[0]!;

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
      repo.getWorkoutHistory(50).then(({ data }: { data: {id: string; date: string}[] | null }) => { if (data) setHistory(data); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listView]);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });

  const DAYS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#0f172a" }}>Calendario</Text>
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
              {/* Empty cells */}
              {Array.from({ length: firstDow }).map((_, i) => (
                <View key={`e${i}`} style={{ width: `${100/7}%`, aspectRatio: 1 }} />
              ))}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const dateStr = `${year}-${pad(month)}-${pad(day)}`;
                const hasWorkout = workoutDates.has(dateStr);
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDate;
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => setSelectedDate(isSelected ? null : dateStr)}
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
                      {hasWorkout && (
                        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isSelected ? "#fff" : "#6366f1", position: "absolute", bottom: 2 }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Selected date info */}
          {selectedDate && (
            <View style={{ borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, padding: 14, marginTop: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#0f172a" }}>{formatWorkoutDate(selectedDate)}</Text>
                {workoutDates.has(selectedDate) && (
                  <TouchableOpacity onPress={() => router.push({ pathname: "/(tabs)", params: { date: selectedDate } })}>
                    <Text style={{ fontSize: 12, color: "#6366f1" }}>Open →</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                {workoutDates.has(selectedDate) ? "Entrenamiento registrado" : "Sin entrenamiento este día"}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

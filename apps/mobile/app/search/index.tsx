import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, SafeAreaView, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useExerciseStore, ExerciseType } from "@fitnotes/core";
import { createWorkoutRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

type LastWorkout = { date: string; maxWeight: number; maxReps: number; setCount: number };

const TYPE_LABELS: Partial<Record<ExerciseType, string>> = {
  [ExerciseType.WEIGHT_REPS]: "Peso+Reps",
  [ExerciseType.REPS_ONLY]: "Reps",
  [ExerciseType.WEIGHT_ONLY]: "Peso",
  [ExerciseType.TIME_ONLY]: "Tiempo",
  [ExerciseType.DISTANCE_TIME]: "Distancia+Tiempo",
  [ExerciseType.WEIGHT_DISTANCE]: "Peso+Distancia",
  [ExerciseType.WEIGHT_TIME]: "Peso+Tiempo",
  [ExerciseType.REPS_DISTANCE]: "Reps+Distancia",
  [ExerciseType.REPS_TIME]: "Reps+Tiempo",
  [ExerciseType.DISTANCE_ONLY]: "Distancia",
};

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function daysAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso + "T12:00:00").getTime()) / 86400000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "ayer";
  if (diff < 7) return `hace ${diff} días`;
  if (diff < 30) return `hace ${Math.floor(diff / 7)} sem`;
  if (diff < 365) return `hace ${Math.floor(diff / 30)} mes`;
  return `hace ${Math.floor(diff / 365)} año`;
}

export default function SearchScreen() {
  const router = useRouter();
  const exercises = useExerciseStore((s) => s.exercises);
  const categories = useExerciseStore((s) => s.categories);
  const repo = useMemo(() => createWorkoutRepository(supabase), []);

  const [query, setQuery] = useState("");
  const [lastWorkouts, setLastWorkouts] = useState<Record<string, LastWorkout>>({});
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<TextInput>(null);

  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  useEffect(() => {
    inputRef.current?.focus();
    if (exercises.length === 0) { setLoading(false); return; }
    repo.getLastWorkoutByExercises(exercises.map((e) => e.id)).then((data) => {
      setLastWorkouts(data);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter((e) => e.name.toLowerCase().includes(q));
  }, [exercises, query]);

  // Sort: exercises with recent history first, then alphabetically
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = lastWorkouts[a.id]?.date ?? "";
      const db = lastWorkouts[b.id]?.date ?? "";
      if (da && db) return db.localeCompare(da);
      if (da) return -1;
      if (db) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, lastWorkouts]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", gap: 10 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#f8fafc", borderRadius: 10, paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search" size={16} color="#94a3b8" />
          <TextInput
            ref={inputRef}
            style={{ flex: 1, fontSize: 15, paddingVertical: 9, color: "#0f172a" }}
            placeholder="Buscar ejercicio…"
            placeholderTextColor="#94a3b8"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: "center", gap: 8 }}>
              <Ionicons name="search-outline" size={36} color="#cbd5e1" />
              <Text style={{ fontSize: 14, color: "#94a3b8", textAlign: "center" }}>
                {query ? `Sin resultados para "${query}"` : "Sin ejercicios"}
              </Text>
            </View>
          }
          ListHeaderComponent={
            sorted.length > 0 ? (
              <Text style={{ fontSize: 12, color: "#94a3b8", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                {sorted.length} ejercicio{sorted.length !== 1 ? "s" : ""}
              </Text>
            ) : null
          }
          renderItem={({ item: ex }) => {
            const lw = lastWorkouts[ex.id];
            const cat = catMap[ex.category_id ?? ""];
            return (
              <TouchableOpacity
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onPress={() => router.push(`/exercise-history/${ex.id}` as any)}
                style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f8fafc", gap: 12 }}
              >
                {/* Left: name + meta */}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }} numberOfLines={1}>{ex.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {cat && <Text style={{ fontSize: 11, color: "#64748b" }}>{cat}</Text>}
                    {cat && <Text style={{ fontSize: 11, color: "#e2e8f0" }}>·</Text>}
                    <Text style={{ fontSize: 11, color: "#94a3b8" }}>{TYPE_LABELS[ex.type] ?? ex.type}</Text>
                  </View>
                  {lw ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <Ionicons name="time-outline" size={11} color="#6366f1" />
                      <Text style={{ fontSize: 11, color: "#6366f1" }}>{daysAgo(lw.date)} · {formatDate(lw.date)}</Text>
                      {lw.setCount > 0 && (
                        <>
                          <Text style={{ fontSize: 11, color: "#e2e8f0" }}>·</Text>
                          <Text style={{ fontSize: 11, color: "#64748b" }}>{lw.setCount} serie{lw.setCount !== 1 ? "s" : ""}</Text>
                          {lw.maxWeight > 0 && <Text style={{ fontSize: 11, color: "#64748b" }}>· {lw.maxWeight}kg</Text>}
                          {lw.maxWeight === 0 && lw.maxReps > 0 && <Text style={{ fontSize: 11, color: "#64748b" }}>· {lw.maxReps} reps</Text>}
                        </>
                      )}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>Sin registros</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

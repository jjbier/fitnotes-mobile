import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, SafeAreaView, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useExerciseStore, ExerciseType, formatShortDate, formatDaysAgo } from "@fitnotes/core";
import { useTheme } from "../../lib/theme";
import { useRepositories } from "../../contexts/RepositoryContext";

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

/**
 * Búsqueda global de ejercicios: filtra por nombre sobre la lista ya cargada en
 * `useExerciseStore` (sin llamada a red) y muestra, para cada resultado, la fecha del
 * último entrenamiento en que se usó junto a su mejor peso/reps de esa sesión. Los
 * ejercicios con historial reciente aparecen primero (ordenados por fecha descendente),
 * y el resto alfabéticamente — actuando como acceso rápido a lo entrenado últimamente.
 */
export default function SearchScreen() {
  const colors = useTheme();
  const router = useRouter();
  const exercises = useExerciseStore((s) => s.exercises);
  const categories = useExerciseStore((s) => s.categories);
  const { workoutRepo: repo } = useRepositories();

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

  /** Ordena los resultados filtrados: primero los que tienen entrenamiento reciente (más reciente primero), luego el resto alfabéticamente. */
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: 10 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.inputBg, borderRadius: 10, paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={{ flex: 1, fontSize: 15, paddingVertical: 9, color: colors.text }}
            placeholder="Buscar ejercicio…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: "center", gap: 8 }}>
              <Ionicons name="search-outline" size={36} color={colors.textDisabled} />
              <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center" }}>
                {query ? `Sin resultados para "${query}"` : "Sin ejercicios"}
              </Text>
            </View>
          }
          ListHeaderComponent={
            sorted.length > 0 ? (
              <Text style={{ fontSize: 12, color: colors.textMuted, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
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
                style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.backgroundAlt, gap: 12 }}
              >
                {/* Left: name + meta */}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }} numberOfLines={1}>{ex.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {cat && <Text style={{ fontSize: 11, color: colors.textSecondary }}>{cat}</Text>}
                    {cat && <Text style={{ fontSize: 11, color: colors.border }}>·</Text>}
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>{TYPE_LABELS[ex.type] ?? ex.type}</Text>
                  </View>
                  {lw ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <Ionicons name="time-outline" size={11} color={colors.primary} />
                      <Text style={{ fontSize: 11, color: colors.primary }}>{formatDaysAgo(lw.date)} · {formatShortDate(lw.date)}</Text>
                      {lw.setCount > 0 && (
                        <>
                          <Text style={{ fontSize: 11, color: colors.border }}>·</Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>{lw.setCount} serie{lw.setCount !== 1 ? "s" : ""}</Text>
                          {lw.maxWeight > 0 && <Text style={{ fontSize: 11, color: colors.textSecondary }}>· {lw.maxWeight}kg</Text>}
                          {lw.maxWeight === 0 && lw.maxReps > 0 && <Text style={{ fontSize: 11, color: colors.textSecondary }}>· {lw.maxReps} reps</Text>}
                        </>
                      )}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, color: colors.textDisabled, marginTop: 2 }}>Sin registros</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

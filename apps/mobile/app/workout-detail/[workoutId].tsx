import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatWorkoutDate } from "@fitnotes/core";
import { createCalendarRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

interface DetailSet {
  weight: number | null;
  reps: number | null;
  distance: number | null;
  time_seconds: number | null;
  is_complete: boolean;
  is_warmup: boolean;
  order_index: number;
}

interface DetailExercise {
  order_index: number;
  name: string;
  sets: DetailSet[];
}

function formatSet(s: DetailSet): string {
  if (s.weight != null && s.reps != null) return `${s.weight} kg × ${s.reps}`;
  if (s.reps != null) return `${s.reps} reps`;
  if (s.distance != null && s.time_seconds != null) return `${s.distance} km · ${s.time_seconds}s`;
  if (s.distance != null) return `${s.distance} km`;
  if (s.time_seconds != null) return `${s.time_seconds}s`;
  return "—";
}

export default function WorkoutDetailScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [exercises, setExercises] = useState<DetailExercise[]>([]);

  useEffect(() => {
    if (!workoutId) return;
    const repo = createCalendarRepository(supabase);
    repo.getWorkoutSetDetail(workoutId).then(({ data }) => {
      if (data) {
        setDate(data.date);
        type Row = { order_index: number; exercises: { name: string } | null; sets: DetailSet[] | null };
        setExercises(
          ((data.workout_exercises ?? []) as Row[])
            .slice()
            .sort((a, b) => a.order_index - b.order_index)
            .map((we) => ({
              order_index: we.order_index,
              name: we.exercises?.name ?? "Ejercicio",
              sets: (we.sets ?? []).slice().sort((a, b) => a.order_index - b.order_index),
            }))
        );
      }
      setLoading(false);
    });
  }, [workoutId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Volver" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Entrenamiento completo</Text>
          {date ? <Text style={{ fontSize: 12, color: colors.textMuted }}>{formatWorkoutDate(date)}</Text> : null}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : exercises.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center" }}>No se encontraron datos de este entrenamiento.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {exercises.map((ex) => (
            <View key={ex.order_index} style={{ borderWidth: 1, borderColor: colors.borderLight, borderRadius: 14, padding: 14, gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>{ex.name}</Text>
              {ex.sets.length === 0 ? (
                <Text style={{ fontSize: 12, color: colors.textMuted }}>Sin series</Text>
              ) : (
                <View style={{ gap: 4 }}>
                  {ex.sets.map((s, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 12, color: colors.textMuted, width: 20 }}>{i + 1}.</Text>
                      <Text style={{ fontSize: 13, color: colors.text, flex: 1 }}>{formatSet(s)}</Text>
                      {s.is_warmup && (
                        <View style={{ backgroundColor: colors.warmupBadge, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 10, fontWeight: "600", color: colors.warmupText }}>W</Text>
                        </View>
                      )}
                      {!s.is_complete && (
                        <Ionicons name="ellipse-outline" size={12} color={colors.textMuted} />
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

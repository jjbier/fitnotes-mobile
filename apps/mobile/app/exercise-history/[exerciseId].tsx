import { useEffect, useState } from "react";
import {
  SafeAreaView, Text, View, TouchableOpacity,
  ActivityIndicator, FlatList,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ExerciseType, getExerciseFields } from "@fitnotes/core";
import { createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

type SetRow = {
  id: string;
  weight?: number;
  reps?: number;
  distance?: number;
  time_seconds?: number;
  is_complete: boolean;
  comment?: string;
  order_index: number;
};

type Session = {
  workout_id: string;
  date: string;
  comment?: string;
  sets: SetRow[];
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}min` : `${m}:${String(s).padStart(2, "0")}`;
}

function formatSet(set: SetRow, type: ExerciseType, unit: string): string {
  const f = getExerciseFields(type);
  const parts: string[] = [];
  if (f.weight && set.weight != null) parts.push(`${set.weight} ${unit}`);
  if (f.reps && set.reps != null) parts.push(`${set.reps} reps`);
  if (f.distance && set.distance != null) parts.push(`${set.distance} km`);
  if (f.time && set.time_seconds != null) parts.push(formatDuration(set.time_seconds));
  return parts.join(" × ") || "—";
}

export default function ExerciseHistoryScreen() {
  const router = useRouter();
  const { exerciseId, name, type, weightUnit } = useLocalSearchParams<{
    exerciseId: string; name: string; type: string; weightUnit: string;
  }>();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const exerciseType = (type ?? ExerciseType.WEIGHT_REPS) as ExerciseType;
  const unit = weightUnit ?? "kg";

  useEffect(() => {
    async function load() {
      const repo = createExerciseRepository(supabase);
      const { data, error: err } = await repo.getExerciseHistory(exerciseId);
      if (err) { setError(err.message); setLoading(false); return; }
      setSessions(data ?? []);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }} numberOfLines={1}>{name ?? "Historial"}</Text>
          <Text style={{ fontSize: 12, color: "#94a3b8" }}>
            {loading ? "Cargando…" : `${sessions.length} ${sessions.length === 1 ? "sesión" : "sesiones"}`}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color="#6366f1" />
      ) : error ? (
        <Text style={{ textAlign: "center", marginTop: 48, color: "#ef4444", paddingHorizontal: 24 }}>{error}</Text>
      ) : sessions.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 80, paddingHorizontal: 32 }}>
          <Ionicons name="time-outline" size={48} color="#cbd5e1" />
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#64748b", marginTop: 16 }}>Sin historial</Text>
          <Text style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>
            Este ejercicio no tiene series registradas todavía.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.workout_id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item: session }) => (
            <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#f1f5f9", overflow: "hidden" }}>
              {/* Session header */}
              <View style={{ backgroundColor: "#f8fafc", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#0f172a", textTransform: "capitalize" }}>
                  {formatDate(session.date)}
                </Text>
                {session.comment ? (
                  <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }} numberOfLines={1}>{session.comment}</Text>
                ) : null}
              </View>

              {/* Sets */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                {session.sets.length === 0 ? (
                  <Text style={{ fontSize: 13, color: "#cbd5e1", paddingVertical: 6 }}>Sin series</Text>
                ) : (
                  session.sets.map((set, idx) => (
                    <View
                      key={set.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 7,
                        borderBottomWidth: idx < session.sets.length - 1 ? 1 : 0,
                        borderColor: "#f8fafc",
                      }}
                    >
                      <View style={{
                        width: 26, height: 26, borderRadius: 13,
                        backgroundColor: set.is_complete ? "#6366f115" : "#f1f5f9",
                        alignItems: "center", justifyContent: "center", marginRight: 12,
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: set.is_complete ? "#6366f1" : "#94a3b8" }}>
                          {idx + 1}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, color: "#0f172a", flex: 1 }}>
                        {formatSet(set, exerciseType, unit)}
                      </Text>
                      {set.comment ? (
                        <Text style={{ fontSize: 11, color: "#94a3b8", maxWidth: 120 }} numberOfLines={1}>
                          {set.comment}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

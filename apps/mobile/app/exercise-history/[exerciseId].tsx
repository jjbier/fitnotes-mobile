import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../lib/theme";
import {
  SafeAreaView, Text, View, TouchableOpacity,
  ActivityIndicator, FlatList, useWindowDimensions, ScrollView,
  Modal, TextInput, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { ExerciseType, getExerciseFields, useExerciseStore, usePreferencesStore, calculate1RM, estimateRepMax, todayISO } from "@fitnotes/core";
import { createExerciseRepository, createProgressRepository, type ChartPoint } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import LineChart, { type ChartDataPoint } from "../../components/LineChart";
import DateInput from "../../components/DateInput";
import { useRepositories } from "../../contexts/RepositoryContext";

type SetRow = {
  id: string;
  weight?: number;
  reps?: number;
  distance?: number;
  time_seconds?: number;
  is_complete: boolean;
  is_warmup: boolean;
  comment?: string;
  order_index: number;
};

type Session = {
  workout_id: string;
  date: string;
  comment?: string;
  sets: SetRow[];
};

type Metric = "weight" | "volume" | "reps" | "totalReps" | "est1rm" | "distance" | "totalDistance" | "time" | "totalTime" | "speed" | "pace" | "weightByReps" | "repMaxProgression";
type HistoryTab = "history" | "chart" | "stats";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
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

const ALL_METRICS: { key: Metric; label: string; types: ExerciseType[] | "all" }[] = [
  { key: "weight",       label: "Peso máx",     types: [ExerciseType.WEIGHT_REPS, ExerciseType.WEIGHT_ONLY, ExerciseType.WEIGHT_DISTANCE, ExerciseType.WEIGHT_TIME] },
  { key: "volume",       label: "Volumen",      types: [ExerciseType.WEIGHT_REPS, ExerciseType.WEIGHT_DISTANCE, ExerciseType.WEIGHT_TIME] },
  { key: "est1rm",       label: "1RM est.",     types: [ExerciseType.WEIGHT_REPS] },
  { key: "reps",         label: "Reps máx",     types: [ExerciseType.WEIGHT_REPS, ExerciseType.REPS_ONLY, ExerciseType.REPS_DISTANCE, ExerciseType.REPS_TIME] },
  { key: "totalReps",    label: "Reps totales", types: [ExerciseType.WEIGHT_REPS, ExerciseType.REPS_ONLY, ExerciseType.REPS_DISTANCE, ExerciseType.REPS_TIME] },
  { key: "distance",     label: "Distancia máx", types: [ExerciseType.DISTANCE_TIME, ExerciseType.DISTANCE_ONLY, ExerciseType.WEIGHT_DISTANCE, ExerciseType.REPS_DISTANCE] },
  { key: "totalDistance", label: "Distancia total", types: [ExerciseType.DISTANCE_TIME, ExerciseType.DISTANCE_ONLY, ExerciseType.WEIGHT_DISTANCE, ExerciseType.REPS_DISTANCE] },
  { key: "time",         label: "Tiempo máx",   types: [ExerciseType.DISTANCE_TIME, ExerciseType.TIME_ONLY, ExerciseType.WEIGHT_TIME, ExerciseType.REPS_TIME] },
  { key: "totalTime",    label: "Tiempo total", types: [ExerciseType.DISTANCE_TIME, ExerciseType.TIME_ONLY, ExerciseType.WEIGHT_TIME, ExerciseType.REPS_TIME] },
  { key: "speed",        label: "Velocidad máx", types: [ExerciseType.DISTANCE_TIME] },
  { key: "pace",         label: "Mejor ritmo",  types: [ExerciseType.DISTANCE_TIME] },
  { key: "weightByReps", label: "Peso por reps", types: [ExerciseType.WEIGHT_REPS] },
  { key: "repMaxProgression", label: "Progresión rep max", types: [ExerciseType.WEIGHT_REPS] },
];

export default function ExerciseHistoryScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { exerciseId, name, type, weightUnit } = useLocalSearchParams<{
    exerciseId: string; name: string; type: string; weightUnit: string;
  }>();

  const storeExercise = useExerciseStore((s) => s.exercises.find((e) => e.id === exerciseId));
  const updateExerciseStore = useExerciseStore((s) => s.updateExercise);
  const { exerciseRepo, workoutRepo, userId } = useRepositories();
  const remoteExerciseRepo = useMemo(() => createExerciseRepository(supabase), []);
  const progressRepo = useMemo(() => createProgressRepository(supabase), []);

  const [tab, setTab] = useState<HistoryTab>("history");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [metric, setMetric] = useState<Metric>((storeExercise?.default_chart ?? "weight") as Metric);
  const [repTarget, setRepTarget] = useState(5);
  const [showTrend, setShowTrend] = useState(false);
  const estimatedRecordsRepLimit = usePreferencesStore((s) => s.preferences.estimated_records_rep_limit);
  const estRepLimit = estimatedRecordsRepLimit && estimatedRecordsRepLimit > 0 ? estimatedRecordsRepLimit : undefined;
  const [exportingImage, setExportingImage] = useState(false);
  const chartShotRef = useRef<ViewShot>(null);

  async function handleExportImage() {
    if (!chartShotRef.current?.capture) return;
    setExportingImage(true);
    try {
      const uri = await chartShotRef.current.capture();
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Compartir gráfico de progreso" });
      } else {
        Alert.alert("No disponible", "Compartir no está disponible en este dispositivo.");
      }
    } catch {
      Alert.alert("Error", "No se pudo generar la imagen del gráfico.");
    } finally {
      setExportingImage(false);
    }
  }
  const [copyingSetId, setCopyingSetId] = useState<string | null>(null);
  const [copiedSetIds, setCopiedSetIds] = useState<Set<string>>(new Set());
  const [statsPeriod, setStatsPeriod] = useState<"workout" | "week" | "month" | "year" | "all" | "custom">("all");
  const [statsFrom, setStatsFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]!; });
  const [statsTo, setStatsTo] = useState(() => new Date().toISOString().split("T")[0]!);

  const [hideWarmup, setHideWarmup] = useState(true);

  // Edit set modal state
  const [editSet, setEditSet] = useState<{ sessionIdx: number; setIdx: number; set: SetRow } | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editReps, setEditReps] = useState("");
  const [editDistance, setEditDistance] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [bulkEditVisible, setBulkEditVisible] = useState(false);
  const [bulkWeight, setBulkWeight] = useState("");
  const [bulkReps, setBulkReps] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const exerciseType = (type ?? ExerciseType.WEIGHT_REPS) as ExerciseType;
  const unit = weightUnit ?? "kg";

  async function handleCopyToToday(set: SetRow) {
    setCopyingSetId(set.id);
    try {
      const today = todayISO();
      let todayWorkout = (await workoutRepo.getWorkoutByDate(today)).data;
      if (!todayWorkout) {
        todayWorkout = (await workoutRepo.createWorkout({ date: today }, userId)).data;
      }
      if (!todayWorkout) return;

      const todayWEs = (await workoutRepo.getWorkoutExercises(todayWorkout.id)).data ?? [];
      let targetWE = todayWEs.find((w) => w.exercise_id === exerciseId);
      if (!targetWE) {
        targetWE = (await workoutRepo.addExercise({
          workout_id: todayWorkout.id,
          exercise_id: exerciseId,
          order_index: todayWEs.length,
        }, userId)).data ?? undefined;
      }
      if (!targetWE) return;

      await workoutRepo.createSet({
        workout_exercise_id: targetWE.id,
        order_index: 999,
        ...(set.weight != null && { weight: set.weight }),
        ...(set.reps != null && { reps: set.reps }),
        ...(set.distance != null && { distance: set.distance }),
        ...(set.time_seconds != null && { time_seconds: set.time_seconds }),
      }, userId);

      setCopiedSetIds((prev) => new Set(prev).add(set.id));
    } finally {
      setCopyingSetId(null);
    }
  }

  useEffect(() => {
    async function load() {
      const { data, error: err } = await remoteExerciseRepo.getExerciseHistory(exerciseId);
      if (err) { setError(err.message); setLoading(false); return; }
      setSessions(data ?? []);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId]);

  useEffect(() => {
    if (tab !== "chart" || chartPoints.length > 0) return;
    setChartLoading(true);
    progressRepo.getChartData(exerciseId).then((points) => {
      setChartPoints(points);
      setChartLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function openEditSet(sessionIdx: number, setIdx: number, set: SetRow) {
    setEditSet({ sessionIdx, setIdx, set });
    setEditWeight(set.weight != null ? String(set.weight) : "");
    setEditReps(set.reps != null ? String(set.reps) : "");
    setEditDistance(set.distance != null ? String(set.distance) : "");
    setEditTime(set.time_seconds != null ? String(set.time_seconds) : "");
    setEditComment(set.comment ?? "");
  }

  async function handleSaveEditSet() {
    if (!editSet) return;
    setEditSaving(true);
    const patch: Partial<SetRow> = {
      weight: editWeight ? parseFloat(editWeight) : undefined,
      reps: editReps ? parseInt(editReps, 10) : undefined,
      distance: editDistance ? parseFloat(editDistance) : undefined,
      time_seconds: editTime ? parseInt(editTime, 10) : undefined,
      comment: editComment || undefined,
    };
    await workoutRepo.updateSet(editSet.set.id, patch);
    setSessions((prev) =>
      prev.map((s, si) =>
        si !== editSet.sessionIdx
          ? s
          : { ...s, sets: s.sets.map((set, setI) => setI !== editSet.setIdx ? set : { ...set, ...patch }) }
      )
    );
    setEditSet(null);
    setEditSaving(false);
  }

  async function handleDeleteHistorySet(sessionIdx: number, setIdx: number, setId: string) {
    Alert.alert("¿Eliminar serie?", undefined, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await workoutRepo.deleteSet(setId);
          setSessions((prev) =>
            prev.map((s, si) =>
              si !== sessionIdx ? s : { ...s, sets: s.sets.filter((_, i) => i !== setIdx) }
            )
          );
        },
      },
    ]);
  }

  function enterSelectMode(id: string) {
    setSelectMode(true);
    setSelectedSetIds(new Set([id]));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedSetIds(new Set());
  }

  function toggleSetSelection(id: string) {
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    Alert.alert(`¿Eliminar ${selectedSetIds.size} ${selectedSetIds.size === 1 ? "serie" : "series"}?`, undefined, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const toDelete = new Set(selectedSetIds);
          for (const id of toDelete) {
            await workoutRepo.deleteSet(id);
          }
          setSessions((prev) =>
            prev.map((s) => ({ ...s, sets: s.sets.filter((set) => !toDelete.has(set.id)) }))
          );
          exitSelectMode();
        },
      },
    ]);
  }

  async function handleBulkEdit() {
    if (!bulkWeight && !bulkReps) return;
    setBulkSaving(true);
    const patch: Partial<SetRow> = {};
    if (bulkWeight) patch.weight = parseFloat(bulkWeight);
    if (bulkReps) patch.reps = parseInt(bulkReps, 10);
    const ids = new Set(selectedSetIds);
    for (const id of ids) {
      await workoutRepo.updateSet(id, patch);
    }
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        sets: s.sets.map((set) => ids.has(set.id) ? { ...set, ...patch } : set),
      }))
    );
    setBulkSaving(false);
    setBulkEditVisible(false);
    setBulkWeight("");
    setBulkReps("");
    exitSelectMode();
  }

  const availableMetrics = ALL_METRICS.filter((m) =>
    m.types === "all" || m.types.includes(exerciseType)
  );

  function metricValue(p: typeof chartPoints[number]): number {
    if (metric === "weight") return p.maxWeight;
    if (metric === "volume") return p.totalVolume;
    if (metric === "est1rm") return p.est1RM;
    if (metric === "reps") return p.maxReps;
    if (metric === "totalReps") return p.totalReps;
    if (metric === "distance") return p.maxDistance;
    if (metric === "totalDistance") return p.totalDistance;
    if (metric === "time") return p.maxTime;
    if (metric === "totalTime") return p.totalTime;
    if (metric === "speed") return p.maxSpeed;
    if (metric === "pace") return p.bestPace;
    return 0;
  }

  const isSpecialMetric = metric === "weightByReps" || metric === "repMaxProgression";

  const rawChartData: ChartDataPoint[] = isSpecialMetric
    ? chartPoints
        .map((p) => ({
          label: formatDateShort(p.date),
          value: metric === "weightByReps"
            ? p.weightByReps[repTarget]
            : (p.est1RM > 0 ? estimateRepMax(p.est1RM, repTarget) : undefined),
        }))
        .filter((p): p is ChartDataPoint => p.value != null && p.value > 0)
    : chartPoints.map((p) => ({ label: formatDateShort(p.date), value: metricValue(p) }));

  const trendValues = showTrend && rawChartData.length >= 2
    ? (() => {
        const values = rawChartData.map((p) => p.value);
        const n = values.length;
        const xMean = (n - 1) / 2;
        const yMean = values.reduce((s, v) => s + v, 0) / n;
        const num = values.reduce((s, v, i) => s + (i - xMean) * (v - yMean), 0);
        const den = values.reduce((s, _, i) => s + (i - xMean) ** 2, 0);
        if (den === 0) return values.map(() => yMean);
        const slope = num / den;
        const intercept = yMean - slope * xMean;
        return values.map((_, i) => slope * i + intercept);
      })()
    : null;

  const chartData = rawChartData;

  const chartUnit = metric === "weight" || metric === "est1rm" || metric === "weightByReps" || metric === "repMaxProgression" ? unit
    : metric === "volume" ? `${unit}·reps`
    : metric === "reps" || metric === "totalReps" ? "reps"
    : metric === "distance" || metric === "totalDistance" ? "km"
    : metric === "speed" ? "km/h"
    : metric === "pace" ? "s/km"
    : "s";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.backgroundAlt }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.background, borderBottomWidth: 1, borderColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }} numberOfLines={1}>{name ?? "Historial"}</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>
            {loading ? "Cargando…" : `${sessions.length} ${sessions.length === 1 ? "sesión" : "sesiones"}`}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={{ backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
        <View style={{ flexDirection: "row" }}>
          {([["history", "time-outline", "Historial"], ["chart", "trending-up-outline", "Gráfico"], ["stats", "bar-chart-outline", "Estadísticas"]] as const).map(([key, icon, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setTab(key)}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderColor: tab === key ? "#6366f1" : "transparent" }}
            >
              <Ionicons name={icon} size={16} color={tab === key ? "#6366f1" : "#94a3b8"} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: tab === key ? "#6366f1" : "#94a3b8" }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {tab === "history" && (
          <TouchableOpacity
            onPress={() => setHideWarmup((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 7, borderTopWidth: 1, borderColor: "#f8fafc" }}
          >
            <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: hideWarmup ? "#6366f1" : "#cbd5e1", backgroundColor: hideWarmup ? "#6366f1" : "transparent", alignItems: "center", justifyContent: "center" }}>
              {hideWarmup && <Ionicons name="checkmark" size={10} color="#fff" />}
            </View>
            <Text style={{ fontSize: 12, color: "#64748b" }}>Ocultar calentamientos</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* History tab */}
      {tab === "history" && (
        loading ? (
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
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: selectMode ? 88 : 16 }}
            renderItem={({ item: session }) => {
              const visibleSets = hideWarmup ? session.sets.filter((s) => !s.is_warmup) : session.sets;
              if (visibleSets.length === 0 && hideWarmup) return null;
              return (
              <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#f1f5f9", overflow: "hidden" }}>
                <View style={{ backgroundColor: "#f8fafc", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#0f172a", textTransform: "capitalize", flex: 1 }}>
                      {formatDate(session.date)}
                    </Text>
                    {(() => {
                      const vol = visibleSets.filter((s) => s.is_complete && !s.is_warmup).reduce((acc, s) => acc + (s.weight && s.reps ? s.weight * s.reps : 0), 0);
                      return vol > 0 ? (
                        <Text style={{ fontSize: 11, color: "#6366f1", fontWeight: "600", marginRight: 10 }}>{vol.toLocaleString()} {unit}</Text>
                      ) : null;
                    })()}
                    <TouchableOpacity
                      onPress={() => router.push(`/workout-detail/${session.workout_id}` as never)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Ver entrenamiento completo"
                    >
                      <Ionicons name="list-outline" size={16} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                  {session.comment ? (
                    <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }} numberOfLines={1}>{session.comment}</Text>
                  ) : null}
                </View>
                <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                  {visibleSets.length === 0 ? (
                    <Text style={{ fontSize: 13, color: "#cbd5e1", paddingVertical: 6 }}>Sin series</Text>
                  ) : (
                    visibleSets.map((set, idx) => (
                      <TouchableOpacity
                        key={set.id}
                        onPress={() => selectMode ? toggleSetSelection(set.id) : openEditSet(sessions.indexOf(session), idx, set)}
                        onLongPress={() => !selectMode && enterSelectMode(set.id)}
                        delayLongPress={400}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: idx < session.sets.length - 1 ? 1 : 0, borderColor: "#f8fafc", backgroundColor: selectMode && selectedSetIds.has(set.id) ? "#6366f108" : "transparent", borderRadius: 6 }}
                      >
                        {selectMode ? (
                          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selectedSetIds.has(set.id) ? "#6366f1" : "#cbd5e1", backgroundColor: selectedSetIds.has(set.id) ? "#6366f1" : "transparent", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                            {selectedSetIds.has(set.id) && <Ionicons name="checkmark" size={12} color="#fff" />}
                          </View>
                        ) : (
                          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: set.is_warmup ? "#fef3c7" : set.is_complete ? "#6366f115" : "#f1f5f9", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: set.is_warmup ? "#d97706" : set.is_complete ? "#6366f1" : "#94a3b8" }}>{set.is_warmup ? "W" : idx + 1}</Text>
                          </View>
                        )}
                        <Text style={{ fontSize: 14, color: "#0f172a", flex: 1 }}>{formatSet(set, exerciseType, unit)}</Text>
                        {!selectMode && set.comment ? (
                          <Text style={{ fontSize: 11, color: "#94a3b8", maxWidth: 100 }} numberOfLines={1}>{set.comment}</Text>
                        ) : null}
                        {!selectMode && (
                          <TouchableOpacity
                            onPress={() => handleCopyToToday(set)}
                            disabled={copyingSetId === set.id}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel="Copiar serie a hoy"
                            style={{ marginLeft: 8 }}
                          >
                            <Ionicons
                              name={copiedSetIds.has(set.id) ? "checkmark-circle" : "copy-outline"}
                              size={15}
                              color={copiedSetIds.has(set.id) ? "#10b981" : "#94a3b8"}
                            />
                          </TouchableOpacity>
                        )}
                        {!selectMode && <Ionicons name="pencil-outline" size={13} color="#cbd5e1" style={{ marginLeft: 6 }} />}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>
              );
            }}
          />
        )
      )}

      {/* Stats tab */}
      {tab === "stats" && (
        loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color="#6366f1" />
        ) : sessions.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: 80, paddingHorizontal: 32 }}>
            <Ionicons name="bar-chart-outline" size={48} color="#cbd5e1" />
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#64748b", marginTop: 16 }}>Sin datos</Text>
          </View>
        ) : (() => {
          const filteredSessions = (() => {
            if (statsPeriod === "workout") return sessions.slice(0, 1);
            if (statsPeriod === "all") return sessions;
            if (statsPeriod === "custom") return sessions.filter((s) => s.date >= statsFrom && s.date <= statsTo);
            const days = statsPeriod === "week" ? 7 : statsPeriod === "month" ? 30 : 365;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            const cutoffStr = cutoff.toISOString().split("T")[0]!;
            return sessions.filter((s) => s.date >= cutoffStr);
          })();
          const allSets = filteredSessions.flatMap((s) => s.sets);
          const completeSets = allSets.filter((s) => s.is_complete && !s.is_warmup);
          const setsWithWeight = completeSets.filter((s) => s.weight != null && s.reps != null);
          const bestWeight = setsWithWeight.length > 0 ? Math.max(...setsWithWeight.map((s) => s.weight!)) : null;
          const bestReps = completeSets.filter((s) => s.reps != null).length > 0 ? Math.max(...completeSets.filter((s) => s.reps != null).map((s) => s.reps!)) : null;
          const totalVolume = setsWithWeight.reduce((acc, s) => acc + s.weight! * s.reps!, 0);
          const totalSets = completeSets.length;
          const avgSetsPerSession = filteredSessions.length > 0 ? (totalSets / filteredSessions.length).toFixed(1) : "0";
          const ormEligible = setsWithWeight.filter((s) => s.reps! < 37 && (!estRepLimit || s.reps! <= estRepLimit));
          const bestORM = ormEligible.length > 0
            ? Math.max(...ormEligible.map((s) => calculate1RM(s.weight!, s.reps!)))
            : null;
          const stats = [
            { label: "Sesiones", value: String(filteredSessions.length), icon: "calendar-outline" as const },
            { label: "Series totales", value: String(totalSets), icon: "list-outline" as const },
            { label: "Series/sesión", value: avgSetsPerSession, icon: "stats-chart-outline" as const },
            { label: "Mejor peso", value: bestWeight != null ? `${bestWeight} ${unit}` : "—", icon: "barbell-outline" as const },
            { label: "Mejor reps", value: bestReps != null ? `${bestReps}` : "—", icon: "repeat-outline" as const },
            { label: "Volumen total", value: totalVolume > 0 ? `${(totalVolume / 1000).toFixed(1)}k ${unit}` : "—", icon: "flame-outline" as const },
            { label: "1RM estimado", value: bestORM != null ? `${bestORM % 1 === 0 ? bestORM : bestORM.toFixed(1)} ${unit}` : "—", icon: "trophy-outline" as const },
            { label: "Primera sesión", value: filteredSessions.at(-1)?.date ?? "—", icon: "time-outline" as const },
            { label: "Última sesión", value: filteredSessions[0]?.date ?? "—", icon: "checkmark-circle-outline" as const },
          ];
          return (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
                {([["workout", "Sesión"], ["week", "Semana"], ["month", "Mes"], ["year", "Año"], ["all", "Todo"], ["custom", "Personalizado"]] as const).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setStatsPeriod(key)}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1.5, borderColor: statsPeriod === key ? "#6366f1" : "#e2e8f0", backgroundColor: statsPeriod === key ? "#6366f1" : "transparent" }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: statsPeriod === key ? "#fff" : "#64748b" }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {statsPeriod === "custom" && (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <DateInput value={statsFrom} onChange={setStatsFrom} placeholder="Desde" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <DateInput value={statsTo} onChange={setStatsTo} placeholder="Hasta" />
                  </View>
                </View>
              )}

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {stats.map((stat) => (
                  <View key={stat.label} style={{ width: "47%", backgroundColor: "#f8fafc", borderRadius: 14, borderWidth: 1, borderColor: "#f1f5f9", padding: 14, gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name={stat.icon} size={14} color="#94a3b8" />
                      <Text style={{ fontSize: 11, fontWeight: "600", color: "#94a3b8", textTransform: "uppercase" }}>{stat.label}</Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: "700", color: "#0f172a" }}>{stat.value}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        })()
      )}

      {/* Chart tab */}
      {tab === "chart" && (
        chartLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color="#6366f1" />
        ) : chartPoints.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: 80, paddingHorizontal: 32 }}>
            <Ionicons name="trending-up-outline" size={48} color="#cbd5e1" />
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#64748b", marginTop: 16 }}>Sin datos</Text>
            <Text style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>
              Completa series marcándolas como completadas para ver tu progreso.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* Metric selector */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {availableMetrics.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => {
                    setMetric(m.key);
                    if (["weight", "volume", "reps"].includes(m.key)) {
                      exerciseRepo.updateExercise(exerciseId, { default_chart: m.key as "weight" | "volume" | "reps" });
                      updateExerciseStore(exerciseId, { default_chart: m.key as "weight" | "volume" | "reps" });
                    }
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: metric === m.key ? "#6366f1" : "#e2e8f0", backgroundColor: metric === m.key ? "#6366f1" : "transparent", alignItems: "center" }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: metric === m.key ? "#fff" : "#64748b" }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setShowTrend((v) => !v)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: showTrend ? "#f97316" : "#e2e8f0", backgroundColor: showTrend ? "#f97316" : "transparent", alignItems: "center" }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: showTrend ? "#fff" : "#64748b" }}>Tendencia</Text>
              </TouchableOpacity>
            </View>

            {isSpecialMetric && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748b" }}>Repeticiones:</Text>
                <TouchableOpacity
                  onPress={() => setRepTarget((v) => Math.max(1, v - 1))}
                  style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 16, color: "#64748b" }}>−</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#0f172a", minWidth: 20, textAlign: "center" }}>{repTarget}</Text>
                <TouchableOpacity
                  onPress={() => setRepTarget((v) => Math.min(15, v + 1))}
                  style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 16, color: "#64748b" }}>+</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Chart */}
            <ViewShot ref={chartShotRef} options={{ format: "png", quality: 0.95 }}>
              <View style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#f1f5f9", padding: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#0f172a" }}>
                      {storeExercise?.name ?? name}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#94a3b8" }}>{availableMetrics.find((m) => m.key === metric)?.label}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: "#94a3b8" }}>{chartUnit}</Text>
                </View>
                {chartData.length === 0 ? (
                  <Text style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", paddingVertical: 24 }}>
                    Sin sesiones a {repTarget} reps aún.
                  </Text>
                ) : (
                  <LineChart data={chartData} width={width - 64} height={200} trendData={trendValues ?? undefined} />
                )}
              </View>
            </ViewShot>

            {chartData.length > 0 && (
              <TouchableOpacity
                onPress={handleExportImage}
                disabled={exportingImage}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingVertical: 10, opacity: exportingImage ? 0.5 : 1 }}
              >
                {exportingImage ? (
                  <ActivityIndicator size="small" color="#6366f1" />
                ) : (
                  <>
                    <Ionicons name="share-outline" size={15} color="#6366f1" />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#6366f1" }}>Compartir imagen del gráfico</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Summary stats */}
            {(() => {
              const vals = chartData.map((p) => p.value);
              const best = Math.max(...vals);
              const latest = vals[vals.length - 1] ?? 0;
              const first = vals[0] ?? 0;
              const trend = first > 0 ? ((latest - first) / first * 100) : 0;
              return (
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {[
                    { label: "Mejor", value: `${best % 1 === 0 ? best : best.toFixed(1)} ${chartUnit}` },
                    { label: "Último", value: `${latest % 1 === 0 ? latest : latest.toFixed(1)} ${chartUnit}` },
                    { label: "Progresión", value: `${trend >= 0 ? "+" : ""}${trend.toFixed(1)}%`, positive: trend >= 0 },
                  ].map((stat) => (
                    <View key={stat.label} style={{ flex: 1, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#f1f5f9", padding: 12, alignItems: "center", gap: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: "#94a3b8", textTransform: "uppercase" }}>{stat.label}</Text>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "positive" in stat && stat.positive === false ? "#ef4444" : "#0f172a" }}>{stat.value}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* Sessions count */}
            <Text style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
              {chartPoints.length} sesiones registradas
            </Text>
          </ScrollView>
        )
      )}
      {/* Multi-select action bar */}
      {selectMode && tab === "history" && (
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", borderTopWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#0f172a" }}>{selectedSetIds.size} {selectedSetIds.size === 1 ? "serie" : "series"}</Text>
          <TouchableOpacity
            onPress={() => { setBulkWeight(""); setBulkReps(""); setBulkEditVisible(true); }}
            disabled={selectedSetIds.size === 0}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: "#6366f1", opacity: selectedSetIds.size === 0 ? 0.4 : 1 }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#fff" }}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBulkDelete}
            disabled={selectedSetIds.size === 0}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: "#fee2e2", opacity: selectedSetIds.size === 0 ? 0.4 : 1 }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#ef4444" }}>Eliminar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={exitSelectMode} style={{ padding: 6 }}>
            <Ionicons name="close" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>
      )}

      {/* Bulk edit modal */}
      <Modal visible={bulkEditVisible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setBulkEditVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
            <TouchableOpacity onPress={() => setBulkEditVisible(false)} style={{ marginRight: 12 }}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: "#0f172a" }}>
              Editar {selectedSetIds.size} {selectedSetIds.size === 1 ? "serie" : "series"}
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 13, color: "#64748b" }}>Los campos vacíos no se modifican.</Text>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b" }}>{unit.toUpperCase()}</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
                keyboardType="decimal-pad"
                value={bulkWeight}
                onChangeText={setBulkWeight}
                placeholder="Sin cambios"
                placeholderTextColor="#cbd5e1"
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b" }}>REPS</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
                keyboardType="number-pad"
                value={bulkReps}
                onChangeText={setBulkReps}
                placeholder="Sin cambios"
                placeholderTextColor="#cbd5e1"
              />
            </View>
            <TouchableOpacity
              onPress={handleBulkEdit}
              disabled={bulkSaving || (!bulkWeight && !bulkReps)}
              style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8, opacity: !bulkWeight && !bulkReps ? 0.5 : 1 }}
            >
              {bulkSaving
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ fontSize: 15, fontWeight: "600", color: "#fff" }}>Aplicar cambios</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Edit set modal */}
      <Modal visible={editSet !== null} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setEditSet(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
            <TouchableOpacity onPress={() => setEditSet(null)} style={{ marginRight: 12 }}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: "#0f172a" }}>Editar serie</Text>
            <TouchableOpacity
              onPress={() => editSet && handleDeleteHistorySet(editSet.sessionIdx, editSet.setIdx, editSet.set.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            {editSet?.set.weight != null || exerciseType === ExerciseType.WEIGHT_REPS || exerciseType === ExerciseType.WEIGHT_ONLY ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b" }}>{unit.toUpperCase()}</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
                  keyboardType="decimal-pad"
                  value={editWeight}
                  onChangeText={setEditWeight}
                  placeholder="—"
                  placeholderTextColor="#cbd5e1"
                />
              </View>
            ) : null}
            {editSet?.set.reps != null || exerciseType === ExerciseType.WEIGHT_REPS || exerciseType === ExerciseType.REPS_ONLY ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b" }}>REPS</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
                  keyboardType="number-pad"
                  value={editReps}
                  onChangeText={setEditReps}
                  placeholder="—"
                  placeholderTextColor="#cbd5e1"
                />
              </View>
            ) : null}
            {editSet?.set.distance != null ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b" }}>KM</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
                  keyboardType="decimal-pad"
                  value={editDistance}
                  onChangeText={setEditDistance}
                  placeholder="—"
                  placeholderTextColor="#cbd5e1"
                />
              </View>
            ) : null}
            {editSet?.set.time_seconds != null ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b" }}>SEGUNDOS</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
                  keyboardType="number-pad"
                  value={editTime}
                  onChangeText={setEditTime}
                  placeholder="—"
                  placeholderTextColor="#cbd5e1"
                />
              </View>
            ) : null}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b" }}>NOTA</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top" }}
                value={editComment}
                onChangeText={setEditComment}
                placeholder="Nota opcional…"
                placeholderTextColor="#cbd5e1"
                multiline
              />
            </View>
            <TouchableOpacity
              onPress={handleSaveEditSet}
              disabled={editSaving}
              style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 }}
            >
              {editSaving
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ fontSize: 15, fontWeight: "600", color: "#fff" }}>Guardar cambios</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

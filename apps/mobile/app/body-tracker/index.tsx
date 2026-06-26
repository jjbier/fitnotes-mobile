import { useEffect, useMemo, useState, useCallback } from "react";
import {
  SafeAreaView, ScrollView, Text, View, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, KeyboardAvoidingView,
  Platform, Alert, useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { createBodyTrackerRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import LineChart, { type ChartDataPoint } from "../../components/LineChart";
import DateInput from "../../components/DateInput";

interface Measurement {
  id: string;
  name: string;
  unit: string;
  is_enabled: boolean;
  goal_type: string;
  goal_value: number | null;
}

interface Entry {
  id: string;
  measurement_id: string;
  value: number;
  recorded_at: string;
  comment: string | null;
}

const PRESET_UNITS = ["kg", "lbs", "cm", "in", "%"];

export default function BodyTrackerScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<"track" | "history" | "chart">("track");
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [latestEntries, setLatestEntries] = useState<Record<string, Entry>>({});
  const [previousEntries, setPreviousEntries] = useState<Record<string, Entry>>({});
  const [historyEntries, setHistoryEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState("");

  const [logModal, setLogModal] = useState(false);
  const [logMeasurementId, setLogMeasurementId] = useState("");
  const [logValue, setLogValue] = useState("");
  const [logComment, setLogComment] = useState("");
  const [logDate, setLogDate] = useState("");
  const [logSaving, setLogSaving] = useState(false);

  const [chartMeasurementId, setChartMeasurementId] = useState<string | null>(null);
  const [chartEntries, setChartEntries] = useState<Entry[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const [measureModal, setMeasureModal] = useState(false);
  const [editMeasurement, setEditMeasurement] = useState<Measurement | null>(null);
  const [measureName, setMeasureName] = useState("");
  const [measureUnit, setMeasureUnit] = useState("kg");
  const [measureGoalType, setMeasureGoalType] = useState<"INCREASE" | "DECREASE">("INCREASE");
  const [measureGoalValue, setMeasureGoalValue] = useState("");
  const [measureSaving, setMeasureSaving] = useState(false);

  const repo = useMemo(() => createBodyTrackerRepository(supabase), []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? "";
    if (uid) setUserId(uid);

    const { data: mData } = await repo.getMeasurements();
    if (mData) {
      setMeasurements(mData as Measurement[]);
      const latestMap: Record<string, Entry> = {};
      const prevMap: Record<string, Entry> = {};
      await Promise.all(
        mData.filter((m) => m.is_enabled).map(async (m) => {
          const { data: entries } = await repo.getEntries(m.id, 2);
          if (entries?.[0]) latestMap[m.id] = entries[0] as Entry;
          if (entries?.[1]) prevMap[m.id] = entries[1] as Entry;
        })
      );
      setLatestEntries(latestMap);
      setPreviousEntries(prevMap);
    }
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

  async function loadHistory() {
    const { data } = await repo.getAllEntries(userId);
    if (data) setHistoryEntries(data as Entry[]);
  }

  async function loadChart(measurementId: string) {
    setChartMeasurementId(measurementId);
    setChartLoading(true);
    const { data } = await repo.getEntries(measurementId, 60);
    if (data) setChartEntries((data as Entry[]).slice().reverse());
    setChartLoading(false);
  }

  function openLogModal(measurementId: string) {
    setLogMeasurementId(measurementId);
    setLogValue("");
    setLogComment("");
    setLogDate(new Date().toISOString().split("T")[0]!);
    setLogModal(true);
  }

  async function handleLogEntry() {
    if (!logMeasurementId || !logValue) return;
    setLogSaving(true);
    const recordedAt = logDate ? `${logDate}T12:00:00` : new Date().toISOString();
    const { data, error } = await repo.addEntry(
      { measurement_id: logMeasurementId, value: parseFloat(logValue), comment: logComment || undefined, recorded_at: recordedAt },
      userId
    );
    if (error) { Alert.alert("Error", error.message); setLogSaving(false); return; }
    if (data) {
      setPreviousEntries((prev) => ({
        ...prev,
        ...(latestEntries[logMeasurementId] ? { [logMeasurementId]: latestEntries[logMeasurementId]! } : {}),
      }));
      setLatestEntries((prev) => ({ ...prev, [logMeasurementId]: data as Entry }));
    }
    setLogModal(false);
    setLogSaving(false);
    if (tab === "history") loadHistory();
  }

  function openNewMeasurement() {
    setEditMeasurement(null);
    setMeasureName("");
    setMeasureUnit("kg");
    setMeasureGoalType("INCREASE");
    setMeasureGoalValue("");
    setMeasureModal(true);
  }

  function openEditMeasurement(m: Measurement) {
    setEditMeasurement(m);
    setMeasureName(m.name);
    setMeasureUnit(m.unit);
    setMeasureGoalType((m.goal_type === "DECREASE" ? "DECREASE" : "INCREASE") as "INCREASE" | "DECREASE");
    setMeasureGoalValue(m.goal_value != null ? String(m.goal_value) : "");
    setMeasureModal(true);
  }

  async function handleSaveMeasurement() {
    if (!measureName.trim() || !measureUnit.trim()) return;
    setMeasureSaving(true);
    const goalVal = measureGoalValue.trim() ? parseFloat(measureGoalValue) : null;
    if (editMeasurement) {
      const { error } = await repo.updateMeasurement(editMeasurement.id, {
        name: measureName.trim(),
        unit: measureUnit.trim(),
        goal_type: measureGoalType,
        goal_value: goalVal,
      });
      if (error) { Alert.alert("Error", error.message); setMeasureSaving(false); return; }
      setMeasurements((prev) =>
        prev.map((m) =>
          m.id === editMeasurement.id
            ? { ...m, name: measureName.trim(), unit: measureUnit.trim(), goal_type: measureGoalType, goal_value: goalVal }
            : m
        )
      );
    } else {
      const { data, error } = await repo.createMeasurement(
        { name: measureName.trim(), unit: measureUnit.trim(), is_enabled: true, goal_type: measureGoalType, goal_value: goalVal },
        userId
      );
      if (error) { Alert.alert("Error", error.message); setMeasureSaving(false); return; }
      if (data) setMeasurements((prev) => [...prev, data as Measurement]);
    }
    setMeasureModal(false);
    setMeasureSaving(false);
  }

  async function handleToggleEnabled(m: Measurement) {
    const { error } = await repo.updateMeasurement(m.id, { is_enabled: !m.is_enabled });
    if (!error) setMeasurements((prev) => prev.map((mm) => mm.id === m.id ? { ...mm, is_enabled: !mm.is_enabled } : mm));
  }

  function handleDeleteMeasurement(m: Measurement) {
    Alert.alert(
      "Eliminar medida",
      `¿Eliminar "${m.name}" y todo su historial? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            await repo.deleteMeasurement(m.id);
            setMeasurements((prev) => prev.filter((mm) => mm.id !== m.id));
            setLatestEntries((prev) => { const next = { ...prev }; delete next[m.id]; return next; });
          },
        },
      ]
    );
  }

  function handleDeleteEntry(id: string) {
    Alert.alert("Eliminar registro", "¿Eliminar este registro?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await repo.deleteEntry(id);
          setHistoryEntries((prev) => prev.filter((e) => e.id !== id));
        },
      },
    ]);
  }

  const enabledMeasurements = measurements.filter((m) => m.is_enabled);
  const disabledMeasurements = measurements.filter((m) => !m.is_enabled);
  const measurementName = (id: string) => measurements.find((m) => m.id === id)?.name ?? "—";
  const measurementUnit = (id: string) => measurements.find((m) => m.id === id)?.unit ?? "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#0f172a" }}>Medidas corporales</Text>
        <TouchableOpacity onPress={openNewMeasurement} style={{ padding: 4 }}>
          <Ionicons name="add-circle-outline" size={26} color="#6366f1" />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: "row", marginHorizontal: 16, marginBottom: 12, borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", overflow: "hidden" }}>
        {([["track", "Registrar"], ["history", "Historial"], ["chart", "Gráfico"]] as const).map(([t, label]) => (
          <TouchableOpacity
            key={t}
            onPress={() => {
              setTab(t);
              if (t === "history") loadHistory();
              if (t === "chart" && enabledMeasurements.length > 0 && !chartMeasurementId) {
                void loadChart(enabledMeasurements[0]!.id);
              }
            }}
            style={{ flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: tab === t ? "#6366f1" : "transparent" }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: tab === t ? "#fff" : "#64748b" }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : tab === "track" ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}>
          {enabledMeasurements.length === 0 && disabledMeasurements.length === 0 ? (
            <View style={{ paddingVertical: 60, alignItems: "center", gap: 14 }}>
              <Ionicons name="body-outline" size={52} color="#cbd5e1" />
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#64748b" }}>Sin medidas activas</Text>
              <Text style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", paddingHorizontal: 24 }}>
                Añade medidas como peso corporal, % de grasa, cintura…
              </Text>
              <TouchableOpacity
                onPress={openNewMeasurement}
                style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 }}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Añadir primera medida</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {enabledMeasurements.map((m) => {
                const latest = latestEntries[m.id];
                return (
                  <View key={m.id} style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, padding: 16, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: "#0f172a" }}>{m.name}</Text>
                        <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 11, color: "#94a3b8" }}>{m.unit}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        <TouchableOpacity onPress={() => openEditMeasurement(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="pencil-outline" size={17} color="#94a3b8" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleToggleEnabled(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="eye-outline" size={17} color="#94a3b8" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteMeasurement(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="trash-outline" size={17} color="#94a3b8" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Text style={{ fontSize: 34, fontWeight: "700", color: "#0f172a", marginTop: 4 }}>
                      {latest ? latest.value : "—"}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#94a3b8" }}>
                      {latest
                        ? new Date(latest.recorded_at).toLocaleDateString("es-ES")
                        : "Sin registros aún"}
                    </Text>
                    {(() => {
                      const prev = previousEntries[m.id];
                      if (!latest || !prev) return null;
                      const delta = latest.value - prev.value;
                      const sign = delta >= 0 ? "+" : "";
                      const color = m.goal_type === "DECREASE"
                        ? (delta <= 0 ? "#22c55e" : "#ef4444")
                        : (delta >= 0 ? "#22c55e" : "#ef4444");
                      return (
                        <Text style={{ fontSize: 13, fontWeight: "600", color }}>
                          {sign}{delta % 1 === 0 ? delta : delta.toFixed(1)} {m.unit} vs anterior
                        </Text>
                      );
                    })()}

                    <TouchableOpacity
                      onPress={() => openLogModal(m.id)}
                      style={{ marginTop: 8, borderWidth: 1.5, borderColor: "#6366f1", borderRadius: 10, paddingVertical: 8, alignItems: "center" }}
                    >
                      <Text style={{ color: "#6366f1", fontSize: 13, fontWeight: "600" }}>+ Registrar valor</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {disabledMeasurements.length > 0 && (
                <View style={{ marginTop: 8, gap: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: "500", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Desactivadas
                  </Text>
                  {disabledMeasurements.map((m) => (
                    <View
                      key={m.id}
                      style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}
                    >
                      <Text style={{ flex: 1, fontSize: 14, color: "#94a3b8" }}>{m.name}</Text>
                      <TouchableOpacity
                        onPress={() => handleToggleEnabled(m)}
                        style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}
                      >
                        <Text style={{ fontSize: 12, color: "#64748b" }}>Activar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteMeasurement(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={16} color="#cbd5e1" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      ) : tab === "history" ? (
        /* History tab */
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 6 }}>
          {historyEntries.length === 0 ? (
            <View style={{ paddingVertical: 60, alignItems: "center", gap: 10 }}>
              <Ionicons name="time-outline" size={44} color="#cbd5e1" />
              <Text style={{ fontSize: 14, color: "#94a3b8" }}>Sin registros aún</Text>
            </View>
          ) : (
            historyEntries.map((entry) => (
              <View
                key={entry.id}
                style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#0f172a" }}>
                    {measurementName(entry.measurement_id)}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    {new Date(entry.recorded_at).toLocaleDateString("es-ES")}
                    {entry.comment ? ` · ${entry.comment}` : ""}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>
                  {entry.value} {measurementUnit(entry.measurement_id)}
                </Text>
                <TouchableOpacity onPress={() => handleDeleteEntry(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={16} color="#cbd5e1" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        /* Chart tab */
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 16 }}>
          {/* Measurement selector chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {enabledMeasurements.map((m) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => void loadChart(m.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: chartMeasurementId === m.id ? "#6366f1" : "#e2e8f0", backgroundColor: chartMeasurementId === m.id ? "#6366f1" : "transparent" }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: chartMeasurementId === m.id ? "#fff" : "#64748b" }}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {chartLoading ? (
            <ActivityIndicator color="#6366f1" style={{ marginTop: 32 }} />
          ) : chartEntries.length === 0 ? (
            <View style={{ paddingVertical: 60, alignItems: "center", gap: 10 }}>
              <Ionicons name="trending-up-outline" size={44} color="#cbd5e1" />
              <Text style={{ fontSize: 14, color: "#94a3b8" }}>Sin datos para esta medida</Text>
            </View>
          ) : (() => {
            const selectedM = measurements.find((m) => m.id === chartMeasurementId);
            const chartData: ChartDataPoint[] = chartEntries.map((e) => ({
              label: new Date(e.recorded_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
              value: e.value,
            }));
            const vals = chartEntries.map((e) => e.value);
            const latest = vals[vals.length - 1] ?? 0;
            const first = vals[0] ?? 0;
            const best = selectedM?.goal_type === "DECREASE" ? Math.min(...vals) : Math.max(...vals);
            const trend = first > 0 ? ((latest - first) / first * 100) : 0;
            const trendPositive = selectedM?.goal_type === "DECREASE" ? trend <= 0 : trend >= 0;

            return (
              <>
                <View style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#f1f5f9", padding: 16 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#0f172a" }}>{selectedM?.name}</Text>
                    <Text style={{ fontSize: 11, color: "#94a3b8" }}>{selectedM?.unit}</Text>
                  </View>
                  <LineChart data={chartData} width={width - 64} height={200} color="#6366f1" />
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  {[
                    { label: selectedM?.goal_type === "DECREASE" ? "Mínimo" : "Máximo", value: `${best}` },
                    { label: "Actual", value: `${latest}` },
                    { label: "Progresión", value: `${trend >= 0 ? "+" : ""}${trend.toFixed(1)}%`, positive: trendPositive },
                  ].map((stat) => (
                    <View key={stat.label} style={{ flex: 1, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#f1f5f9", padding: 12, alignItems: "center", gap: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: "#94a3b8", textTransform: "uppercase" }}>{stat.label}</Text>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "positive" in stat && stat.positive === false ? "#ef4444" : "#0f172a" }}>{stat.value}</Text>
                    </View>
                  ))}
                </View>

                <Text style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>{chartEntries.length} registros</Text>
              </>
            );
          })()}
        </ScrollView>
      )}

      {/* Log Entry Modal */}
      <Modal visible={logModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLogModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>
                Registrar {measurements.find((m) => m.id === logMeasurementId)?.name}
              </Text>
              <TouchableOpacity onPress={() => setLogModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>
                  Valor ({measurements.find((m) => m.id === logMeasurementId)?.unit ?? ""})
                </Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: "600", color: "#0f172a" }}
                  placeholder="0.0"
                  placeholderTextColor="#cbd5e1"
                  value={logValue}
                  onChangeText={setLogValue}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Fecha</Text>
                <DateInput value={logDate} onChange={setLogDate} placeholder="Hoy" clearable />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Comentario (opcional)</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }}
                  placeholder="ej. En ayunas"
                  placeholderTextColor="#94a3b8"
                  value={logComment}
                  onChangeText={setLogComment}
                />
              </View>
              <TouchableOpacity
                onPress={handleLogEntry}
                disabled={logSaving || !logValue}
                style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: logSaving || !logValue ? 0.5 : 1, marginTop: 8 }}
              >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                  {logSaving ? "Guardando…" : "Guardar"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create / Edit Measurement Modal */}
      <Modal visible={measureModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMeasureModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>
                {editMeasurement ? "Editar medida" : "Nueva medida"}
              </Text>
              <TouchableOpacity onPress={() => setMeasureModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Nombre</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
                  placeholder="ej. Peso corporal"
                  value={measureName}
                  onChangeText={setMeasureName}
                  autoFocus
                />
              </View>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Unidad</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {PRESET_UNITS.map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setMeasureUnit(u)}
                      style={{
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: measureUnit === u ? "#6366f1" : "#e2e8f0",
                        backgroundColor: measureUnit === u ? "#6366f1" : "transparent",
                        paddingHorizontal: 18,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "500", color: measureUnit === u ? "#fff" : "#374151" }}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 }}
                  placeholder="o escribe una unidad personalizada"
                  placeholderTextColor="#94a3b8"
                  value={measureUnit}
                  onChangeText={setMeasureUnit}
                />
              </View>
              {/* Goal type */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Objetivo (tendencia deseada)</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["INCREASE", "DECREASE"] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setMeasureGoalType(t)}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1.5, borderColor: measureGoalType === t ? "#6366f1" : "#e2e8f0", backgroundColor: measureGoalType === t ? "#6366f1" : "transparent", paddingVertical: 10 }}
                    >
                      <Text style={{ fontSize: 16 }}>{t === "INCREASE" ? "↑" : "↓"}</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: measureGoalType === t ? "#fff" : "#64748b" }}>
                        {t === "INCREASE" ? "Aumentar" : "Disminuir"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Goal value */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Valor objetivo (opcional)</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 }}
                  placeholder={`ej. ${measureGoalType === "DECREASE" ? "70" : "80"}`}
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                  value={measureGoalValue}
                  onChangeText={setMeasureGoalValue}
                />
              </View>

              <TouchableOpacity
                onPress={handleSaveMeasurement}
                disabled={measureSaving || !measureName.trim() || !measureUnit.trim()}
                style={{
                  backgroundColor: "#6366f1",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: measureSaving || !measureName.trim() || !measureUnit.trim() ? 0.5 : 1,
                  marginTop: 8,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                  {measureSaving ? "Guardando…" : editMeasurement ? "Guardar cambios" : "Crear medida"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

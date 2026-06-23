import { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  calculate1RM,
  estimateRepMax,
  calculateSetWeight,
  calculatePlates,
} from "@fitnotes/core";

type Tab = "1rm" | "set" | "plates";

export default function CalculatorsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("1rm");

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.title}>Herramientas</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {([["1rm", "1RM"], ["set", "Set %"], ["plates", "Plates"]] as [Tab, string][]).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, tab === key && styles.tabBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "1rm" && <OneRMCalculator />}
        {tab === "set" && <SetCalculator />}
        {tab === "plates" && <PlateCalculatorPanel />}
      </ScrollView>
    </SafeAreaView>
  );
}

function OneRMCalculator() {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const w = parseFloat(weight);
  const r = parseInt(reps, 10);
  const oneRM = w > 0 && r > 0 ? calculate1RM(w, r) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Calculadora 1RM</Text>
      <Text style={styles.cardSubtitle}>Fórmula de Brzycki — más precisa para 1–10 repeticiones</Text>

      <View style={styles.row}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Peso (kg)</Text>
          <TextInput
            value={weight}
            onChangeText={setWeight}
            placeholder="ej. 100"
            keyboardType="decimal-pad"
            style={styles.input}
            placeholderTextColor="#94a3b8"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Repeticiones</Text>
          <TextInput
            value={reps}
            onChangeText={setReps}
            placeholder="ej. 5"
            keyboardType="number-pad"
            style={[styles.input, { width: 90 }]}
            placeholderTextColor="#94a3b8"
          />
        </View>
      </View>

      {oneRM !== null && (
        <>
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>1RM estimado</Text>
            <Text style={styles.resultValue}>{oneRM.toFixed(1)} kg</Text>
          </View>

          <Text style={[styles.label, { marginTop: 16 }]}>Tabla de máximos por repetición</Text>
          <View style={styles.rmTable}>
            {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => {
              const est = n === 1 ? oneRM : estimateRepMax(oneRM, n);
              return (
                <View key={n} style={[styles.rmRow, n === r && styles.rmRowHighlight]}>
                  <Text style={styles.rmLabel}>{n}RM</Text>
                  <Text style={styles.rmValue}>{est.toFixed(1)} kg</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const PERCENTAGES = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
const INCREMENTS = [0.5, 1, 1.25, 2.5, 5];

function SetCalculator() {
  const [baseWeight, setBaseWeight] = useState("");
  const [incrementIdx, setIncrementIdx] = useState(3); // 2.5

  const base = parseFloat(baseWeight);
  const inc = INCREMENTS[incrementIdx]!;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Calculadora de series</Text>
      <Text style={styles.cardSubtitle}>Pesos de entrenamiento como % del peso de trabajo</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Peso base (kg)</Text>
        <TextInput
          value={baseWeight}
          onChangeText={setBaseWeight}
          placeholder="ej. 100"
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor="#94a3b8"
        />
      </View>

      <Text style={[styles.label, { marginTop: 12 }]}>Redondear a (kg)</Text>
      <View style={styles.chipRow}>
        {INCREMENTS.map((v, i) => (
          <TouchableOpacity
            key={v}
            onPress={() => setIncrementIdx(i)}
            style={[styles.chip, i === incrementIdx && styles.chipActive]}
          >
            <Text style={[styles.chipText, i === incrementIdx && styles.chipTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {base > 0 && (
        <View style={{ marginTop: 16, gap: 6 }}>
          {PERCENTAGES.map((pct) => {
            const setW = calculateSetWeight(base, pct, inc);
            return (
              <View key={pct} style={styles.pctRow}>
                <Text style={styles.pctLabel}>{pct}%</Text>
                <Text style={styles.pctValue}>{setW.toFixed(1)} kg</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

function PlateCalculatorPanel() {
  const [targetWeight, setTargetWeight] = useState("");
  const [barWeightIdx, setBarWeightIdx] = useState(2); // 20kg
  const barOptions = [10, 15, 20, 25];

  const target = parseFloat(targetWeight);
  const bar = barOptions[barWeightIdx]!;
  const perSide = target > 0 ? calculatePlates(target, bar, DEFAULT_PLATES) : [];
  const achieved = bar + perSide.reduce((s, p) => s + p * 2, 0);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Calculadora de discos</Text>
      <Text style={styles.cardSubtitle}>Discos por lado para el peso objetivo</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Peso objetivo (kg)</Text>
        <TextInput
          value={targetWeight}
          onChangeText={setTargetWeight}
          placeholder="ej. 140"
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor="#94a3b8"
        />
      </View>

      <Text style={[styles.label, { marginTop: 12 }]}>Peso de la barra</Text>
      <View style={styles.chipRow}>
        {barOptions.map((v, i) => (
          <TouchableOpacity
            key={v}
            onPress={() => setBarWeightIdx(i)}
            style={[styles.chip, i === barWeightIdx && styles.chipActive]}
          >
            <Text style={[styles.chipText, i === barWeightIdx && styles.chipTextActive]}>{v} kg</Text>
          </TouchableOpacity>
        ))}
      </View>

      {target > 0 && (
        <View style={{ marginTop: 16 }}>
          {perSide.length === 0 ? (
            <Text style={{ color: "#94a3b8", fontSize: 13 }}>
              {target <= bar ? "El objetivo está por debajo o igual al peso de la barra." : "No se puede alcanzar el objetivo con los discos estándar."}
            </Text>
          ) : (
            <>
              <View style={styles.resultBox}>
                <View>
                  <Text style={styles.resultLabel}>Discos por lado</Text>
                  <Text style={[styles.cardSubtitle, { marginTop: 2 }]}>{perSide.join(" + ")} kg</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.resultLabel}>Total kg</Text>
                  <Text style={styles.resultValue}>{achieved.toFixed(1)} kg</Text>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                <View style={styles.barViz}>
                  <View style={styles.barCollar} />
                  {[...perSide].reverse().map((p, i) => (
                    <PlateBlock key={`l${i}`} weight={p} />
                  ))}
                  <View style={styles.barRod}>
                    <Text style={styles.barRodText}>{bar}kg</Text>
                  </View>
                  {perSide.map((p, i) => (
                    <PlateBlock key={`r${i}`} weight={p} />
                  ))}
                  <View style={styles.barCollar} />
                </View>
              </ScrollView>

              {Math.abs(achieved - target) > 0.01 && (
                <Text style={{ color: "#d97706", fontSize: 12, marginTop: 8 }}>
                  Más cercano: {achieved.toFixed(1)} kg (diferencia de {Math.abs(achieved - target).toFixed(2)} kg)
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const PLATE_COLORS: Record<number, string> = {
  25: "#ef4444",
  20: "#3b82f6",
  15: "#eab308",
  10: "#22c55e",
  5: "#f1f5f9",
  2.5: "#fca5a5",
  1.25: "#e2e8f0",
  1: "#e2e8f0",
  0.5: "#f8fafc",
};

function PlateBlock({ weight }: { weight: number }) {
  const color = PLATE_COLORS[weight] ?? "#94a3b8";
  const height = Math.min(80, Math.max(32, weight * 2.5));
  return (
    <View style={[styles.plateBlock, { height, backgroundColor: color }]}>
      <Text style={styles.plateText}>{weight}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, gap: 4 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  tabBar: { flexDirection: "row", paddingHorizontal: 16, gap: 6, marginBottom: 4, marginTop: 8 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  tabBtnActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  tabBtnText: { fontSize: 13, fontWeight: "500", color: "#64748b" },
  tabBtnTextActive: { color: "#fff" },
  content: { padding: 16, paddingBottom: 60 },
  card: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, padding: 18, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  cardSubtitle: { fontSize: 12, color: "#94a3b8", marginBottom: 8 },
  row: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  inputGroup: { gap: 4 },
  label: { fontSize: 12, fontWeight: "500", color: "#64748b" },
  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: "#0f172a", width: 140 },
  resultBox: { backgroundColor: "#eff0fe", borderRadius: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  resultLabel: { fontSize: 11, color: "#6366f1", fontWeight: "500" },
  resultValue: { fontSize: 26, fontWeight: "700", color: "#6366f1" },
  rmTable: { gap: 4, marginTop: 4 },
  rmRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: "#f1f5f9" },
  rmRowHighlight: { borderColor: "#6366f1", backgroundColor: "#eff0fe" },
  rmLabel: { fontSize: 13, color: "#64748b", fontWeight: "500" },
  rmValue: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
  chipRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "#e2e8f0" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 12, fontWeight: "500", color: "#64748b" },
  chipTextActive: { color: "#fff" },
  pctRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#f1f5f9" },
  pctLabel: { fontSize: 13, color: "#64748b", fontWeight: "500" },
  pctValue: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
  barViz: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 12, paddingHorizontal: 4 },
  barCollar: { width: 8, height: 40, backgroundColor: "#94a3b8", borderRadius: 2 },
  barRod: { width: 80, height: 16, backgroundColor: "#cbd5e1", borderRadius: 4, alignItems: "center", justifyContent: "center" },
  barRodText: { fontSize: 10, color: "#475569", fontWeight: "500" },
  plateBlock: { width: 22, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  plateText: { fontSize: 8, fontWeight: "700", color: "#0f172a", transform: [{ rotate: "90deg" }] },
});

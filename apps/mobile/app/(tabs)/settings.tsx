import { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Share,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { createWorkoutRepository } from "@fitnotes/database";

function parseCSVRows(csv: string) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  type Row = {
    date: string; exerciseName: string;
    weight?: number; reps?: number; distance?: number; timeSecs?: number;
    comment?: string; isComplete: boolean; isWarmup: boolean;
  };
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    if (parts.length < 2) continue;
    const [date, exerciseName, weight, reps, distance, time, comment, completed, warmup] = parts;
    if (!date?.trim().match(/^\d{4}-\d{2}-\d{2}$/) || !exerciseName?.trim()) continue;
    rows.push({
      date: date.trim(), exerciseName: exerciseName.trim(),
      weight: weight?.trim() ? parseFloat(weight.trim()) : undefined,
      reps: reps?.trim() ? parseInt(reps.trim(), 10) : undefined,
      distance: distance?.trim() ? parseFloat(distance.trim()) : undefined,
      timeSecs: time?.trim() ? parseInt(time.trim(), 10) : undefined,
      comment: comment?.trim().replace(/^"|"$/g, "") || undefined,
      isComplete: completed?.trim().replace(/^"|"$/g, "") === "1",
      isWarmup: warmup?.trim().replace(/^"|"$/g, "") === "1",
    });
  }
  return rows;
}

export default function SettingsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [defaultWeightIncrement, setDefaultWeightIncrement] = useState("2.5");
  const [calendarWeekStart, setCalendarWeekStart] = useState<0 | 1>(1);
  const [autoSelectNextSet, setAutoSelectNextSet] = useState(true);
  const [defaultRestSeconds, setDefaultRestSeconds] = useState("90");
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCSV, setImportCSV] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      setEmail(session.user.email ?? "");
      setDisplayName((session.user.user_metadata?.display_name as string | undefined) ?? "");
      setWeightUnit((session.user.user_metadata?.weight_unit as "kg" | "lb" | undefined) ?? "kg");
      setDefaultWeightIncrement(String((session.user.user_metadata?.default_weight_increment as number | undefined) ?? 2.5));
      setCalendarWeekStart((session.user.user_metadata?.calendar_week_start as 0 | 1 | undefined) ?? 1);
      setAutoSelectNextSet((session.user.user_metadata?.auto_select_next_set as boolean | undefined) ?? true);
      setDefaultRestSeconds(String((session.user.user_metadata?.default_rest_seconds as number | undefined) ?? 90));
    });
  }, []);

  async function handleWeightUnitChange(unit: "kg" | "lb") {
    setWeightUnit(unit);
    await supabase.auth.updateUser({ data: { weight_unit: unit } });
  }

  async function handleDefaultIncrementChange(val: string) {
    setDefaultWeightIncrement(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      await supabase.auth.updateUser({ data: { default_weight_increment: parsed } });
    }
  }

  async function handleCalendarWeekStart(val: 0 | 1) {
    setCalendarWeekStart(val);
    await supabase.auth.updateUser({ data: { calendar_week_start: val } });
  }

  async function handleAutoSelectNextSet(val: boolean) {
    setAutoSelectNextSet(val);
    await supabase.auth.updateUser({ data: { auto_select_next_set: val } });
  }

  async function handleDefaultRestSeconds(val: string) {
    setDefaultRestSeconds(val);
    const parsed = parseInt(val);
    if (!isNaN(parsed) && parsed > 0) {
      await supabase.auth.updateUser({ data: { default_rest_seconds: parsed } });
    }
  }

  async function handleExportCSV() {
    setExportLoading(true);
    const repo = createWorkoutRepository(supabase);
    const csv = await repo.exportAllCSV();
    setExportLoading(false);
    if (!csv) { Alert.alert("Sin datos", "No hay entrenamientos que exportar."); return; }
    await Share.share({ message: csv, title: "FitNotes Export" });
  }

  async function handleImportCSV() {
    const rows = parseCSVRows(importCSV);
    if (rows.length === 0) { Alert.alert("Error", "No se encontraron filas válidas. Asegúrate de pegar un CSV con el formato correcto."); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { Alert.alert("Error", "No hay sesión activa."); return; }
    setImportLoading(true);
    const repo = createWorkoutRepository(supabase);
    const { imported, skipped, newExercises } = await repo.importFromCSV(rows, session.user.id);
    setImportLoading(false);
    setShowImportModal(false);
    setImportCSV("");
    Alert.alert(
      "Importación completada",
      `${imported} series importadas.\n${skipped > 0 ? `${skipped} series omitidas (fechas ya existentes).\n` : ""}${newExercises > 0 ? `${newExercises} ejercicios nuevos creados.` : ""}`
    );
  }

  async function handleSave() {
    setSaveStatus("saving");
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    });
    setSaveStatus(error ? "error" : "saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  async function handleSignOut() {
    Alert.alert("Cerrar sesión", "¿Estás seguro de que quieres cerrar sesión?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          setSignOutLoading(true);
          await supabase.auth.signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Configuración</Text>

        {/* Profile */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Perfil</Text>
          {email ? <Text style={styles.emailText}>{email}</Text> : null}
          <Text style={styles.label}>Nombre visible</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Tu nombre"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />
          <TouchableOpacity
            onPress={handleSave}
            disabled={saveStatus === "saving"}
            style={[styles.btn, styles.btnPrimary]}
          >
            <Text style={styles.btnPrimaryText}>
              {saveStatus === "saving" ? "Guardando…" : saveStatus === "saved" ? "¡Guardado!" : saveStatus === "error" ? "Error — intentar de nuevo" : "Guardar cambios"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferencias</Text>
          <View style={styles.prefRow}>
            <View>
              <Text style={styles.prefLabel}>Unidad de peso por defecto</Text>
              <Text style={styles.prefSub}>Usada en toda la app</Text>
            </View>
            <View style={styles.unitToggle}>
              <TouchableOpacity
                onPress={() => handleWeightUnitChange("kg")}
                style={[styles.unitBtn, weightUnit === "kg" && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, weightUnit === "kg" && styles.unitBtnTextActive]}>kg</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleWeightUnitChange("lb")}
                style={[styles.unitBtn, weightUnit === "lb" && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, weightUnit === "lb" && styles.unitBtnTextActive]}>lb</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.prefRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.prefLabel}>Incremento de peso global</Text>
              <Text style={styles.prefSub}>Para ejercicios sin incremento propio</Text>
            </View>
            <TextInput
              style={[styles.input, { width: 70, textAlign: "center", marginBottom: 0 }]}
              keyboardType="decimal-pad"
              value={defaultWeightIncrement}
              onChangeText={handleDefaultIncrementChange}
              placeholder="2.5"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.prefRow}>
            <View>
              <Text style={styles.prefLabel}>Inicio de semana en calendario</Text>
              <Text style={styles.prefSub}>Lunes o domingo</Text>
            </View>
            <View style={styles.unitToggle}>
              <TouchableOpacity
                onPress={() => handleCalendarWeekStart(1)}
                style={[styles.unitBtn, calendarWeekStart === 1 && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, calendarWeekStart === 1 && styles.unitBtnTextActive]}>Lu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleCalendarWeekStart(0)}
                style={[styles.unitBtn, calendarWeekStart === 0 && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, calendarWeekStart === 0 && styles.unitBtnTextActive]}>Do</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.prefRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prefLabel}>Auto-pasar a siguiente serie</Text>
              <Text style={styles.prefSub}>Navegar automáticamente al completar</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleAutoSelectNextSet(!autoSelectNextSet)}
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: autoSelectNextSet ? colors.primary : colors.border, justifyContent: "center", paddingHorizontal: 2 }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background, alignSelf: autoSelectNextSet ? "flex-end" : "flex-start", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 }} />
            </TouchableOpacity>
          </View>
          <View style={styles.prefRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.prefLabel}>Descanso por defecto</Text>
              <Text style={styles.prefSub}>Segundos entre series (por defecto)</Text>
            </View>
            <TextInput
              style={[styles.input, { width: 70, textAlign: "center", marginBottom: 0 }]}
              keyboardType="number-pad"
              value={defaultRestSeconds}
              onChangeText={handleDefaultRestSeconds}
              placeholder="90"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        {/* Tools */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Herramientas</Text>
          <TouchableOpacity
            onPress={() => router.push("/calculators")}
            style={[styles.btn, styles.btnOutline]}
          >
            <Ionicons name="calculator-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.btnOutlineText}>Calculadoras de entrenamiento</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Health */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Salud</Text>
          <TouchableOpacity
            onPress={() => router.push("/body-tracker")}
            style={[styles.btn, styles.btnOutline]}
          >
            <Ionicons name="body-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.btnOutlineText}>Medidas corporales</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <TouchableOpacity
            onPress={handleExportCSV}
            disabled={exportLoading}
            style={[styles.btn, styles.btnOutline]}
          >
            {exportLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="download-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.btnOutlineText}>Exportar datos (CSV)</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setImportCSV(""); setShowImportModal(true); }}
            style={[styles.btn, styles.btnOutline]}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.btnOutlineText}>Importar datos (CSV)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSignOut}
            disabled={signOutLoading}
            style={[styles.btn, styles.btnOutline]}
          >
            {signOutLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.btnOutlineText}>Cerrar sesión</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={[styles.sectionTitle, { color: "#ef4444" }]}>Zona de peligro</Text>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Eliminar cuenta",
                "Esto eliminará permanentemente todos tus datos. Esta acción no se puede deshacer.",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Eliminar",
                    style: "destructive",
                    onPress: async () => {
                      const { error } = await supabase.rpc("delete_user");
                      if (error) { Alert.alert("Error", error.message); return; }
                      await supabase.auth.signOut();
                      router.replace("/(auth)/login");
                    },
                  },
                ]
              )
            }
            style={[styles.btn, styles.btnDanger]}
          >
            <Text style={styles.btnDangerText}>Eliminar cuenta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {/* Import CSV modal */}
      <Modal visible={showImportModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowImportModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: "#0f172a" }}>Importar datos CSV</Text>
              <TouchableOpacity onPress={() => setShowImportModal(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 13, color: "#64748b", lineHeight: 18 }}>
                Pega el contenido de un CSV exportado previamente desde FitNotes. Las fechas que ya tengan entrenamiento se omitirán para evitar duplicados.
              </Text>
              <View style={{ backgroundColor: "#f8fafc", borderRadius: 10, padding: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#94a3b8", marginBottom: 4 }}>FORMATO ESPERADO</Text>
                <Text style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                  Date,Exercise,Weight,Reps,...,Completed,Warmup{"\n"}
                  2025-06-25,Press Banca,100,5,...,1,0
                </Text>
              </View>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 14, fontSize: 12, minHeight: 200, textAlignVertical: "top", fontFamily: "monospace", color: "#0f172a" }}
                placeholder="Pega aquí el contenido del CSV…"
                placeholderTextColor="#cbd5e1"
                multiline
                value={importCSV}
                onChangeText={setImportCSV}
              />
              {importCSV.length > 0 && (
                <Text style={{ fontSize: 12, color: "#6366f1" }}>
                  {parseCSVRows(importCSV).length} filas detectadas
                </Text>
              )}
              <TouchableOpacity
                onPress={handleImportCSV}
                disabled={importLoading || importCSV.trim().length === 0}
                style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: importLoading || !importCSV.trim() ? 0.5 : 1 }}
              >
                {importLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Importar</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 60, gap: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  section: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, padding: 18, gap: 10 },
  dangerSection: { borderColor: "#fecaca" },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  emailText: { fontSize: 13, color: "#64748b" },
  label: { fontSize: 12, fontWeight: "500", color: "#64748b" },
  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0f172a" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  btnPrimary: { backgroundColor: "#6366f1" },
  btnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  btnOutline: { borderWidth: 1, borderColor: "#e2e8f0" },
  btnOutlineText: { color: "#64748b", fontSize: 14, fontWeight: "500" },
  btnDanger: { borderWidth: 1, borderColor: "#ef4444" },
  btnDangerText: { color: "#ef4444", fontSize: 14, fontWeight: "500" },
  prefRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  prefLabel: { fontSize: 13, fontWeight: "500", color: "#0f172a" },
  prefSub: { fontSize: 11, color: "#94a3b8", marginTop: 1 },
  unitToggle: { flexDirection: "row", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, overflow: "hidden" },
  unitBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  unitBtnActive: { backgroundColor: "#6366f1" },
  unitBtnText: { fontSize: 13, fontWeight: "500", color: "#64748b" },
  unitBtnTextActive: { color: "#fff" },
});

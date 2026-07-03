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
import { useTheme, useThemeModeStore, type ThemeMode } from "../../lib/theme";
import { createWorkoutRepository, createBackupRepository, createBodyTrackerRepository, isBackupData, type BackupData } from "@fitnotes/database";
import { useRepositories } from "../../contexts/RepositoryContext";
import { useSyncStatus } from "../../contexts/SyncContext";

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
  const { exerciseRepo, isGuest } = useRepositories();
  const { pendingCount } = useSyncStatus();

  /** Backup/CSV/recalcular PRs/restaurar/eliminar historial siguen siendo remote-only (fuera de alcance offline) — requieren cuenta real. */
  function requireAccount(): boolean {
    if (isGuest) {
      Alert.alert("Esta función requiere una cuenta", "Crea una cuenta o inicia sesión para usar backup, restauración o recalcular récords.");
      return false;
    }
    return true;
  }
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [defaultWeightIncrement, setDefaultWeightIncrement] = useState("2.5");
  const [calendarWeekStart, setCalendarWeekStart] = useState<0 | 1>(1);
  const [autoSelectNextSet, setAutoSelectNextSet] = useState(true);
  const [trackPersonalRecords, setTrackPersonalRecords] = useState(true);
  const [markSetsComplete, setMarkSetsComplete] = useState(true);
  const [defaultRestSeconds, setDefaultRestSeconds] = useState("90");
  const [restTimerSoundEnabled, setRestTimerSoundEnabled] = useState(true);
  const [restTimerVolume, setRestTimerVolume] = useState("80");
  const [estimatedRecordsRepLimit, setEstimatedRecordsRepLimit] = useState("");
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCSV, setImportCSV] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const themeMode = useThemeModeStore((s) => s.mode);
  const setThemeMode = useThemeModeStore((s) => s.setMode);
  const [recalcStatus, setRecalcStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [fullBackupLoading, setFullBackupLoading] = useState(false);
  const [bodyExportLoading, setBodyExportLoading] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restorePaste, setRestorePaste] = useState("");
  const [restoreParsed, setRestoreParsed] = useState<BackupData | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [showDeleteHistoryModal, setShowDeleteHistoryModal] = useState(false);
  const [deleteHistoryFrom, setDeleteHistoryFrom] = useState("");
  const [deleteHistoryTo, setDeleteHistoryTo] = useState("");
  const [deleteHistoryExerciseId, setDeleteHistoryExerciseId] = useState<string | null>(null);
  const [deleteHistoryLoading, setDeleteHistoryLoading] = useState(false);
  const [exerciseOptions, setExerciseOptions] = useState<{ id: string; name: string }[]>([]);
  const [showSetCountHome, setShowSetCountHome] = useState(true);
  const [categoryOptions, setCategoryOptions] = useState<{ id: string; name: string; color: string }[]>([]);
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      setEmail(session.user.email ?? "");
      setDisplayName((session.user.user_metadata?.display_name as string | undefined) ?? "");
      setWeightUnit((session.user.user_metadata?.weight_unit as "kg" | "lb" | undefined) ?? "kg");
      setDefaultWeightIncrement(String((session.user.user_metadata?.default_weight_increment as number | undefined) ?? 2.5));
      setCalendarWeekStart((session.user.user_metadata?.calendar_week_start as 0 | 1 | undefined) ?? 1);
      setAutoSelectNextSet((session.user.user_metadata?.auto_select_next_set as boolean | undefined) ?? true);
      setTrackPersonalRecords((session.user.user_metadata?.track_personal_records as boolean | undefined) ?? true);
      setMarkSetsComplete((session.user.user_metadata?.mark_sets_complete as boolean | undefined) ?? true);
      setDefaultRestSeconds(String((session.user.user_metadata?.default_rest_seconds as number | undefined) ?? 90));
      setRestTimerSoundEnabled((session.user.user_metadata?.rest_timer_sound_enabled as boolean | undefined) ?? true);
      setRestTimerVolume(String((session.user.user_metadata?.rest_timer_volume as number | undefined) ?? 80));
      setEstimatedRecordsRepLimit(String((session.user.user_metadata?.estimated_records_rep_limit as number | undefined) ?? ""));
      setShowSetCountHome((session.user.user_metadata?.show_set_count_home as boolean | undefined) ?? true);
      setHiddenCategoryIds((session.user.user_metadata?.hidden_category_ids as string[] | undefined) ?? []);
    });
    supabase.from("exercises").select("id, name").order("name").then(({ data }) => {
      setExerciseOptions(data ?? []);
    });
    exerciseRepo.getCategories().then(({ data }) => {
      setCategoryOptions(data ?? []);
    });
  }, []);

  async function handleShowSetCountHome(val: boolean) {
    setShowSetCountHome(val);
    await supabase.auth.updateUser({ data: { show_set_count_home: val } });
  }

  async function handleToggleCategoryVisible(categoryId: string) {
    const next = hiddenCategoryIds.includes(categoryId)
      ? hiddenCategoryIds.filter((id) => id !== categoryId)
      : [...hiddenCategoryIds, categoryId];
    setHiddenCategoryIds(next);
    await supabase.auth.updateUser({ data: { hidden_category_ids: next } });
  }

  async function handleThemeModeChange(mode: ThemeMode) {
    setThemeMode(mode);
    await supabase.auth.updateUser({ data: { theme_preference: mode } });
  }

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

  async function handleTrackPersonalRecords(val: boolean) {
    setTrackPersonalRecords(val);
    await supabase.auth.updateUser({ data: { track_personal_records: val } });
  }

  async function handleMarkSetsComplete(val: boolean) {
    setMarkSetsComplete(val);
    await supabase.auth.updateUser({ data: { mark_sets_complete: val } });
  }

  async function handleDefaultRestSeconds(val: string) {
    setDefaultRestSeconds(val);
    const parsed = parseInt(val);
    if (!isNaN(parsed) && parsed > 0) {
      await supabase.auth.updateUser({ data: { default_rest_seconds: parsed } });
    }
  }

  async function handleRestTimerSoundEnabled(val: boolean) {
    setRestTimerSoundEnabled(val);
    await supabase.auth.updateUser({ data: { rest_timer_sound_enabled: val } });
  }

  async function handleRestTimerVolume(val: string) {
    setRestTimerVolume(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      await supabase.auth.updateUser({ data: { rest_timer_volume: parsed } });
    }
  }

  async function handleEstimatedRecordsRepLimit(val: string) {
    setEstimatedRecordsRepLimit(val);
    const parsed = parseInt(val);
    await supabase.auth.updateUser({ data: { estimated_records_rep_limit: !isNaN(parsed) && parsed > 0 ? parsed : null } });
  }

  async function handleExportCSV() {
    if (!requireAccount()) return;
    setExportLoading(true);
    const repo = createWorkoutRepository(supabase);
    const csv = await repo.exportAllCSV();
    setExportLoading(false);
    if (!csv) { Alert.alert("Sin datos", "No hay entrenamientos que exportar."); return; }
    await Share.share({ message: csv, title: "FitNotes Export" });
  }

  async function handleImportCSV() {
    if (!requireAccount()) return;
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

  async function handleRecalcPRs() {
    if (!requireAccount()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setRecalcStatus("running");
    try {
      const repo = createBackupRepository(supabase);
      await repo.recalculatePersonalRecords(session.user.id);
      setRecalcStatus("done");
    } catch {
      setRecalcStatus("error");
    } finally {
      setTimeout(() => setRecalcStatus("idle"), 3000);
    }
  }

  async function handleFullBackup() {
    if (!requireAccount()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setFullBackupLoading(true);
    try {
      const repo = createBackupRepository(supabase);
      const backup = await repo.exportBackup(session.user.id);
      await Share.share({
        message: JSON.stringify(backup),
        title: `fitnotes-backup-${backup.exported_at.split("T")[0]}.fitnotes`,
      });
    } finally {
      setFullBackupLoading(false);
    }
  }

  function handleRestorePasteChange(text: string) {
    setRestorePaste(text);
    if (!text.trim()) { setRestoreParsed(null); return; }
    try {
      const parsed = JSON.parse(text);
      setRestoreParsed(isBackupData(parsed) ? parsed : null);
    } catch {
      setRestoreParsed(null);
    }
  }

  async function handleExecuteRestore() {
    if (!restoreParsed) return;
    if (!requireAccount()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setRestoreLoading(true);
    try {
      const repo = createBackupRepository(supabase);
      await repo.restoreBackup(session.user.id, restoreParsed);
      setShowRestoreModal(false);
      setRestorePaste("");
      setRestoreParsed(null);
      Alert.alert("Restauración completada", "Todos los datos se han restaurado correctamente.");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Error desconocido durante la restauración.");
    } finally {
      setRestoreLoading(false);
    }
  }

  async function handleExportBodyTrackerCSV() {
    if (!requireAccount()) return;
    setBodyExportLoading(true);
    try {
      const repo = createBodyTrackerRepository(supabase);
      const csv = await repo.exportAllCSV();
      if (!csv) { Alert.alert("Sin datos", "No hay medidas corporales que exportar."); return; }
      await Share.share({ message: csv, title: "FitNotes Body Tracker Export" });
    } finally {
      setBodyExportLoading(false);
    }
  }

  async function handleDeleteHistory() {
    if (!requireAccount()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setDeleteHistoryLoading(true);
    try {
      const repo = createWorkoutRepository(supabase);
      const count = await repo.deleteWorkoutHistory(session.user.id, {
        dateFrom: deleteHistoryFrom.trim() || undefined,
        dateTo: deleteHistoryTo.trim() || undefined,
        exerciseId: deleteHistoryExerciseId ?? undefined,
      });
      setShowDeleteHistoryModal(false);
      setDeleteHistoryFrom("");
      setDeleteHistoryTo("");
      setDeleteHistoryExerciseId(null);
      Alert.alert("Historial eliminado", `${count} elemento(s) eliminado(s).`);
    } finally {
      setDeleteHistoryLoading(false);
    }
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
    const message =
      pendingCount > 0
        ? `Tienes ${pendingCount} cambio(s) sin sincronizar. Se perderán al cerrar sesión — ¿seguro que quieres continuar?`
        : "¿Estás seguro de que quieres cerrar sesión?";
    Alert.alert("Cerrar sesión", message, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          setSignOutLoading(true);
          // La DB local se vacía centralmente en _layout.tsx al reaccionar al
          // evento SIGNED_OUT, que también navega de vuelta a (tabs) como
          // nuevo invitado — aquí solo hace falta disparar el sign-out.
          await supabase.auth.signOut();
          setSignOutLoading(false);
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
          {isGuest ? (
            <>
              <Text style={styles.emailText}>Sin cuenta — tus datos están solo en este dispositivo.</Text>
              <TouchableOpacity
                onPress={() => router.push("/(auth)/register")}
                style={[styles.btn, styles.btnOutline]}
              >
                <Ionicons name="person-add-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.btnOutlineText}>Crear cuenta</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/(auth)/login")}
                style={[styles.btn, styles.btnOutline]}
              >
                <Ionicons name="log-in-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.btnOutlineText}>Iniciar sesión para sincronizar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
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
            </>
          )}
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
                accessibilityLabel="Usar kilogramos"
                accessibilityRole="radio"
                accessibilityState={{ selected: weightUnit === "kg" }}
                style={[styles.unitBtn, weightUnit === "kg" && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, weightUnit === "kg" && styles.unitBtnTextActive]}>kg</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleWeightUnitChange("lb")}
                accessibilityLabel="Usar libras"
                accessibilityRole="radio"
                accessibilityState={{ selected: weightUnit === "lb" }}
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
                accessibilityLabel="Empezar semana el lunes"
                accessibilityRole="radio"
                accessibilityState={{ selected: calendarWeekStart === 1 }}
                style={[styles.unitBtn, calendarWeekStart === 1 && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, calendarWeekStart === 1 && styles.unitBtnTextActive]}>Lu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleCalendarWeekStart(0)}
                accessibilityLabel="Empezar semana el domingo"
                accessibilityRole="radio"
                accessibilityState={{ selected: calendarWeekStart === 0 }}
                style={[styles.unitBtn, calendarWeekStart === 0 && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, calendarWeekStart === 0 && styles.unitBtnTextActive]}>Do</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.prefRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prefLabel}>Registrar récords personales</Text>
              <Text style={styles.prefSub}>Muestra el badge PR al igualar o superar un récord</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleTrackPersonalRecords(!trackPersonalRecords)}
              testID="toggle-track-personal-records"
              accessibilityRole="switch"
              accessibilityLabel="Registrar récords personales"
              accessibilityState={{ checked: trackPersonalRecords }}
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: trackPersonalRecords ? colors.primary : colors.border, justifyContent: "center", paddingHorizontal: 2 }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background, alignSelf: trackPersonalRecords ? "flex-end" : "flex-start", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 }} />
            </TouchableOpacity>
          </View>
          <View style={styles.prefRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prefLabel}>Marcar series como completadas</Text>
              <Text style={styles.prefSub}>Muestra el checkbox de completado en cada serie</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleMarkSetsComplete(!markSetsComplete)}
              accessibilityRole="switch"
              accessibilityLabel="Marcar series como completadas"
              accessibilityState={{ checked: markSetsComplete }}
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: markSetsComplete ? colors.primary : colors.border, justifyContent: "center", paddingHorizontal: 2 }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background, alignSelf: markSetsComplete ? "flex-end" : "flex-start", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 }} />
            </TouchableOpacity>
          </View>
          <View style={styles.prefRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prefLabel}>Auto-pasar a siguiente serie</Text>
              <Text style={styles.prefSub}>Navegar automáticamente al completar</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleAutoSelectNextSet(!autoSelectNextSet)}
              accessibilityRole="switch"
              accessibilityLabel="Auto-pasar a siguiente serie"
              accessibilityState={{ checked: autoSelectNextSet }}
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
          <View style={styles.prefRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prefLabel}>Sonido del rest timer</Text>
              <Text style={styles.prefSub}>Reproduce un aviso sonoro al terminar el descanso</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleRestTimerSoundEnabled(!restTimerSoundEnabled)}
              accessibilityRole="switch"
              accessibilityLabel="Sonido del rest timer"
              accessibilityState={{ checked: restTimerSoundEnabled }}
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: restTimerSoundEnabled ? colors.primary : colors.border, justifyContent: "center", paddingHorizontal: 2 }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background, alignSelf: restTimerSoundEnabled ? "flex-end" : "flex-start", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 }} />
            </TouchableOpacity>
          </View>
          {restTimerSoundEnabled && (
            <View style={styles.prefRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.prefLabel}>Volumen del rest timer</Text>
                <Text style={styles.prefSub}>0-100</Text>
              </View>
              <TextInput
                style={[styles.input, { width: 70, textAlign: "center", marginBottom: 0 }]}
                keyboardType="number-pad"
                value={restTimerVolume}
                onChangeText={handleRestTimerVolume}
                placeholder="80"
                placeholderTextColor="#94a3b8"
              />
            </View>
          )}
          <View style={styles.prefRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.prefLabel}>Límite de reps para récords estimados</Text>
              <Text style={styles.prefSub}>Excluye series de muchas reps del 1RM estimado (recomendado: 10-12)</Text>
            </View>
            <TextInput
              style={[styles.input, { width: 70, textAlign: "center", marginBottom: 0 }]}
              keyboardType="number-pad"
              value={estimatedRecordsRepLimit}
              onChangeText={handleEstimatedRecordsRepLimit}
              placeholder="Sin límite"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Apariencia</Text>
          <View style={styles.prefRow}>
            <View>
              <Text style={styles.prefLabel}>Tema</Text>
              <Text style={styles.prefSub}>Claro, oscuro o según el sistema</Text>
            </View>
            <View style={styles.unitToggle}>
              {(["light", "dark", "system"] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => handleThemeModeChange(m)}
                  accessibilityLabel={m === "light" ? "Tema claro" : m === "dark" ? "Tema oscuro" : "Tema del sistema"}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: themeMode === m }}
                  style={[styles.unitBtn, themeMode === m && styles.unitBtnActive]}
                >
                  <Text style={[styles.unitBtnText, themeMode === m && styles.unitBtnTextActive]}>
                    {m === "light" ? "Claro" : m === "dark" ? "Oscuro" : "Sistema"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Home screen */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pantalla de inicio</Text>
          <View style={styles.prefRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prefLabel}>Mostrar contador de series</Text>
              <Text style={styles.prefSub}>Series completadas/totales en cada ejercicio de Inicio</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleShowSetCountHome(!showSetCountHome)}
              accessibilityRole="switch"
              accessibilityLabel="Mostrar contador de series"
              accessibilityState={{ checked: showSetCountHome }}
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: showSetCountHome ? colors.primary : colors.border, justifyContent: "center", paddingHorizontal: 2 }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background, alignSelf: showSetCountHome ? "flex-end" : "flex-start", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 }} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.prefLabel, { marginTop: 4 }]}>Categorías visibles</Text>
          <Text style={styles.prefSub}>Las desmarcadas se ocultan al añadir ejercicios desde Inicio</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {categoryOptions.map((cat) => {
              const visible = !hiddenCategoryIds.includes(cat.id);
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => handleToggleCategoryVisible(cat.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: visible }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, opacity: visible ? 1 : 0.4 }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
                  <Text style={{ fontSize: 12, fontWeight: "500", color: colors.text }}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Data / Backup */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos</Text>
          <TouchableOpacity onPress={handleRecalcPRs} disabled={recalcStatus === "running"} style={[styles.btn, styles.btnOutline]}>
            {recalcStatus === "running" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="trophy-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.btnOutlineText}>
                  {recalcStatus === "done" ? "¡PRs recalculados!" : recalcStatus === "error" ? "Error — reintentar" : "Recalcular récords personales"}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleFullBackup} disabled={fullBackupLoading} style={[styles.btn, styles.btnOutline]}>
            {fullBackupLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.btnOutlineText}>Copia de seguridad completa (.fitnotes)</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { if (!requireAccount()) return; setRestorePaste(""); setRestoreParsed(null); setShowRestoreModal(true); }} style={[styles.btn, styles.btnOutline]}>
            <Ionicons name="cloud-upload-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.btnOutlineText}>Restaurar copia de seguridad</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleExportBodyTrackerCSV} disabled={bodyExportLoading} style={[styles.btn, styles.btnOutline]}>
            {bodyExportLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="body-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.btnOutlineText}>Exportar medidas corporales (CSV)</Text>
              </>
            )}
          </TouchableOpacity>
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
            onPress={() => { if (!requireAccount()) return; setImportCSV(""); setShowImportModal(true); }}
            style={[styles.btn, styles.btnOutline]}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.btnOutlineText}>Importar datos (CSV)</Text>
          </TouchableOpacity>
          {!isGuest && (
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
          )}
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={[styles.sectionTitle, { color: "#ef4444" }]}>Zona de peligro</Text>
          <TouchableOpacity
            onPress={() => { if (!requireAccount()) return; setDeleteHistoryFrom(""); setDeleteHistoryTo(""); setDeleteHistoryExerciseId(null); setShowDeleteHistoryModal(true); }}
            style={[styles.btn, styles.btnDanger]}
          >
            <Text style={styles.btnDangerText}>Eliminar historial de entrenamientos</Text>
          </TouchableOpacity>
          {!isGuest && (
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
                        // Igual que en handleSignOut, _layout.tsx vacía la DB
                        // local y navega de vuelta a (tabs) como nuevo invitado.
                        await supabase.auth.signOut();
                      },
                    },
                  ]
                )
              }
              style={[styles.btn, styles.btnDanger]}
            >
              <Text style={styles.btnDangerText}>Eliminar cuenta</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      {/* Import CSV modal */}
      <Modal visible={showImportModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowImportModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: "#0f172a" }}>Importar datos CSV</Text>
              <TouchableOpacity onPress={() => setShowImportModal(false)} accessibilityLabel="Cerrar modal">
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
      {/* Restore backup modal */}
      <Modal visible={showRestoreModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowRestoreModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: "#0f172a" }}>Restaurar copia de seguridad</Text>
              <TouchableOpacity onPress={() => setShowRestoreModal(false)} accessibilityLabel="Cerrar modal">
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 13, color: "#64748b", lineHeight: 18 }}>
                Pega el contenido de un archivo .fitnotes exportado previamente. Esto reemplazará TODOS tus datos actuales.
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 14, fontSize: 11, minHeight: 200, textAlignVertical: "top", fontFamily: "monospace", color: "#0f172a" }}
                placeholder="Pega aquí el contenido del archivo .fitnotes…"
                placeholderTextColor="#cbd5e1"
                multiline
                value={restorePaste}
                onChangeText={handleRestorePasteChange}
              />
              {restorePaste.length > 0 && !restoreParsed && (
                <Text style={{ fontSize: 12, color: "#ef4444" }}>Archivo inválido o formato no reconocido.</Text>
              )}
              {restoreParsed && (
                <Text style={{ fontSize: 12, color: "#6366f1" }}>
                  Backup válido — {restoreParsed.workouts.length} entrenamientos, {restoreParsed.sets.length} series, {restoreParsed.exercises.length} ejercicios.
                </Text>
              )}
              <TouchableOpacity
                onPress={handleExecuteRestore}
                disabled={restoreLoading || !restoreParsed}
                style={{ backgroundColor: "#ef4444", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: restoreLoading || !restoreParsed ? 0.5 : 1 }}
              >
                {restoreLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Restaurar y reemplazar datos</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      {/* Delete workout history modal */}
      <Modal visible={showDeleteHistoryModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDeleteHistoryModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: "#0f172a" }}>Eliminar historial de entrenamientos</Text>
            <TouchableOpacity onPress={() => setShowDeleteHistoryModal(false)} accessibilityLabel="Cerrar modal">
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <Text style={{ fontSize: 13, color: "#64748b", lineHeight: 18 }}>
              Deja los filtros vacíos para eliminar todo el historial, o acótalo por fecha y/o ejercicio. Esta acción no se puede deshacer.
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Desde</Text>
                <TextInput style={styles.input} value={deleteHistoryFrom} onChangeText={setDeleteHistoryFrom} placeholder="AAAA-MM-DD" placeholderTextColor="#94a3b8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Hasta</Text>
                <TextInput style={styles.input} value={deleteHistoryTo} onChangeText={setDeleteHistoryTo} placeholder="AAAA-MM-DD" placeholderTextColor="#94a3b8" />
              </View>
            </View>
            <View>
              <Text style={styles.label}>Ejercicio (opcional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
                <TouchableOpacity
                  onPress={() => setDeleteHistoryExerciseId(null)}
                  style={[styles.unitBtn, { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8 }, deleteHistoryExerciseId === null && styles.unitBtnActive]}
                >
                  <Text style={[styles.unitBtnText, deleteHistoryExerciseId === null && styles.unitBtnTextActive]}>Todos</Text>
                </TouchableOpacity>
                {exerciseOptions.map((ex) => (
                  <TouchableOpacity
                    key={ex.id}
                    onPress={() => setDeleteHistoryExerciseId(ex.id)}
                    style={[styles.unitBtn, { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8 }, deleteHistoryExerciseId === ex.id && styles.unitBtnActive]}
                  >
                    <Text style={[styles.unitBtnText, deleteHistoryExerciseId === ex.id && styles.unitBtnTextActive]}>{ex.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  "Eliminar historial",
                  "¿Seguro que quieres eliminar el historial seleccionado? No se puede deshacer.",
                  [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Eliminar", style: "destructive", onPress: handleDeleteHistory },
                  ]
                )
              }
              disabled={deleteHistoryLoading}
              style={{ backgroundColor: "#ef4444", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: deleteHistoryLoading ? 0.5 : 1 }}
            >
              {deleteHistoryLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Eliminar historial</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
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

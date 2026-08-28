import { useEffect, useState } from "react";
import {
  Modal, KeyboardAvoidingView, SafeAreaView, ScrollView, Text, View,
  TouchableOpacity, TextInput, Platform, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ExerciseType, type Category, type Exercise } from "@fitnotes/core";

const WEIGHT_TYPES = [ExerciseType.WEIGHT_REPS, ExerciseType.WEIGHT_ONLY, ExerciseType.WEIGHT_DISTANCE, ExerciseType.WEIGHT_TIME];

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export interface ExerciseFormPatch {
  name: string;
  notes: string | null;
  demo_url: string | null;
  category_id: string;
  type: ExerciseType;
  weight_unit: "kg" | "lb";
  weight_increment: number;
  default_rest_seconds: number;
  default_chart: "weight" | "volume" | "reps";
}

interface ExerciseFormModalProps {
  visible: boolean;
  /** `null` = modo creación; un `Exercise` = modo edición, precarga el formulario con sus valores. */
  editingExercise: Exercise | null;
  categories: Category[];
  /** Categoría preseleccionada al crear (p.ej. la categoría actual al entrar desde su pantalla). */
  defaultCategoryId?: string;
  onClose: () => void;
  onCreateCategory: (name: string, color: string) => Promise<Category | null>;
  /** Persiste el formulario (crear o actualizar según `editingExercise`). Devuelve un mensaje de error para mostrarlo, o nada si fue bien. */
  onSubmit: (patch: ExerciseFormPatch, opts: { convertFactor?: number }) => Promise<string | void>;
}

/**
 * Modal único de creación/edición de ejercicio, compartido por la pestaña Ejercicios
 * (búsqueda global) y la pantalla de categoría — antes eran dos formularios
 * mantenidos por separado que habían divergido en qué campos soportaban
 * (p.ej. `demo_url` solo existía en uno de los dos).
 */
export default function ExerciseFormModal({
  visible, editingExercise, categories, defaultCategoryId, onClose, onCreateCategory, onSubmit,
}: ExerciseFormModalProps) {
  const { t } = useTranslation();

  const TYPE_OPTIONS: { value: ExerciseType; label: string }[] = [
    { value: ExerciseType.WEIGHT_REPS, label: t("exercises:types.WEIGHT_REPS") },
    { value: ExerciseType.REPS_ONLY, label: t("exercises:types.REPS_ONLY") },
    { value: ExerciseType.WEIGHT_ONLY, label: t("exercises:types.WEIGHT_ONLY") },
    { value: ExerciseType.DISTANCE_TIME, label: t("exercises:types.DISTANCE_TIME") },
    { value: ExerciseType.TIME_ONLY, label: t("exercises:types.TIME_ONLY") },
    { value: ExerciseType.WEIGHT_DISTANCE, label: t("exercises:types.WEIGHT_DISTANCE") },
    { value: ExerciseType.WEIGHT_TIME, label: t("exercises:types.WEIGHT_TIME") },
    { value: ExerciseType.REPS_DISTANCE, label: t("exercises:types.REPS_DISTANCE") },
    { value: ExerciseType.REPS_TIME, label: t("exercises:types.REPS_TIME") },
    { value: ExerciseType.DISTANCE_ONLY, label: t("exercises:types.DISTANCE_ONLY") },
  ];

  const [exName, setExName] = useState("");
  const [exNotes, setExNotes] = useState("");
  const [exDemoUrl, setExDemoUrl] = useState("");
  const [exCategoryId, setExCategoryId] = useState("");
  const [exType, setExType] = useState<ExerciseType>(ExerciseType.WEIGHT_REPS);
  const [exWeightUnit, setExWeightUnit] = useState<"kg" | "lb">("kg");
  const [exWeightIncrement, setExWeightIncrement] = useState("2.5");
  const [exDefaultRest, setExDefaultRest] = useState("90");
  const [exDefaultChart, setExDefaultChart] = useState<"weight" | "volume" | "reps">("weight");
  const [saving, setSaving] = useState(false);

  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]!);
  const [catSaving, setCatSaving] = useState(false);

  // Repuebla el formulario cada vez que el modal se abre, desde `editingExercise` (editar) o valores por defecto (crear).
  useEffect(() => {
    if (!visible) return;
    if (editingExercise) {
      setExName(editingExercise.name);
      setExNotes(editingExercise.notes ?? "");
      setExDemoUrl(editingExercise.demo_url ?? "");
      setExCategoryId(editingExercise.category_id);
      setExType(editingExercise.type);
      setExWeightUnit(editingExercise.weight_unit ?? "kg");
      setExWeightIncrement(String(editingExercise.weight_increment ?? 2.5));
      setExDefaultRest(String(editingExercise.default_rest_seconds ?? 90));
      setExDefaultChart((editingExercise.default_chart ?? "weight") as "weight" | "volume" | "reps");
    } else {
      setExName("");
      setExNotes("");
      setExDemoUrl("");
      setExCategoryId(defaultCategoryId ?? categories[0]?.id ?? "");
      setExType(ExerciseType.WEIGHT_REPS);
      setExWeightUnit("kg");
      setExWeightIncrement("2.5");
      setExDefaultRest("90");
      setExDefaultChart("weight");
    }
    setShowNewCat(false);
    setNewCatName("");
    setNewCatColor(PRESET_COLORS[0]!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingExercise]);

  /** Crea la categoría nueva del formulario inline vía `onCreateCategory` y la deja seleccionada. */
  async function handleCreateCategory() {
    if (!newCatName.trim()) return;
    setCatSaving(true);
    const cat = await onCreateCategory(newCatName.trim(), newCatColor);
    setCatSaving(false);
    if (!cat) return;
    setExCategoryId(cat.id);
    setShowNewCat(false);
    setNewCatName("");
    setNewCatColor(PRESET_COLORS[0]!);
  }

  /** Arma el patch desde el estado del formulario y lo delega en `onSubmit`; cierra el modal si no hay error. */
  async function doSave(convertFactor?: number) {
    setSaving(true);
    const patch: ExerciseFormPatch = {
      name: exName.trim(),
      notes: exNotes.trim() || null,
      demo_url: exDemoUrl.trim() || null,
      category_id: exCategoryId,
      type: exType,
      weight_unit: WEIGHT_TYPES.includes(exType) ? exWeightUnit : "kg",
      weight_increment: parseFloat(exWeightIncrement) || 2.5,
      default_rest_seconds: parseInt(exDefaultRest, 10) || 90,
      default_chart: exDefaultChart,
    };
    const errorMessage = await onSubmit(patch, { convertFactor });
    setSaving(false);
    if (errorMessage) { Alert.alert("Error", errorMessage); return; }
    onClose();
  }

  /**
   * Valida el formulario y, si el tipo o la unidad de peso cambiaron respecto al
   * ejercicio original (solo en modo edición), pide confirmación antes de guardar:
   * cambiar de tipo advierte de que se perderán los campos que no existan en el
   * nuevo tipo, y cambiar de unidad ofrece elegir entre "solo etiqueta" o
   * "convertir" los valores históricos (factor kg↔lb) vía `doSave(convertFactor)`.
   */
  function handleSave() {
    if (!exName.trim()) { Alert.alert("Error", t("exercises:nameRequired")); return; }
    if (!exCategoryId) { Alert.alert("Error", t("exercises:categoryRequired")); return; }
    if (exDemoUrl.trim() && !isValidUrl(exDemoUrl.trim())) { Alert.alert("Error", t("exercises:demoUrlInvalid")); return; }

    const typeChanged = editingExercise != null && exType !== editingExercise.type;
    const isWeightType = WEIGHT_TYPES.includes(exType);
    const unitChanged = editingExercise != null && isWeightType && exWeightUnit !== (editingExercise.weight_unit ?? "kg");
    const convFactor = editingExercise
      ? ((editingExercise.weight_unit ?? "kg") === "kg" ? 2.20462 : 0.453592)
      : undefined;

    function showUnitAlert(onConfirm: () => void, onConfirmConvert: () => void) {
      Alert.alert(
        t("exercises:changeWeightUnitTitleMobile"),
        t("exercises:changeWeightUnitMessageMobile", { unit: exWeightUnit }),
        [
          { text: t("common:cancel"), style: "cancel" },
          { text: t("exercises:changeWeightUnitLabelOnlyMobile"), onPress: onConfirm },
          { text: t("exercises:changeWeightUnitConvertMobile"), onPress: onConfirmConvert },
        ]
      );
    }

    if (typeChanged) {
      Alert.alert(
        t("exercises:changeTypeTitleMobile"),
        t("exercises:changeTypeMessageMobile"),
        [
          { text: t("common:cancel"), style: "cancel" },
          {
            text: t("exercises:changeTypeConfirmMobile"), style: "destructive", onPress: () => {
              if (unitChanged) showUnitAlert(() => doSave(), () => doSave(convFactor));
              else doSave();
            },
          },
        ]
      );
      return;
    }

    if (unitChanged) {
      showUnitAlert(() => doSave(), () => doSave(convFactor));
      return;
    }

    doSave();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>
              {editingExercise ? t("exercises:editExerciseHeading") : t("exercises:newExerciseHeading")}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel={t("exercises:closeModalLabel")}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>{t("exercises:nameLabel")}</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
                placeholder={t("exercises:namePlaceholderExercise")}
                value={exName}
                onChangeText={setExName}
                autoFocus={!editingExercise}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>{t("exercises:notesLabel")}</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top" }}
                placeholder={t("exercises:notesPlaceholderMobile")}
                value={exNotes}
                onChangeText={setExNotes}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>
                {t("exercises:demoUrlLabel")} <Text style={{ fontWeight: "400", color: "#94a3b8" }}>{t("exercises:demoUrlOptionalSuffix")}</Text>
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
                placeholder={t("exercises:demoUrlPlaceholder")}
                value={exDemoUrl}
                onChangeText={setExDemoUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>{t("exercises:categoryLabel")}</Text>
              {categories.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => { setExCategoryId(cat.id); setShowNewCat(false); }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, borderWidth: 2, borderColor: exCategoryId === cat.id ? cat.color : "#e2e8f0", backgroundColor: exCategoryId === cat.id ? cat.color + "18" : "transparent", paddingHorizontal: 14, paddingVertical: 7 }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
                      <Text style={{ fontSize: 13, fontWeight: "500", color: "#0f172a" }}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity
                onPress={() => setShowNewCat((v) => !v)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
              >
                <Ionicons name={showNewCat ? "close" : "add"} size={16} color="#6366f1" />
                <Text style={{ fontSize: 13, fontWeight: "500", color: "#6366f1" }}>
                  {showNewCat ? t("common:cancel") : t("exercises:newCategoryHeading")}
                </Text>
              </TouchableOpacity>
              {showNewCat && (
                <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 14, gap: 12, backgroundColor: "#f8fafc" }}>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff" }}
                    placeholder={t("exercises:newCategoryNamePlaceholder")}
                    value={newCatName}
                    onChangeText={setNewCatName}
                  />
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {PRESET_COLORS.map((c) => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setNewCatColor(c)}
                        style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 2.5, borderColor: newCatColor === c ? "#0f172a" : "transparent" }}
                      />
                    ))}
                  </View>
                  <TouchableOpacity
                    onPress={handleCreateCategory}
                    disabled={catSaving || !newCatName.trim()}
                    style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingVertical: 10, alignItems: "center", opacity: catSaving || !newCatName.trim() ? 0.5 : 1 }}
                  >
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                      {catSaving ? t("exercises:creatingButton") : t("exercises:createCategoryButton")}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>{t("exercises:typeLabel")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {TYPE_OPTIONS.map(({ value, label }) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setExType(value)}
                    style={{ borderRadius: 10, borderWidth: 1.5, borderColor: exType === value ? "#6366f1" : "#e2e8f0", backgroundColor: exType === value ? "#6366f1" : "transparent", paddingHorizontal: 14, paddingVertical: 8 }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "500", color: exType === value ? "#fff" : "#374151" }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {WEIGHT_TYPES.includes(exType) && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>{t("exercises:weightUnitFieldLabel")}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["kg", "lb"] as const).map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      onPress={() => setExWeightUnit(unit)}
                      style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: exWeightUnit === unit ? "#6366f1" : "#e2e8f0", backgroundColor: exWeightUnit === unit ? "#6366f1" : "transparent", paddingVertical: 10, alignItems: "center" }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: exWeightUnit === unit ? "#fff" : "#374151" }}>{unit}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {WEIGHT_TYPES.includes(exType) && (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>{t("exercises:weightIncrementFieldLabelMobile")}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                    <TextInput
                      style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlign: "center" }}
                      keyboardType="decimal-pad"
                      value={exWeightIncrement}
                      onChangeText={setExWeightIncrement}
                      placeholder="2.5"
                    />
                    <Text style={{ paddingRight: 10, fontSize: 13, color: "#94a3b8" }}>{exWeightUnit}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>{t("exercises:restSecondsFieldLabelMobile")}</Text>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlign: "center" }}
                    keyboardType="number-pad"
                    value={exDefaultRest}
                    onChangeText={setExDefaultRest}
                    placeholder="90"
                  />
                </View>
              </View>
            )}

            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>{t("exercises:defaultChartFieldLabelMobile")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([["weight", t("exercises:chartOptionWeightMobile")], ["volume", t("exercises:chartOptionVolumeMobile")], ["reps", t("exercises:chartOptionRepsMobile")]] as ["weight" | "volume" | "reps", string][]).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setExDefaultChart(key)}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: exDefaultChart === key ? "#6366f1" : "#e2e8f0", backgroundColor: exDefaultChart === key ? "#6366f1" : "transparent", alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "600", color: exDefaultChart === key ? "#fff" : "#64748b" }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ marginTop: 4, gap: 8 }}>
              <TouchableOpacity
                onPress={() => handleSave()}
                disabled={saving}
                style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: saving ? 0.6 : 1 }}
              >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                  {saving
                    ? (editingExercise ? t("exercises:savingButton") : t("exercises:creatingButton"))
                    : (editingExercise ? t("exercises:saveChangesButton") : t("exercises:createExerciseButtonMobile"))}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

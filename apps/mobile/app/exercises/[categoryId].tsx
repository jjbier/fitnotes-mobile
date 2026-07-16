import { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView, ScrollView, Text, View, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useExerciseStore, useWorkoutStore, filterExercises, ExerciseType, formatLastUsedLabel } from "@fitnotes/core";
import { createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import type { Exercise } from "@fitnotes/core";
import { useTheme } from "../../lib/theme";
import { useRepositories } from "../../contexts/RepositoryContext";

const TYPE_OPTIONS: { value: ExerciseType; label: string }[] = [
  { value: ExerciseType.WEIGHT_REPS, label: "Peso × Reps" },
  { value: ExerciseType.REPS_ONLY, label: "Solo reps" },
  { value: ExerciseType.WEIGHT_ONLY, label: "Solo peso" },
  { value: ExerciseType.DISTANCE_TIME, label: "Distancia / Tiempo" },
  { value: ExerciseType.TIME_ONLY, label: "Solo tiempo" },
  { value: ExerciseType.WEIGHT_DISTANCE, label: "Peso + Distancia" },
  { value: ExerciseType.WEIGHT_TIME, label: "Peso + Tiempo" },
  { value: ExerciseType.REPS_DISTANCE, label: "Reps + Distancia" },
  { value: ExerciseType.REPS_TIME, label: "Reps + Tiempo" },
  { value: ExerciseType.DISTANCE_ONLY, label: "Solo distancia" },
];

const WEIGHT_TYPES = [
  ExerciseType.WEIGHT_REPS,
  ExerciseType.WEIGHT_ONLY,
  ExerciseType.WEIGHT_DISTANCE,
  ExerciseType.WEIGHT_TIME,
];

/**
 * Pantalla de ejercicios de una categoría (o de favoritos, cuando `categoryId === "favorites"`):
 * lista, busca, crea, edita (incluida gestión de cambio de tipo y de unidad de peso con
 * conversión histórica opcional), elimina y marca como favorito. Al tocar un ejercicio,
 * navega a añadirlo al entrenamiento activo si hay uno en curso, o a su historial en caso
 * contrario. CRUD vía `useRepositories()` (local); las estadísticas por ejercicio
 * (sesiones/última vez) y la conversión de pesos históricos usan un repo remoto ad-hoc
 * (`createExerciseRepository(supabase)`) por quedar fuera del alcance offline.
 */
export default function ExerciseCategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const theme = useTheme();

  const categories = useExerciseStore((s) => s.categories);
  const exercises = useExerciseStore((s) => s.exercises);
  const isLoading = useExerciseStore((s) => s.isLoading);
  const loadExercises = useExerciseStore((s) => s.loadExercises);
  const addExercise = useExerciseStore((s) => s.addExercise);
  const updateExercise = useExerciseStore((s) => s.updateExercise);
  const deleteExercise = useExerciseStore((s) => s.deleteExercise);
  const toggleFavorite = useExerciseStore((s) => s.toggleFavorite);
  const setLoading = useExerciseStore((s) => s.setLoading);
  const activeWorkoutId = useWorkoutStore((s) => s.activeWorkout?.id);

  const [search, setSearch] = useState("");
  const [exerciseStats, setExerciseStats] = useState<Record<string, { workout_count: number; last_used: string | null }>>({});

  // Create modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newType, setNewType] = useState<ExerciseType>(ExerciseType.WEIGHT_REPS);
  const [newWeightUnit, setNewWeightUnit] = useState<"kg" | "lb">("kg");
  const [addSaving, setAddSaving] = useState(false);

  // Edit modal
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [exName, setExName] = useState("");
  const [exNotes, setExNotes] = useState("");
  const [exType, setExType] = useState<ExerciseType>(ExerciseType.WEIGHT_REPS);
  const [exWeightUnit, setExWeightUnit] = useState<"kg" | "lb">("kg");
  const [editSaving, setEditSaving] = useState(false);

  const { exerciseRepo: repo, userId } = useRepositories();
  const remoteExerciseRepo = useMemo(() => createExerciseRepository(supabase), []);
  const isFavorites = categoryId === "favorites";
  const category = categories.find((c) => c.id === categoryId);

  useEffect(() => {
    if (category) navigation.setOptions({ headerTitle: category.name });
    else if (isFavorites) navigation.setOptions({ headerTitle: "Favoritos" });
  }, [category, isFavorites, navigation]);

  useEffect(() => {
    async function load() {
      // If store already has data, just load stats
      if (exercises.length > 0) {
        const statsRes = await remoteExerciseRepo.getExerciseStats();
        if (statsRes.data) setExerciseStats(statsRes.data);
        return;
      }
      setLoading(true);
      const [catRes, exRes, statsRes] = await Promise.all([
        repo.getCategories(),
        repo.getExercises(),
        remoteExerciseRepo.getExerciseStats(),
      ]);
      if (catRes.data && exRes.data) {
        loadExercises(
          catRes.data,
          exRes.data.map((ex) => ({
            id: ex.id,
            name: ex.name,
            category_id: ex.category_id ?? "",
            type: ex.type as ExerciseType,
            weight_unit: (ex.weight_unit as "kg" | "lb"),
            notes: ex.notes ?? undefined,
            is_favorite: ex.is_favorite,
            created_at: ex.created_at,
          }))
        );
      }
      if (statsRes.data) setExerciseStats(statsRes.data);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  const categoryExercises = isFavorites
    ? exercises.filter((e) => e.is_favorite)
    : exercises.filter((e) => e.category_id === categoryId);

  const filtered = filterExercises(categoryExercises, search);
  const sorted = [
    ...filtered.filter((e) => e.is_favorite),
    ...filtered.filter((e) => !e.is_favorite),
  ];

  function openAddModal() {
    setNewName("");
    setNewNotes("");
    setNewType(ExerciseType.WEIGHT_REPS);
    setNewWeightUnit("kg");
    setShowAddModal(true);
  }

  async function handleAdd() {
    if (!newName.trim()) { Alert.alert("Error", "El nombre es obligatorio"); return; }
    const targetCategoryId = isFavorites ? (categories[0]?.id ?? "") : categoryId;
    if (!targetCategoryId) { Alert.alert("Error", "Crea una categoría antes de añadir ejercicios"); return; }
    const weightUnit = WEIGHT_TYPES.includes(newType) ? newWeightUnit : "kg";
    setAddSaving(true);
    const { data, error } = await repo.createExercise(
      { name: newName.trim(), notes: newNotes.trim() || null, category_id: targetCategoryId, type: newType, weight_unit: weightUnit },
      userId
    );
    if (error || !data) { Alert.alert("Error", error?.message ?? "Ha ocurrido un error"); setAddSaving(false); return; }
    addExercise({
      id: data.id,
      name: data.name,
      category_id: data.category_id ?? "",
      type: data.type as ExerciseType,
      weight_unit: data.weight_unit as "kg" | "lb",
      notes: data.notes ?? undefined,
      is_favorite: data.is_favorite,
      created_at: data.created_at,
    });
    setAddSaving(false);
    setShowAddModal(false);
  }

  function openEditModal(ex: Exercise) {
    setEditingExercise(ex);
    setExName(ex.name);
    setExNotes(ex.notes ?? "");
    setExType(ex.type);
    setExWeightUnit(ex.weight_unit ?? "kg");
  }

  /**
   * Persiste la edición del ejercicio. Si se pasa `convertFactor` (el usuario eligió
   * "Convertir" al cambiar de unidad de peso), además reescala en el repo remoto todos
   * los valores de peso históricos del ejercicio por ese factor de conversión.
   */
  async function doEdit(convertFactor?: number) {
    if (!editingExercise || !exName.trim()) return;
    const weightUnit = WEIGHT_TYPES.includes(exType) ? exWeightUnit : "kg";
    setEditSaving(true);
    const { data, error } = await repo.updateExercise(editingExercise.id, {
      name: exName.trim(),
      notes: exNotes.trim() || null,
      type: exType,
      weight_unit: weightUnit,
    });
    if (error || !data) { Alert.alert("Error", error?.message ?? "Ha ocurrido un error"); setEditSaving(false); return; }
    updateExercise(editingExercise.id, {
      name: data.name,
      notes: data.notes ?? undefined,
      category_id: data.category_id ?? "",
      type: data.type as ExerciseType,
      weight_unit: data.weight_unit as "kg" | "lb",
    });
    if (convertFactor) {
      await remoteExerciseRepo.convertExerciseWeights(editingExercise.id, convertFactor);
    }
    setEditSaving(false);
    setEditingExercise(null);
  }

  /**
   * Antes de guardar una edición, detecta si cambió el tipo de ejercicio y/o la unidad
   * de peso y, en ese caso, pide confirmación: cambiar de tipo advierte de que se
   * perderán los campos que no existan en el nuevo tipo, y cambiar de unidad ofrece
   * elegir entre "solo etiqueta" o "convertir" los valores históricos (factor kg↔lb).
   */
  function handleEdit(ex: Exercise) {
    const typeChanged = exType !== ex.type;
    const isWeightType = WEIGHT_TYPES.includes(exType);
    const unitChanged = isWeightType && exWeightUnit !== (ex.weight_unit ?? "kg");
    const convFactor = (ex.weight_unit ?? "kg") === "kg" ? 2.20462 : 0.453592;

    function showUnitAlert(onConfirm: () => void, onConfirmConvert: () => void) {
      Alert.alert(
        "Cambiar unidad",
        `¿Cómo actualizar los valores históricos al cambiar a ${exWeightUnit}?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Solo etiqueta", onPress: onConfirm },
          { text: "Convertir", onPress: onConfirmConvert },
        ]
      );
    }

    if (typeChanged) {
      Alert.alert(
        "Cambiar tipo",
        "Los campos que no existen en el nuevo tipo serán eliminados del historial de este ejercicio. ¿Continuar?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Cambiar", style: "destructive", onPress: () =>
              unitChanged
                ? showUnitAlert(() => doEdit(), () => doEdit(convFactor))
                : doEdit()
          },
        ]
      );
      return;
    }
    if (unitChanged) {
      showUnitAlert(() => doEdit(), () => doEdit(convFactor));
      return;
    }
    doEdit();
  }

  async function handleDelete(id: string, name: string) {
    Alert.alert("Eliminar ejercicio", `¿Eliminar "${name}" y todo su historial?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await repo.deleteExercise(id);
          deleteExercise(id);
        },
      },
    ]);
  }

  async function handleToggleFavorite(id: string, current: boolean) {
    await repo.toggleFavorite(id, !current);
    toggleFavorite(id);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Search + add */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: theme.text }}
            placeholder="Buscar…"
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>
        {!isFavorites && (
          <TouchableOpacity
            onPress={openAddModal}
            testID="exercise-add-button"
            style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="add" size={22} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 8 }}>
          {sorted.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <Text style={{ color: theme.textMuted, fontSize: 14 }}>
                {search ? `Sin ejercicios que coincidan con "${search}"` : "Sin ejercicios aún. Toca + para añadir uno."}
              </Text>
            </View>
          ) : (
            sorted.map((ex) => {
              const stats = exerciseStats[ex.id];
              const statsLine = stats
                ? `${stats.workout_count} ${stats.workout_count === 1 ? "sesión" : "sesiones"}${stats.last_used ? ` · ${formatLastUsedLabel(stats.last_used)}` : ""}`
                : null;
              return (
                <TouchableOpacity
                  key={ex.id}
                  onPress={() => activeWorkoutId
                    ? router.push(`/workout/${ex.id}` as never)
                    : router.push({ pathname: "/exercise-history/[exerciseId]", params: { exerciseId: ex.id, name: ex.name, type: ex.type, weightUnit: ex.weight_unit } } as never)
                  }
                  testID={`exercise-row-${ex.name}`}
                  style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: theme.borderLight, borderRadius: 12, backgroundColor: theme.surfaceCard, paddingHorizontal: 14, paddingVertical: 12, gap: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: theme.text }}>{ex.name}</Text>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                      {ex.type.replace(/_/g, " ").toLowerCase()}
                    </Text>
                    {statsLine && <Text style={{ fontSize: 11, color: theme.textDisabled, marginTop: 2 }}>{statsLine}</Text>}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <TouchableOpacity
                      onPress={() => handleToggleFavorite(ex.id, ex.is_favorite)}
                      testID={`exercise-favorite-${ex.name}`}
                      accessibilityLabel={ex.is_favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name={ex.is_favorite ? "star" : "star-outline"} size={18} color={ex.is_favorite ? theme.primary : theme.textDisabled} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openEditModal(ex)}
                      testID={`exercise-edit-${ex.name}`}
                      accessibilityLabel="Editar ejercicio"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="pencil-outline" size={16} color={theme.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(ex.id, ex.name)}
                      testID={`exercise-delete-${ex.name}`}
                      accessibilityLabel="Eliminar ejercicio"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add Exercise Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.borderLight }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Nuevo ejercicio</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textLabel }}>Nombre</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                  placeholder="ej. Press de banca"
                  placeholderTextColor={theme.textMuted}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textLabel }}>Notas</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top", color: theme.text }}
                  placeholder="Forma, equipo, ajustes de máquina…"
                  placeholderTextColor={theme.textMuted}
                  value={newNotes}
                  onChangeText={setNewNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textLabel }}>Tipo</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {TYPE_OPTIONS.map(({ value, label }) => (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setNewType(value)}
                      style={{ borderRadius: 10, borderWidth: 1.5, borderColor: newType === value ? theme.primary : theme.border, backgroundColor: newType === value ? theme.primary : "transparent", paddingHorizontal: 14, paddingVertical: 8 }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "500", color: newType === value ? "white" : theme.textLabel }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {WEIGHT_TYPES.includes(newType) && (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textLabel }}>Unidad de peso</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["kg", "lb"] as const).map((unit) => (
                      <TouchableOpacity
                        key={unit}
                        onPress={() => setNewWeightUnit(unit)}
                        style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: newWeightUnit === unit ? theme.primary : theme.border, backgroundColor: newWeightUnit === unit ? theme.primary : "transparent", paddingVertical: 10, alignItems: "center" }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: newWeightUnit === unit ? "white" : theme.textLabel }}>{unit}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handleAdd()}
                  disabled={addSaving || !newName.trim()}
                  style={{ backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: addSaving || !newName.trim() ? 0.6 : 1 }}
                >
                  <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
                    {addSaving ? "Creando…" : "Crear ejercicio"}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Exercise Modal */}
      <Modal visible={editingExercise != null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingExercise(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.borderLight }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Editar ejercicio</Text>
              <TouchableOpacity onPress={() => setEditingExercise(null)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textLabel }}>Nombre</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                  value={exName}
                  onChangeText={setExName}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textLabel }}>Notas</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top", color: theme.text }}
                  placeholder="Forma, equipo, ajustes…"
                  placeholderTextColor={theme.textMuted}
                  value={exNotes}
                  onChangeText={setExNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textLabel }}>Tipo</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {TYPE_OPTIONS.map(({ value, label }) => (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setExType(value)}
                      style={{ borderRadius: 10, borderWidth: 1.5, borderColor: exType === value ? theme.primary : theme.border, backgroundColor: exType === value ? theme.primary : "transparent", paddingHorizontal: 14, paddingVertical: 8 }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "500", color: exType === value ? "white" : theme.textLabel }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {WEIGHT_TYPES.includes(exType) && (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textLabel }}>Unidad de peso</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["kg", "lb"] as const).map((unit) => (
                      <TouchableOpacity
                        key={unit}
                        onPress={() => setExWeightUnit(unit)}
                        style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: exWeightUnit === unit ? theme.primary : theme.border, backgroundColor: exWeightUnit === unit ? theme.primary : "transparent", paddingVertical: 10, alignItems: "center" }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: exWeightUnit === unit ? "white" : theme.textLabel }}>{unit}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <TouchableOpacity
                onPress={() => editingExercise && handleEdit(editingExercise)}
                disabled={editSaving || !exName.trim()}
                style={{ backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: editSaving || !exName.trim() ? 0.6 : 1 }}
              >
                <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
                  {editSaving ? "Guardando…" : "Guardar cambios"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

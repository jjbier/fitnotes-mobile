import { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView, ScrollView, Text, View, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useExerciseStore, useWorkoutStore, filterExercises, ExerciseType } from "@fitnotes/core";
import { createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import type { Exercise } from "@fitnotes/core";

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

function formatLastUsed(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ExerciseCategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const navigation = useNavigation();
  const router = useRouter();

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
  const [userId, setUserId] = useState("");
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

  const repo = useMemo(() => createExerciseRepository(supabase), []);
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
        const statsRes = await repo.getExerciseStats();
        if (statsRes.data) setExerciseStats(statsRes.data);
        return;
      }
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) setUserId(session.user.id);
      const [catRes, exRes, statsRes] = await Promise.all([
        repo.getCategories(),
        repo.getExercises(),
        repo.getExerciseStats(),
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

  // Also get userId if not set
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUserId(session.user.id);
    });
  }, []);

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

  async function handleAdd(andNew = false) {
    if (!newName.trim()) { Alert.alert("Error", "El nombre es obligatorio"); return; }
    const targetCategoryId = isFavorites ? (categories[0]?.id ?? "") : categoryId;
    if (!targetCategoryId) { Alert.alert("Error", "Crea una categoría antes de añadir ejercicios"); return; }
    const weightUnit = WEIGHT_TYPES.includes(newType) ? newWeightUnit : "kg";
    setAddSaving(true);
    const { data, error } = await repo.createExercise(
      { name: newName.trim(), notes: newNotes.trim() || null, category_id: targetCategoryId, type: newType, weight_unit: weightUnit },
      userId
    );
    if (error) { Alert.alert("Error", error.message); setAddSaving(false); return; }
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
    if (andNew) {
      setNewName("");
      setNewNotes("");
    } else {
      setShowAddModal(false);
    }
  }

  function openEditModal(ex: Exercise) {
    setEditingExercise(ex);
    setExName(ex.name);
    setExNotes(ex.notes ?? "");
    setExType(ex.type);
    setExWeightUnit(ex.weight_unit ?? "kg");
  }

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
    if (error) { Alert.alert("Error", error.message); setEditSaving(false); return; }
    updateExercise(editingExercise.id, {
      name: data.name,
      notes: data.notes ?? undefined,
      category_id: data.category_id ?? "",
      type: data.type as ExerciseType,
      weight_unit: data.weight_unit as "kg" | "lb",
    });
    if (convertFactor) {
      await repo.convertExerciseWeights(editingExercise.id, convertFactor);
    }
    setEditSaving(false);
    setEditingExercise(null);
  }

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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Search + add */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc", borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search" size={16} color="#64748b" />
          <TextInput
            style={{ flex: 1, paddingVertical: 10, fontSize: 14 }}
            placeholder="Buscar…"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>
        {!isFavorites && (
          <TouchableOpacity
            onPress={openAddModal}
            style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="add" size={22} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 8 }}>
          {sorted.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <Text style={{ color: "#94a3b8", fontSize: 14 }}>
                {search ? `Sin ejercicios que coincidan con "${search}"` : "Sin ejercicios aún. Toca + para añadir uno."}
              </Text>
            </View>
          ) : (
            sorted.map((ex) => {
              const stats = exerciseStats[ex.id];
              const statsLine = stats
                ? `${stats.workout_count} ${stats.workout_count === 1 ? "sesión" : "sesiones"}${stats.last_used ? ` · ${formatLastUsed(stats.last_used)}` : ""}`
                : null;
              return (
                <TouchableOpacity
                  key={ex.id}
                  onPress={() => activeWorkoutId
                    ? router.push(`/workout/${ex.id}` as never)
                    : router.push({ pathname: "/exercise-history/[exerciseId]", params: { exerciseId: ex.id, name: ex.name, type: ex.type, weightUnit: ex.weight_unit } } as never)
                  }
                  style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 12, gap: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: "#0f172a" }}>{ex.name}</Text>
                    <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                      {ex.type.replace(/_/g, " ").toLowerCase()}
                    </Text>
                    {statsLine && <Text style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>{statsLine}</Text>}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <TouchableOpacity onPress={() => handleToggleFavorite(ex.id, ex.is_favorite)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={ex.is_favorite ? "star" : "star-outline"} size={18} color={ex.is_favorite ? "#6366f1" : "#cbd5e1"} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEditModal(ex)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="pencil-outline" size={16} color="#94a3b8" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(ex.id, ex.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
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
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>Nuevo ejercicio</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Nombre</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
                  placeholder="ej. Press de banca"
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Notas</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top" }}
                  placeholder="Forma, equipo, ajustes de máquina…"
                  value={newNotes}
                  onChangeText={setNewNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Tipo</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {TYPE_OPTIONS.map(({ value, label }) => (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setNewType(value)}
                      style={{ borderRadius: 10, borderWidth: 1.5, borderColor: newType === value ? "#6366f1" : "#e2e8f0", backgroundColor: newType === value ? "#6366f1" : "transparent", paddingHorizontal: 14, paddingVertical: 8 }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "500", color: newType === value ? "#fff" : "#374151" }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {WEIGHT_TYPES.includes(newType) && (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Unidad de peso</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["kg", "lb"] as const).map((unit) => (
                      <TouchableOpacity
                        key={unit}
                        onPress={() => setNewWeightUnit(unit)}
                        style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: newWeightUnit === unit ? "#6366f1" : "#e2e8f0", backgroundColor: newWeightUnit === unit ? "#6366f1" : "transparent", paddingVertical: 10, alignItems: "center" }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: newWeightUnit === unit ? "#fff" : "#374151" }}>{unit}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <TouchableOpacity
                onPress={() => handleAdd(false)}
                disabled={addSaving || !newName.trim()}
                style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: addSaving || !newName.trim() ? 0.6 : 1 }}
              >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                  {addSaving ? "Creando…" : "Crear ejercicio"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Exercise Modal */}
      <Modal visible={editingExercise != null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingExercise(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>Editar ejercicio</Text>
              <TouchableOpacity onPress={() => setEditingExercise(null)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Nombre</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
                  value={exName}
                  onChangeText={setExName}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Notas</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top" }}
                  placeholder="Forma, equipo, ajustes…"
                  value={exNotes}
                  onChangeText={setExNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Tipo</Text>
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
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Unidad de peso</Text>
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
              <TouchableOpacity
                onPress={() => editingExercise && handleEdit(editingExercise)}
                disabled={editSaving || !exName.trim()}
                style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: editSaving || !exName.trim() ? 0.6 : 1 }}
              >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
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

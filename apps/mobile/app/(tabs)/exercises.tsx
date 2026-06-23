import { useEffect, useState } from "react";
import {
  SafeAreaView, ScrollView, Text, View, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, KeyboardAvoidingView,
  Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, { ScaleDecorator } from "react-native-draggable-flatlist";
import type { RenderItemParams } from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useExerciseStore, filterExercises, ExerciseType } from "@fitnotes/core";
import { createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import type { Category, Exercise } from "@fitnotes/core";

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

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

const WEIGHT_TYPES = [ExerciseType.WEIGHT_REPS, ExerciseType.WEIGHT_ONLY, ExerciseType.WEIGHT_DISTANCE, ExerciseType.WEIGHT_TIME];

export default function ExercisesScreen() {
  const router = useRouter();
  const categories = useExerciseStore((s) => s.categories);
  const exercises = useExerciseStore((s) => s.exercises);
  const isLoading = useExerciseStore((s) => s.isLoading);
  const loadExercises = useExerciseStore((s) => s.loadExercises);
  const addExercise = useExerciseStore((s) => s.addExercise);
  const updateExercise = useExerciseStore((s) => s.updateExercise);
  const deleteExercise = useExerciseStore((s) => s.deleteExercise);
  const addCategory = useExerciseStore((s) => s.addCategory);
  const updateCategory = useExerciseStore((s) => s.updateCategory);
  const deleteCategory = useExerciseStore((s) => s.deleteCategory);
  const reorderCategories = useExerciseStore((s) => s.reorderCategories);
  const toggleFavorite = useExerciseStore((s) => s.toggleFavorite);
  const setLoading = useExerciseStore((s) => s.setLoading);

  const [search, setSearch] = useState("");
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [userId, setUserId] = useState("");
  const [exerciseStats, setExerciseStats] = useState<Record<string, { workout_count: number; last_used: string | null }>>({});

  // Exercise create/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [exName, setExName] = useState("");
  const [exNotes, setExNotes] = useState("");
  const [exCategoryId, setExCategoryId] = useState("");
  const [exType, setExType] = useState<ExerciseType>(ExerciseType.WEIGHT_REPS);
  const [exWeightUnit, setExWeightUnit] = useState<"kg" | "lb">("kg");
  const [saving, setSaving] = useState(false);
  const [modalCategories, setModalCategories] = useState<Category[]>([]);

  // Inline new category inside exercise modal
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]!);
  const [catSaving, setCatSaving] = useState(false);

  // Category management modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatColor, setEditCatColor] = useState(PRESET_COLORS[0]!);
  const [catEditSaving, setCatEditSaving] = useState(false);

  const repo = createExerciseRepository(supabase);

  useEffect(() => {
    async function load() {
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
  }, []);

  function openCreateModal() {
    const cats = useExerciseStore.getState().categories;
    setModalCategories(cats);
    setEditingExercise(null);
    setExName("");
    setExNotes("");
    setExCategoryId(cats[0]?.id ?? "");
    setExType(ExerciseType.WEIGHT_REPS);
    setExWeightUnit("kg");
    setShowNewCat(false);
    setNewCatName("");
    setNewCatColor(PRESET_COLORS[0]!);
    setShowModal(true);
  }

  function openEditModal(ex: Exercise) {
    const cats = useExerciseStore.getState().categories;
    setModalCategories(cats);
    setEditingExercise(ex);
    setExName(ex.name);
    setExNotes(ex.notes ?? "");
    setExCategoryId(ex.category_id);
    setExType(ex.type);
    setExWeightUnit(ex.weight_unit ?? "kg");
    setShowNewCat(false);
    setNewCatName("");
    setNewCatColor(PRESET_COLORS[0]!);
    setShowModal(true);
  }

  async function handleCreateCategory() {
    if (!newCatName.trim()) return;
    setCatSaving(true);
    const { data, error } = await repo.createCategory({ name: newCatName.trim(), color: newCatColor }, userId);
    if (error) { Alert.alert("Error", error.message); setCatSaving(false); return; }
    const cat: Category = { id: data.id, name: data.name, color: data.color, order_index: data.order_index };
    addCategory(cat);
    setModalCategories((prev) => [...prev, cat]);
    setExCategoryId(cat.id);
    setShowNewCat(false);
    setNewCatName("");
    setNewCatColor(PRESET_COLORS[0]!);
    setCatSaving(false);
  }

  async function doSave(andNew: boolean, convertFactor?: number) {
    if (!exName.trim()) { Alert.alert("Error", "El nombre es obligatorio"); return; }
    if (!exCategoryId) { Alert.alert("Error", "Selecciona o crea una categoría"); return; }

    const weightUnit = WEIGHT_TYPES.includes(exType) ? exWeightUnit : "kg";
    setSaving(true);

    if (editingExercise) {
      const { data, error } = await repo.updateExercise(editingExercise.id, {
        name: exName.trim(),
        notes: exNotes.trim() || null,
        category_id: exCategoryId,
        type: exType,
        weight_unit: weightUnit,
      });
      if (error) { Alert.alert("Error", error.message); setSaving(false); return; }
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
      setSaving(false);
      setShowModal(false);
    } else {
      const { data, error } = await repo.createExercise(
        { name: exName.trim(), notes: exNotes.trim() || null, category_id: exCategoryId, type: exType, weight_unit: weightUnit },
        userId
      );
      if (error) { Alert.alert("Error", error.message); setSaving(false); return; }
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
      setSaving(false);

      if (andNew) {
        const cats = useExerciseStore.getState().categories;
        setModalCategories(cats);
        setExName("");
        setExNotes("");
        setExType(ExerciseType.WEIGHT_REPS);
        setExWeightUnit("kg");
      } else {
        setShowModal(false);
      }
    }
  }

  function handleSave(andNew: boolean) {
    const typeChanged = editingExercise && exType !== editingExercise.type;
    const isWeightType = WEIGHT_TYPES.includes(exType);
    const unitChanged = editingExercise && isWeightType && exWeightUnit !== (editingExercise.weight_unit ?? "kg");
    const convFactor = editingExercise
      ? ((editingExercise.weight_unit ?? "kg") === "kg" ? 2.20462 : 0.453592)
      : undefined;

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
          {
            text: "Cambiar", style: "destructive", onPress: () => {
              if (unitChanged) {
                showUnitAlert(() => doSave(andNew), () => doSave(andNew, convFactor));
              } else {
                doSave(andNew);
              }
            },
          },
        ]
      );
      return;
    }

    if (unitChanged) {
      showUnitAlert(() => doSave(andNew), () => doSave(andNew, convFactor));
      return;
    }

    doSave(andNew);
  }

  async function handleToggleFavorite(id: string, current: boolean) {
    await repo.toggleFavorite(id, !current);
    toggleFavorite(id);
  }

  async function handleDeleteExercise(id: string, name: string) {
    Alert.alert(
      "Eliminar ejercicio",
      `¿Eliminar "${name}" y todo su historial, PRs y objetivos?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            await repo.deleteExercise(id);
            deleteExercise(id);
          },
        },
      ]
    );
  }

  // Category management
  function startEditCat(cat: Category) {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatColor(cat.color);
  }

  function cancelEditCat() {
    setEditingCatId(null);
    setEditCatName("");
    setEditCatColor(PRESET_COLORS[0]!);
  }

  async function handleUpdateCategory() {
    if (!editingCatId || !editCatName.trim()) return;
    setCatEditSaving(true);
    const { error } = await repo.updateCategory(editingCatId, { name: editCatName.trim(), color: editCatColor });
    if (error) { Alert.alert("Error", error.message); setCatEditSaving(false); return; }
    updateCategory(editingCatId, { name: editCatName.trim(), color: editCatColor });
    setCatEditSaving(false);
    cancelEditCat();
  }

  async function handleCatDragEnd({ data }: { data: typeof categories }) {
    const prevOrder = categories.map((c) => c.id);
    reorderCategories(data.map((c) => c.id));
    const results = await repo.reorderCategories(data.map((c, i) => ({ id: c.id, order_index: i })));
    if (results.some((r) => r.error)) {
      reorderCategories(prevOrder);
      Alert.alert("Error", "No se pudo guardar el orden. Inténtalo de nuevo.");
    }
  }

  async function handleDeleteCategory(id: string, name: string) {
    Alert.alert(
      "Eliminar categoría",
      `¿Eliminar "${name}" y todos sus ejercicios e historial?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            await repo.deleteCategory(id);
            deleteCategory(id);
          },
        },
      ]
    );
  }

  const filteredAll = filterExercises(exercises, search);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Search + manage categories */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc", borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search" size={16} color="#64748b" />
          <TextInput
            style={{ flex: 1, paddingVertical: 12, fontSize: 14 }}
            placeholder="Buscar ejercicios…"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>
        {categories.length > 0 && (
          <TouchableOpacity onPress={() => setShowCatModal(true)} style={{ padding: 8 }}>
            <Ionicons name="settings-outline" size={20} color="#64748b" />
          </TouchableOpacity>
        )}
      </View>

      {/* Categories or Search results */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : search ? (
        /* Flat list when searching */
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 8 }}>
          {filteredAll.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <Text style={{ color: "#94a3b8", fontSize: 14 }}>Sin ejercicios que coincidan con "{search}"</Text>
            </View>
          ) : (
            filteredAll.map((ex) => (
              <ExerciseRow
                key={ex.id}
                ex={ex}
                categories={categories}
                stats={exerciseStats[ex.id]}
                onPress={() => router.push({ pathname: "/exercise-history/[exerciseId]", params: { exerciseId: ex.id, name: ex.name, type: ex.type, weightUnit: ex.weight_unit } } as never)}
                onEdit={() => openEditModal(ex)}
                onDelete={() => handleDeleteExercise(ex.id, ex.name)}
                onToggleFavorite={() => handleToggleFavorite(ex.id, ex.is_favorite)}
              />
            ))
          )}
        </ScrollView>
      ) : (
        /* Category cards when not searching */
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 8, paddingTop: 4 }}>
          {categories.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center", gap: 12 }}>
              <Text style={{ color: "#94a3b8", fontSize: 14 }}>Sin categorías aún</Text>
              <TouchableOpacity onPress={openCreateModal} style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Crear primer ejercicio</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {exercises.some((e) => e.is_favorite) && (
                <CategoryCard
                  name="Favoritos"
                  color="#6366f1"
                  count={exercises.filter((e) => e.is_favorite).length}
                  onPress={() => router.push({ pathname: "/exercises/[categoryId]", params: { categoryId: "favorites" } } as never)}
                />
              )}
              {categories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  name={cat.name}
                  color={cat.color}
                  count={exercises.filter((e) => e.category_id === cat.id).length}
                  onPress={() => router.push({ pathname: "/exercises/[categoryId]", params: { categoryId: cat.id } } as never)}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* FAB speed dial */}
      {showFabMenu && (
        <TouchableOpacity
          style={{ position: "absolute", inset: 0 } as never}
          onPress={() => setShowFabMenu(false)}
          activeOpacity={1}
        />
      )}
      {showFabMenu && (
        <View style={{ position: "absolute", bottom: 100, right: 24, gap: 12, alignItems: "flex-end" }}>
          <TouchableOpacity
            onPress={() => { setShowFabMenu(false); router.push("/routines"); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>Nueva rutina</Text>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="clipboard-outline" size={18} color="white" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setShowFabMenu(false); openCreateModal(); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>Nuevo ejercicio</Text>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="barbell-outline" size={18} color="white" />
            </View>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity
        onPress={() => setShowFabMenu((v) => !v)}
        style={{ position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", shadowColor: "#6366f1", shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 }}
      >
        <Ionicons name={showFabMenu ? "close" : "add"} size={28} color="white" />
      </TouchableOpacity>

      {/* Create / Edit Exercise Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>
                {editingExercise ? "Editar ejercicio" : "Nuevo ejercicio"}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
              {/* Name */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Nombre</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
                  placeholder="ej. Press de banca"
                  value={exName}
                  onChangeText={setExName}
                  autoFocus={!editingExercise}
                />
              </View>

              {/* Notes */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Notas</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top" }}
                  placeholder="Forma, equipo, ajustes de máquina…"
                  value={exNotes}
                  onChangeText={setExNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Category */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Categoría</Text>
                {modalCategories.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {modalCategories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => { setExCategoryId(cat.id); setShowNewCat(false); }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, borderWidth: 2, borderColor: exCategoryId === cat.id ? cat.color : "#e2e8f0", backgroundColor: exCategoryId === cat.id ? cat.color + "18" : "transparent", paddingHorizontal: 14, paddingVertical: 7 }}
                      >
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
                        <Text style={{ fontSize: 13, fontWeight: "500", color: "#0f172a" }}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <TouchableOpacity
                  onPress={() => setShowNewCat((v) => !v)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
                >
                  <Ionicons name={showNewCat ? "close" : "add"} size={16} color="#6366f1" />
                  <Text style={{ fontSize: 13, fontWeight: "500", color: "#6366f1" }}>
                    {showNewCat ? "Cancelar" : "Nueva categoría"}
                  </Text>
                </TouchableOpacity>
                {showNewCat && (
                  <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 14, gap: 12, backgroundColor: "#f8fafc" }}>
                    <TextInput
                      style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff" }}
                      placeholder="Nombre de la categoría"
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
                        {catSaving ? "Creando…" : "Crear categoría"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Type */}
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

              {/* Weight unit — only for weight-based types */}
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

              {/* Actions */}
              <View style={{ marginTop: 4 }}>
                <TouchableOpacity
                  onPress={() => handleSave(false)}
                  disabled={saving}
                  style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: saving ? 0.6 : 1 }}
                >
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                    {saving
                      ? (editingExercise ? "Guardando…" : "Creando…")
                      : (editingExercise ? "Guardar cambios" : "Crear ejercicio")}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Category Management Modal */}
      <Modal
        visible={showCatModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowCatModal(false); cancelEditCat(); }}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>Categorías</Text>
            <TouchableOpacity onPress={() => { setShowCatModal(false); cancelEditCat(); }}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <DraggableFlatList
            data={categories}
            keyExtractor={(item) => item.id}
            onDragEnd={handleCatDragEnd}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Text style={{ color: "#94a3b8", fontSize: 14 }}>Sin categorías aún</Text>
              </View>
            }
            renderItem={({ item: cat, drag, isActive }: RenderItemParams<typeof categories[number]>) => (
              <ScaleDecorator activeScale={1.02}>
                <View style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: isActive ? "#6366f1" : "#f1f5f9", borderRadius: 12, backgroundColor: isActive ? "#f5f3ff" : "#fff", paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
                    <TouchableOpacity onPressIn={drag} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="menu" size={20} color={isActive ? "#6366f1" : "#94a3b8"} />
                    </TouchableOpacity>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: cat.color }} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: "#0f172a" }}>{cat.name}</Text>
                    <TouchableOpacity
                      onPress={() => editingCatId === cat.id ? cancelEditCat() : startEditCat(cat)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name={editingCatId === cat.id ? "close-outline" : "pencil-outline"} size={18} color="#94a3b8" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteCategory(cat.id, cat.name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>

                  {editingCatId === cat.id && (
                    <View style={{ marginTop: 4, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 14, gap: 12, backgroundColor: "#f8fafc" }}>
                      <TextInput
                        style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff" }}
                        value={editCatName}
                        onChangeText={setEditCatName}
                        autoFocus
                      />
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {PRESET_COLORS.map((c) => (
                          <TouchableOpacity
                            key={c}
                            onPress={() => setEditCatColor(c)}
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 2.5, borderColor: editCatColor === c ? "#0f172a" : "transparent" }}
                          />
                        ))}
                      </View>
                      <TouchableOpacity
                        onPress={handleUpdateCategory}
                        disabled={catEditSaving || !editCatName.trim()}
                        style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingVertical: 10, alignItems: "center", opacity: catEditSaving || !editCatName.trim() ? 0.5 : 1 }}
                      >
                        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                          {catEditSaving ? "Guardando…" : "Guardar cambios"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </ScaleDecorator>
            )}
          />
        </SafeAreaView>
        </GestureHandlerRootView>
      </Modal>
    </SafeAreaView>
  );
}

function CategoryCard({ name, color, count, onPress }: { name: string; color: string; count: number; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14, gap: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}
    >
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: "#0f172a" }}>{name}</Text>
        <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{count} {count === 1 ? "ejercicio" : "ejercicios"}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

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

function ExerciseRow({
  ex,
  categories,
  stats,
  onPress,
  onEdit,
  onDelete,
  onToggleFavorite,
}: {
  ex: Exercise;
  categories: Category[];
  stats?: { workout_count: number; last_used: string | null };
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const category = categories.find((c) => c.id === ex.category_id);
  const statsLine = stats
    ? `${stats.workout_count} ${stats.workout_count === 1 ? "sesión" : "sesiones"}${stats.last_used ? ` · ${formatLastUsed(stats.last_used)}` : ""}`
    : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
        {category && <View style={{ width: 4, height: statsLine ? 44 : 36, borderRadius: 2, backgroundColor: category.color }} />}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: "#0f172a" }}>{ex.name}</Text>
          <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{ex.type.replace(/_/g, " ").toLowerCase()}</Text>
          {statsLine && <Text style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>{statsLine}</Text>}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <TouchableOpacity onPress={onToggleFavorite} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={ex.is_favorite ? "star" : "star-outline"} size={18} color={ex.is_favorite ? "#6366f1" : "#cbd5e1"} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="pencil-outline" size={16} color="#94a3b8" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

import { useEffect, useMemo, useState, useCallback, memo } from "react";
import {
  SafeAreaView, ScrollView, Text, View, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, { ScaleDecorator } from "react-native-draggable-flatlist";
import type { RenderItemParams } from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useExerciseStore, useWorkoutStore, usePreferencesStore, filterExercises, ExerciseType, formatLastUsedLabel } from "@fitnotes/core";
import { createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import type { Category, Exercise } from "@fitnotes/core";
import { useTheme } from "../../lib/theme";
import { useSyncStatus } from "../../contexts/SyncContext";
import { useRepositories } from "../../contexts/RepositoryContext";
import ExerciseFormModal, { type ExerciseFormPatch } from "../../components/ExerciseFormModal";

/** Paleta de colores predefinidos seleccionable al crear/editar una categoría. */
const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

/**
 * Tab Ejercicios: catálogo de ejercicios agrupado por categoría muscular
 * (tarjetas de categoría con contador), con búsqueda global que aplana el
 * catálogo en una lista filtrada. Soporta:
 * - FAB con menú desplegable para crear ejercicio o categoría nueva.
 * - Modal de creación/edición de ejercicio (tipo, unidad de peso, incremento,
 *   descanso por defecto, gráfico predeterminado), con creación de categoría
 *   inline sin salir del formulario.
 * - Modal de gestión de categorías con reordenación por drag&drop
 *   (`DraggableFlatList`), edición inline y borrado.
 * - Alertas de confirmación al cambiar tipo/unidad de peso de un ejercicio
 *   existente (ofrece convertir los valores históricos o solo la etiqueta) y
 *   al eliminar ejercicio/categoría (cascada de historial/PRs/objetivos).
 * - Favoritos, categorías ocultas (preferencia local) y estadísticas de uso
 *   (sesiones, última vez usado) por ejercicio, leídas del repo remoto de
 *   estadísticas.
 */
export default function ExercisesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
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
  const activeWorkoutId = useWorkoutStore((s) => s.activeWorkout?.id);

  const [search, setSearch] = useState("");
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [exerciseStats, setExerciseStats] = useState<Record<string, { workout_count: number; last_used: string | null }>>({});

  // Exercise create/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Standalone "Nueva categoría" modal state, reused for its `newCatName`/`newCatColor`
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]!);
  const [catSaving, setCatSaving] = useState(false);

  // Standalone "Nueva categoría" modal (accesible desde el FAB, sin pasar por
  // el formulario de ejercicio)
  const [showCategoryOnlyModal, setShowCategoryOnlyModal] = useState(false);

  // Category management modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatColor, setEditCatColor] = useState(PRESET_COLORS[0]!);
  const [catEditSaving, setCatEditSaving] = useState(false);
  const hiddenCategoryIds = usePreferencesStore((s) => s.preferences.hidden_category_ids);
  const [showHiddenCategories, setShowHiddenCategories] = useState(false);

  const { exerciseRepo: repo, userId } = useRepositories();
  const remoteExerciseRepo = useMemo(() => createExerciseRepository(supabase), []);
  const { refetchSignal } = useSyncStatus();

  /** Opciones de tipo de ejercicio mostradas en el modal de creación/edición, con su etiqueta traducida. */
  /** Carga categorías, ejercicios (repo local) y estadísticas de uso (repo remoto de estadísticas) y los vuelca al store. */
  const load = useCallback(async () => {
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
          weight_increment: ex.weight_increment ?? undefined,
          default_rest_seconds: ex.default_rest_seconds ?? undefined,
          default_chart: (ex.default_chart ?? "weight") as "weight" | "volume" | "reps",
          demo_url: ex.demo_url ?? undefined,
        }))
      );
    }
    if (statsRes.data) setExerciseStats(statsRes.data);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, remoteExerciseRepo]);

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refetchSignal === 0) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchSignal]);

  /** Abre `ExerciseFormModal` en modo creación (sin ejercicio precargado). */
  function openCreateModal() {
    setEditingExercise(null);
    setShowModal(true);
  }

  /** Abre `ExerciseFormModal` en modo edición, precargado con `ex`. */
  function openEditModal(ex: Exercise) {
    setEditingExercise(ex);
    setShowModal(true);
  }

  /** Crea una categoría nueva en el repo y el store; usada tanto por el modal independiente "Nueva categoría" como por el selector inline del formulario de ejercicio. */
  async function createCategory(name: string, color: string): Promise<Category | null> {
    const { data, error } = await repo.createCategory({ name, color }, userId);
    if (error || !data) { Alert.alert("Error", error?.message ?? t("exercises:genericError")); return null; }
    const cat: Category = { id: data.id, name: data.name, color: data.color, order_index: data.order_index };
    addCategory(cat);
    return cat;
  }

  /** Crea una categoría nueva desde el modal independiente "Nueva categoría" accesible desde el FAB (sin pasar por el formulario de ejercicio). */
  async function handleCreateCategoryStandalone() {
    if (!newCatName.trim()) return;
    setCatSaving(true);
    const cat = await createCategory(newCatName.trim(), newCatColor);
    setCatSaving(false);
    if (!cat) return;
    setNewCatName("");
    setNewCatColor(PRESET_COLORS[0]!);
    setShowCategoryOnlyModal(false);
  }

  /**
   * Persiste el formulario de `ExerciseFormModal` (crea o actualiza el ejercicio
   * según `editingExercise`). Si se pasa `convertFactor`, además convierte los
   * pesos históricos del ejercicio tras guardar (cambio de unidad kg↔lb).
   */
  async function handleExerciseSubmit(patch: ExerciseFormPatch, opts: { convertFactor?: number }): Promise<string | void> {
    if (editingExercise) {
      const { data, error } = await repo.updateExercise(editingExercise.id, patch);
      if (error || !data) return error?.message ?? t("exercises:genericError");
      updateExercise(editingExercise.id, {
        name: data.name,
        notes: data.notes ?? undefined,
        demo_url: data.demo_url ?? undefined,
        category_id: data.category_id ?? "",
        type: data.type as ExerciseType,
        weight_unit: data.weight_unit as "kg" | "lb",
        weight_increment: data.weight_increment ?? undefined,
        default_rest_seconds: data.default_rest_seconds ?? undefined,
        default_chart: (data.default_chart ?? "weight") as "weight" | "volume" | "reps",
      });
      if (opts.convertFactor) {
        await remoteExerciseRepo.convertExerciseWeights(editingExercise.id, opts.convertFactor);
      }
    } else {
      const { data, error } = await repo.createExercise(patch, userId);
      if (error || !data) return error?.message ?? t("exercises:genericError");
      addExercise({
        id: data.id,
        name: data.name,
        category_id: data.category_id ?? "",
        type: data.type as ExerciseType,
        weight_unit: data.weight_unit as "kg" | "lb",
        notes: data.notes ?? undefined,
        demo_url: data.demo_url ?? undefined,
        is_favorite: data.is_favorite,
        created_at: data.created_at,
        weight_increment: data.weight_increment ?? undefined,
        default_rest_seconds: data.default_rest_seconds ?? undefined,
        default_chart: (data.default_chart ?? "weight") as "weight" | "volume" | "reps",
      });
    }
  }

  /** Invierte el estado de favorito de un ejercicio, persistiendo en el repo y actualizando el store. */
  async function handleToggleFavorite(id: string, current: boolean) {
    await repo.toggleFavorite(id, !current);
    toggleFavorite(id);
  }

  /** Pide confirmación y elimina un ejercicio junto con su historial, PRs y objetivos asociados (cascada local). */
  async function handleDeleteExercise(id: string, name: string) {
    Alert.alert(
      t("exercises:deleteExerciseTitleMobile"),
      t("exercises:deleteExerciseConfirmFullMobile", { name }),
      [
        { text: t("common:cancel"), style: "cancel" },
        {
          text: t("common:delete"),
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
  /** Abre el formulario de edición inline para la categoría dada, dentro del modal de gestión de categorías. */
  function startEditCat(cat: Category) {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatColor(cat.color);
  }

  /** Cierra el formulario de edición inline de categoría y resetea sus campos. */
  function cancelEditCat() {
    setEditingCatId(null);
    setEditCatName("");
    setEditCatColor(PRESET_COLORS[0]!);
  }

  /** Guarda los cambios de nombre/color de la categoría en edición inline. */
  async function handleUpdateCategory() {
    if (!editingCatId || !editCatName.trim()) return;
    setCatEditSaving(true);
    const { error } = await repo.updateCategory(editingCatId, { name: editCatName.trim(), color: editCatColor });
    if (error) { Alert.alert("Error", error.message); setCatEditSaving(false); return; }
    updateCategory(editingCatId, { name: editCatName.trim(), color: editCatColor });
    setCatEditSaving(false);
    cancelEditCat();
  }

  /** Aplica el nuevo orden de categorías tras un drag&drop (optimista), revirtiendo si el guardado remoto/local falla. */
  async function handleCatDragEnd({ data }: { data: typeof categories }) {
    const prevOrder = categories.map((c) => c.id);
    reorderCategories(data.map((c) => c.id));
    const results = await repo.reorderCategories(data.map((c, i) => ({ id: c.id, order_index: i })));
    if (results.some((r) => r.error)) {
      reorderCategories(prevOrder);
      Alert.alert("Error", t("exercises:reorderFailedMobile"));
    }
  }

  /** Pide confirmación y elimina una categoría junto con todos sus ejercicios e historial (cascada local). */
  async function handleDeleteCategory(id: string, name: string) {
    Alert.alert(
      t("exercises:deleteCategoryTitleMobile"),
      t("exercises:deleteCategoryConfirmMobile", { name }),
      [
        { text: t("common:cancel"), style: "cancel" },
        {
          text: t("common:delete"),
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Search + global search + manage categories */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            testID="exercises-search-input"
            style={{ flex: 1, paddingVertical: 12, fontSize: 14 }}
            placeholder={t("exercises:searchPlaceholderCatalogMobile")}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push("/search" as any)}
          style={{ padding: 8 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t("exercises:searchHistoryLabel")}
        >
          <Ionicons name="time-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
        {categories.length > 0 && (
          <TouchableOpacity onPress={() => setShowCatModal(true)} style={{ padding: 8 }} accessibilityLabel={t("exercises:manageCategoriesLabelMobile")}>
            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Categories or Search results */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : search ? (
        /* Flat list when searching */
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 8 }}>
          {filteredAll.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>{t("exercises:noExercisesMatchMobile", { search })}</Text>
            </View>
          ) : (
            filteredAll.map((ex) => (
              <ExerciseRow
                key={ex.id}
                ex={ex}
                categories={categories}
                stats={exerciseStats[ex.id]}
                onPress={() => activeWorkoutId
                  ? router.push(`/workout/${ex.id}` as never)
                  : router.push({ pathname: "/exercise-history/[exerciseId]", params: { exerciseId: ex.id, name: ex.name, type: ex.type, weightUnit: ex.weight_unit } } as never)
                }
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
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>{t("exercises:emptyCategoriesTitle")}</Text>
              <TouchableOpacity onPress={openCreateModal} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}>
                <Text style={{ color: colors.background, fontSize: 14, fontWeight: "600" }}>{t("exercises:emptyCategoriesActionMobile")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {exercises.some((e) => e.is_favorite) && (
                <CategoryCard
                  name={t("exercises:favoritesLabel")}
                  color="#6366f1"
                  count={exercises.filter((e) => e.is_favorite).length}
                  onPress={() => router.push({ pathname: "/exercises/[categoryId]", params: { categoryId: "favorites" } } as never)}
                />
              )}
              {categories
                .filter((cat) => showHiddenCategories || !hiddenCategoryIds.includes(cat.id))
                .map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    name={cat.name}
                    color={cat.color}
                    count={exercises.filter((e) => e.category_id === cat.id).length}
                    onPress={() => router.push({ pathname: "/exercises/[categoryId]", params: { categoryId: cat.id } } as never)}
                  />
                ))}
              {hiddenCategoryIds.length > 0 && (
                <TouchableOpacity
                  onPress={() => setShowHiddenCategories((v) => !v)}
                  style={{ alignSelf: "center", marginTop: 8, paddingVertical: 6, paddingHorizontal: 14 }}
                >
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>
                    {showHiddenCategories ? t("exercises:hideHiddenCategoriesMobile") : t("exercises:showHiddenCategoriesMobile", { count: hiddenCategoryIds.length })}
                  </Text>
                </TouchableOpacity>
              )}
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
            onPress={() => {
              setShowFabMenu(false);
              setNewCatName("");
              setNewCatColor(PRESET_COLORS[0]!);
              setShowCategoryOnlyModal(true);
            }}
            testID="exercises-fab-new-category"
            style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{t("exercises:fabNewCategory")}</Text>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="pricetag-outline" size={18} color="white" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setShowFabMenu(false); openCreateModal(); }}
            testID="exercises-fab-new-exercise"
            style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{t("exercises:fabNewExercise")}</Text>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="barbell-outline" size={18} color="white" />
            </View>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity
        onPress={() => setShowFabMenu((v) => !v)}
        testID="exercises-fab-add"
        style={{ position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", shadowColor: "#6366f1", shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 }}
        accessibilityLabel={showFabMenu ? t("exercises:fabMenuClose") : t("exercises:fabMenuOpen")}
      >
        <Ionicons name={showFabMenu ? "close" : "add"} size={28} color="white" />
      </TouchableOpacity>

      {/* Standalone "Nueva categoría" modal */}
      <Modal visible={showCategoryOnlyModal} animationType="fade" transparent onRequestClose={() => setShowCategoryOnlyModal(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}
          activeOpacity={1}
          onPress={() => setShowCategoryOnlyModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, gap: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>{t("exercises:newCategoryHeading")}</Text>
                <TouchableOpacity onPress={() => setShowCategoryOnlyModal(false)} accessibilityLabel={t("exercises:closeModalLabel")}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }}
                placeholder={t("exercises:newCategoryNamePlaceholder")}
                value={newCatName}
                onChangeText={setNewCatName}
                autoFocus
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
                onPress={handleCreateCategoryStandalone}
                disabled={catSaving || !newCatName.trim()}
                style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: catSaving || !newCatName.trim() ? 0.5 : 1 }}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                  {catSaving ? t("exercises:creatingButton") : t("exercises:createCategoryButton")}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Create / Edit Exercise Modal */}
      <ExerciseFormModal
        visible={showModal}
        editingExercise={editingExercise}
        categories={categories}
        onClose={() => setShowModal(false)}
        onCreateCategory={createCategory}
        onSubmit={handleExerciseSubmit}
      />

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
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>{t("exercises:categoriesModalTitleMobile")}</Text>
            <TouchableOpacity onPress={() => { setShowCatModal(false); cancelEditCat(); }} accessibilityLabel={t("exercises:closeModalLabel")}>
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
                <Text style={{ color: "#94a3b8", fontSize: 14 }}>{t("exercises:emptyCategoriesTitle")}</Text>
              </View>
            }
            renderItem={({ item: cat, drag, isActive }: RenderItemParams<typeof categories[number]>) => (
              <ScaleDecorator activeScale={1.02}>
                <View style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: isActive ? "#6366f1" : "#f1f5f9", borderRadius: 12, backgroundColor: isActive ? "#f5f3ff" : "#fff", paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
                    <TouchableOpacity onPressIn={drag} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={t("exercises:reorderCategoryLabelMobile")}>
                      <Ionicons name="menu" size={20} color={isActive ? "#6366f1" : "#94a3b8"} />
                    </TouchableOpacity>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: cat.color }} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: "#0f172a" }}>{cat.name}</Text>
                    <TouchableOpacity
                      onPress={() => editingCatId === cat.id ? cancelEditCat() : startEditCat(cat)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={editingCatId === cat.id ? t("exercises:cancelEditLabelMobile") : t("exercises:editCategoryLabelMobile")}
                    >
                      <Ionicons name={editingCatId === cat.id ? "close-outline" : "pencil-outline"} size={18} color="#94a3b8" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteCategory(cat.id, cat.name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={t("exercises:deleteCategoryTitleMobile")}
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
                          {catEditSaving ? t("exercises:savingButton") : t("exercises:saveChangesButton")}
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

/** Tarjeta de categoría (o "Favoritos") con color, nombre y número de ejercicios; navega al listado de esa categoría. */
const CategoryCard = memo(function CategoryCard({ name, color, count, onPress }: { name: string; color: string; count: number; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={onPress}
      testID={`category-card-${name}`}
      style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14, gap: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}
    >
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: "#0f172a" }}>{name}</Text>
        <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{t("exercises:exerciseCount", { count })}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
    </TouchableOpacity>
  );
});

/** Fila de ejercicio en la lista de resultados de búsqueda: nombre, tipo, estadísticas de uso y acciones (favorito, editar, eliminar). */
const ExerciseRow = memo(function ExerciseRow({
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
  const { t } = useTranslation();
  const category = categories.find((c) => c.id === ex.category_id);
  const statsLine = stats
    ? `${t("exercises:usageStats", { count: stats.workout_count })}${stats.last_used ? ` · ${formatLastUsedLabel(stats.last_used)}` : ""}`
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
          <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{t(`exercises:types.${ex.type}`)}</Text>
          {statsLine && <Text style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>{statsLine}</Text>}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <TouchableOpacity onPress={onToggleFavorite} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={ex.is_favorite ? t("exercises:favoriteRemove") : t("exercises:favoriteAdd")}>
          <Ionicons name={ex.is_favorite ? "star" : "star-outline"} size={18} color={ex.is_favorite ? "#6366f1" : "#cbd5e1"} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={t("exercises:edit")}>
          <Ionicons name="pencil-outline" size={16} color="#94a3b8" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={t("exercises:deleteExerciseTitleMobile")}>
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

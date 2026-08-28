import { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView, ScrollView, Text, View, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useExerciseStore, useWorkoutStore, filterExercises, ExerciseType, formatLastUsedLabel } from "@fitnotes/core";
import { createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import type { Category, Exercise } from "@fitnotes/core";
import { useTheme } from "../../lib/theme";
import { useRepositories } from "../../contexts/RepositoryContext";
import ExerciseFormModal, { type ExerciseFormPatch } from "../../components/ExerciseFormModal";

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
  const { t } = useTranslation();

  const categories = useExerciseStore((s) => s.categories);
  const exercises = useExerciseStore((s) => s.exercises);
  const isLoading = useExerciseStore((s) => s.isLoading);
  const loadExercises = useExerciseStore((s) => s.loadExercises);
  const addExercise = useExerciseStore((s) => s.addExercise);
  const updateExercise = useExerciseStore((s) => s.updateExercise);
  const deleteExercise = useExerciseStore((s) => s.deleteExercise);
  const toggleFavorite = useExerciseStore((s) => s.toggleFavorite);
  const addCategory = useExerciseStore((s) => s.addCategory);
  const setLoading = useExerciseStore((s) => s.setLoading);
  const activeWorkoutId = useWorkoutStore((s) => s.activeWorkout?.id);

  const [search, setSearch] = useState("");
  const [exerciseStats, setExerciseStats] = useState<Record<string, { workout_count: number; last_used: string | null }>>({});

  // Create/edit exercise modal
  const [showModal, setShowModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  const { exerciseRepo: repo, userId } = useRepositories();
  const remoteExerciseRepo = useMemo(() => createExerciseRepository(supabase), []);
  const isFavorites = categoryId === "favorites";
  const category = categories.find((c) => c.id === categoryId);

  useEffect(() => {
    if (category) navigation.setOptions({ headerTitle: category.name });
    else if (isFavorites) navigation.setOptions({ headerTitle: t("exercises:favoritesHeaderMobile") });
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
            demo_url: ex.demo_url ?? undefined,
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

  /** Abre `ExerciseFormModal` en modo creación (sin ejercicio precargado). */
  function openAddModal() {
    setEditingExercise(null);
    setShowModal(true);
  }

  /** Abre `ExerciseFormModal` en modo edición, precargado con `ex`. */
  function openEditModal(ex: Exercise) {
    setEditingExercise(ex);
    setShowModal(true);
  }

  /** Crea una categoría nueva en el repo y el store, para el selector inline del formulario de ejercicio. */
  async function createCategory(name: string, color: string): Promise<Category | null> {
    const { data, error } = await repo.createCategory({ name, color }, userId);
    if (error || !data) { Alert.alert("Error", error?.message ?? t("exercises:genericError")); return null; }
    const cat: Category = { id: data.id, name: data.name, color: data.color, order_index: data.order_index };
    addCategory(cat);
    return cat;
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

  async function handleDelete(id: string, name: string) {
    Alert.alert(t("exercises:deleteExerciseTitleMobile"), t("exercises:deleteExerciseConfirmShortMobile", { name }), [
      { text: t("common:cancel"), style: "cancel" },
      {
        text: t("common:delete"),
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
            placeholder={t("exercises:searchPlaceholderCategoryMobile")}
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
                {search ? t("exercises:noExercisesMatchMobile", { search }) : t("exercises:emptyExercisesMessageMobile")}
              </Text>
            </View>
          ) : (
            sorted.map((ex) => {
              const stats = exerciseStats[ex.id];
              const statsLine = stats
                ? `${t("exercises:usageStats", { count: stats.workout_count })}${stats.last_used ? ` · ${formatLastUsedLabel(stats.last_used)}` : ""}`
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
                      {t(`exercises:types.${ex.type}`)}
                    </Text>
                    {statsLine && <Text style={{ fontSize: 11, color: theme.textDisabled, marginTop: 2 }}>{statsLine}</Text>}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <TouchableOpacity
                      onPress={() => handleToggleFavorite(ex.id, ex.is_favorite)}
                      testID={`exercise-favorite-${ex.name}`}
                      accessibilityLabel={ex.is_favorite ? t("exercises:favoriteRemove") : t("exercises:favoriteAdd")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name={ex.is_favorite ? "star" : "star-outline"} size={18} color={ex.is_favorite ? theme.primary : theme.textDisabled} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openEditModal(ex)}
                      testID={`exercise-edit-${ex.name}`}
                      accessibilityLabel={t("exercises:edit")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="pencil-outline" size={16} color={theme.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(ex.id, ex.name)}
                      testID={`exercise-delete-${ex.name}`}
                      accessibilityLabel={t("exercises:deleteExerciseTitleMobile")}
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

      {/* Create / Edit Exercise Modal */}
      <ExerciseFormModal
        visible={showModal}
        editingExercise={editingExercise}
        categories={categories}
        defaultCategoryId={isFavorites ? categories[0]?.id : categoryId}
        onClose={() => setShowModal(false)}
        onCreateCategory={createCategory}
        onSubmit={handleExerciseSubmit}
      />
    </SafeAreaView>
  );
}

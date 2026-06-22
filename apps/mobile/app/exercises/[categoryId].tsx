import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useExerciseStore, filterExercises, ExerciseType } from "@fitnotes/core";
import { createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ExerciseCategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const navigation = useNavigation();

  const categories = useExerciseStore((s) => s.categories);
  const exercises = useExerciseStore((s) => s.exercises);
  const isLoading = useExerciseStore((s) => s.isLoading);
  const loadExercises = useExerciseStore((s) => s.loadExercises);
  const addExercise = useExerciseStore((s) => s.addExercise);
  const deleteExercise = useExerciseStore((s) => s.deleteExercise);
  const toggleFavorite = useExerciseStore((s) => s.toggleFavorite);
  const setLoading = useExerciseStore((s) => s.setLoading);

  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ExerciseType>(ExerciseType.WEIGHT_REPS);
  const debouncedSearch = useDebounce(search);

  const repo = createExerciseRepository(supabase);
  const isFavorites = categoryId === "favorites";
  const category = categories.find((c) => c.id === categoryId);

  useEffect(() => {
    if (category) navigation.setOptions({ headerTitle: category.name });
    else if (isFavorites) navigation.setOptions({ headerTitle: "Favorites" });
  }, [category, isFavorites, navigation]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) setUserId(session.user.id);
      const [catRes, exRes] = await Promise.all([
        repo.getCategories(),
        repo.getExercises(),
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
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  const categoryExercises = isFavorites
    ? exercises.filter((e) => e.is_favorite)
    : exercises.filter((e) => e.category_id === categoryId);

  const filtered = filterExercises(categoryExercises, debouncedSearch);
  const sorted = [
    ...filtered.filter((e) => e.is_favorite),
    ...filtered.filter((e) => !e.is_favorite),
  ];

  async function handleAdd() {
    if (!newName.trim()) { Alert.alert("Error", "El nombre es obligatorio"); return; }
    const { data, error } = await repo.createExercise(
      { name: newName.trim(), category_id: categoryId, type: newType, weight_unit: "kg" },
      userId
    );
    if (error) { Alert.alert("Error", error.message); return; }
    addExercise({
      id: data.id,
      name: data.name,
      category_id: data.category_id ?? "",
      type: data.type as ExerciseType,
      weight_unit: data.weight_unit as "kg" | "lb",
      is_favorite: data.is_favorite,
      created_at: data.created_at,
    });
    setNewName("");
    setShowAdd(false);
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
      {/* Search */}
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
            onPress={() => setShowAdd(true)}
            style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="add" size={22} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* Quick add form */}
      {showAdd && (
        <View style={{ marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 16, gap: 12 }}>
          <TextInput
            style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }}
            placeholder="Nombre del ejercicio"
            value={newName}
            onChangeText={setNewName}
            autoFocus
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(Object.values(ExerciseType) as ExerciseType[]).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setNewType(t)}
                style={{
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: newType === t ? "#6366f1" : "#e2e8f0",
                  backgroundColor: newType === t ? "#6366f1" : "transparent",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "500", color: newType === t ? "#fff" : "#0f172a" }}>
                  {t.replace(/_/g, " ").toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowAdd(false)}
              style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "500" }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAdd}
              style={{ flex: 1, backgroundColor: "#6366f1", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Añadir</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
            sorted.map((ex) => (
              <View
                key={ex.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#f1f5f9",
                  borderRadius: 12,
                  backgroundColor: "#fff",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#0f172a" }}>{ex.name}</Text>
                  <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                    {ex.type.replace(/_/g, " ").toLowerCase()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleToggleFavorite(ex.id, ex.is_favorite)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={ex.is_favorite ? "star" : "star-outline"} size={18} color={ex.is_favorite ? "#6366f1" : "#cbd5e1"} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(ex.id, ex.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

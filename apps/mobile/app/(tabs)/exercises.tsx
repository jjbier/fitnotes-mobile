import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useExerciseStore, filterExercises, ExerciseType } from "@fitnotes/core";
import { createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

export default function ExercisesScreen() {
  const router = useRouter();
  const categories = useExerciseStore((s) => s.categories);
  const exercises = useExerciseStore((s) => s.exercises);
  const isLoading = useExerciseStore((s) => s.isLoading);
  const loadExercises = useExerciseStore((s) => s.loadExercises);
  const toggleFavorite = useExerciseStore((s) => s.toggleFavorite);
  const setLoading = useExerciseStore((s) => s.setLoading);

  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const repo = createExerciseRepository(supabase);

  useEffect(() => {
    async function load() {
      setLoading(true);
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
  }, []);

  const filtered = filterExercises(
    selectedCategoryId
      ? exercises.filter((e) => e.category_id === selectedCategoryId)
      : exercises,
    search
  );

  const sorted = [
    ...filtered.filter((e) => e.is_favorite),
    ...filtered.filter((e) => !e.is_favorite),
  ];

  async function handleToggleFavorite(id: string, current: boolean) {
    await repo.toggleFavorite(id, !current);
    toggleFavorite(id);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Search bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc", borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search" size={16} color="#64748b" />
          <TextInput
            style={{ flex: 1, paddingVertical: 12, fontSize: 14 }}
            placeholder="Search exercises…"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}
      >
        <TouchableOpacity
          onPress={() => setSelectedCategoryId(null)}
          style={{
            borderRadius: 20,
            borderWidth: 1,
            borderColor: selectedCategoryId === null ? "#6366f1" : "#e2e8f0",
            backgroundColor: selectedCategoryId === null ? "#6366f1" : "transparent",
            paddingHorizontal: 16,
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "500", color: selectedCategoryId === null ? "#fff" : "#0f172a" }}>
            All
          </Text>
        </TouchableOpacity>

        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            onPress={() => setSelectedCategoryId(cat.id === selectedCategoryId ? null : cat.id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: selectedCategoryId === cat.id ? cat.color : "#e2e8f0",
              backgroundColor: selectedCategoryId === cat.id ? cat.color + "22" : "transparent",
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
            <Text style={{ fontSize: 13, fontWeight: "500", color: "#0f172a" }}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Exercise list */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 8 }}>
          {sorted.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <Text style={{ color: "#94a3b8", fontSize: 14 }}>
                {search ? `No exercises matching "${search}"` : "No exercises yet"}
              </Text>
            </View>
          ) : (
            sorted.map((ex) => {
              const category = categories.find((c) => c.id === ex.category_id);
              return (
                <TouchableOpacity
                  key={ex.id}
                  onPress={() => router.push(`/workout/${ex.id}`)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderWidth: 1,
                    borderColor: "#f1f5f9",
                    borderRadius: 12,
                    backgroundColor: "#fff",
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    shadowColor: "#000",
                    shadowOpacity: 0.04,
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    {category && (
                      <View style={{ width: 4, height: 36, borderRadius: 2, backgroundColor: category.color }} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: "#0f172a" }}>{ex.name}</Text>
                      <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                        {ex.type.replace("_", " × ").toLowerCase()}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleToggleFavorite(ex.id, ex.is_favorite)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={ex.is_favorite ? "star" : "star-outline"}
                      size={18}
                      color={ex.is_favorite ? "#6366f1" : "#cbd5e1"}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* FAB — navigate to category list to add */}
      <TouchableOpacity
        onPress={() => router.push("/exercises/new")}
        style={{
          position: "absolute",
          bottom: 32,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#6366f1",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#6366f1",
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

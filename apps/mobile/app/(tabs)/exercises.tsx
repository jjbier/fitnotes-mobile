import { useEffect, useState } from "react";
import {
  SafeAreaView, ScrollView, Text, View, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, KeyboardAvoidingView,
  Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useExerciseStore, filterExercises, ExerciseType } from "@fitnotes/core";
import { createExerciseRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import type { Category } from "@fitnotes/core";

const TYPE_OPTIONS: { value: ExerciseType; label: string }[] = [
  { value: ExerciseType.WEIGHT_REPS, label: "Peso × Repeticiones" },
  { value: ExerciseType.REPS_ONLY, label: "Solo repeticiones" },
  { value: ExerciseType.WEIGHT_ONLY, label: "Solo peso" },
  { value: ExerciseType.DISTANCE_TIME, label: "Distancia / Tiempo" },
  { value: ExerciseType.TIME_ONLY, label: "Solo tiempo" },
];

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

export default function ExercisesScreen() {
  const router = useRouter();
  const categories = useExerciseStore((s) => s.categories);
  const exercises = useExerciseStore((s) => s.exercises);
  const isLoading = useExerciseStore((s) => s.isLoading);
  const loadExercises = useExerciseStore((s) => s.loadExercises);
  const addExercise = useExerciseStore((s) => s.addExercise);
  const addCategory = useExerciseStore((s) => s.addCategory);
  const toggleFavorite = useExerciseStore((s) => s.toggleFavorite);
  const setLoading = useExerciseStore((s) => s.setLoading);

  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");

  // Create exercise modal
  const [showModal, setShowModal] = useState(false);
  const [exName, setExName] = useState("");
  const [exCategoryId, setExCategoryId] = useState("");
  const [exType, setExType] = useState<ExerciseType>(ExerciseType.WEIGHT_REPS);
  const [saving, setSaving] = useState(false);

  // Inline new category
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]!);
  const [catSaving, setCatSaving] = useState(false);
  const [modalCategories, setModalCategories] = useState<Category[]>([]);

  const repo = createExerciseRepository(supabase);

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
  }, []);

  function openModal() {
    const cats = useExerciseStore.getState().categories;
    setModalCategories(cats);
    setExCategoryId(cats[0]?.id ?? "");
    setExName("");
    setExType(ExerciseType.WEIGHT_REPS);
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

  async function handleCreateExercise() {
    if (!exName.trim()) { Alert.alert("Error", "El nombre es obligatorio"); return; }
    if (!exCategoryId) { Alert.alert("Error", "Selecciona o crea una categoría"); return; }
    setSaving(true);
    const { data, error } = await repo.createExercise(
      { name: exName.trim(), category_id: exCategoryId, type: exType, weight_unit: "kg" },
      userId
    );
    if (error) { Alert.alert("Error", error.message); setSaving(false); return; }
    addExercise({
      id: data.id,
      name: data.name,
      category_id: data.category_id ?? "",
      type: data.type as ExerciseType,
      weight_unit: data.weight_unit as "kg" | "lb",
      is_favorite: data.is_favorite,
      created_at: data.created_at,
    });
    setSaving(false);
    setShowModal(false);
  }

  const filtered = filterExercises(
    selectedCategoryId ? exercises.filter((e) => e.category_id === selectedCategoryId) : exercises,
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

  const selectedColor = modalCategories.find((c) => c.id === exCategoryId)?.color;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc", borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search" size={16} color="#64748b" />
          <TextInput
            style={{ flex: 1, paddingVertical: 12, fontSize: 14 }}
            placeholder="Buscar ejercicios…"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
        <TouchableOpacity
          onPress={() => setSelectedCategoryId(null)}
          style={{ borderRadius: 20, borderWidth: 1, borderColor: selectedCategoryId === null ? "#6366f1" : "#e2e8f0", backgroundColor: selectedCategoryId === null ? "#6366f1" : "transparent", paddingHorizontal: 16, paddingVertical: 6 }}
        >
          <Text style={{ fontSize: 13, fontWeight: "500", color: selectedCategoryId === null ? "#fff" : "#0f172a" }}>Todos</Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            onPress={() => setSelectedCategoryId(cat.id === selectedCategoryId ? null : cat.id)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, borderWidth: 1, borderColor: selectedCategoryId === cat.id ? cat.color : "#e2e8f0", backgroundColor: selectedCategoryId === cat.id ? cat.color + "22" : "transparent", paddingHorizontal: 12, paddingVertical: 6 }}
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
            <View style={{ paddingVertical: 40, alignItems: "center", gap: 12 }}>
              <Text style={{ color: "#94a3b8", fontSize: 14 }}>
                {search ? `Sin ejercicios que coincidan con "${search}"` : "Sin ejercicios aún"}
              </Text>
              {!search && (
                <TouchableOpacity onPress={openModal} style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}>
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Crear primer ejercicio</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            sorted.map((ex) => {
              const category = categories.find((c) => c.id === ex.category_id);
              return (
                <TouchableOpacity
                  key={ex.id}
                  onPress={() => router.push(`/workout/${ex.id}`)}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    {category && <View style={{ width: 4, height: 36, borderRadius: 2, backgroundColor: category.color }} />}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: "#0f172a" }}>{ex.name}</Text>
                      <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{ex.type.replace(/_/g, " ").toLowerCase()}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleToggleFavorite(ex.id, ex.is_favorite)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name={ex.is_favorite ? "star" : "star-outline"} size={18} color={ex.is_favorite ? "#6366f1" : "#cbd5e1"} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={openModal}
        style={{ position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", shadowColor: "#6366f1", shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 }}
      >
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>

      {/* Create Exercise Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            {/* Modal header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>Nuevo ejercicio</Text>
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
                  autoFocus
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

              {/* Submit */}
              <TouchableOpacity
                onPress={handleCreateExercise}
                disabled={saving}
                style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4, opacity: saving ? 0.6 : 1 }}
              >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                  {saving ? "Creando…" : "Crear ejercicio"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

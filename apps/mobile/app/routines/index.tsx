import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRoutineStore } from "@fitnotes/core";
import { createRoutineRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

export default function RoutinesScreen() {
  const router = useRouter();
  const routines = useRoutineStore((s) => s.routines);
  const isLoading = useRoutineStore((s) => s.isLoading);
  const loadRoutines = useRoutineStore((s) => s.loadRoutines);
  const createRoutine = useRoutineStore((s) => s.createRoutine);
  const deleteRoutine = useRoutineStore((s) => s.deleteRoutine);
  const setLoading = useRoutineStore((s) => s.setLoading);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [userId, setUserId] = useState("");

  const repo = createRoutineRepository(supabase);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
      const { data } = await repo.getRoutines();
      if (data) loadRoutines(data.map((r) => ({ id: r.id, name: r.name, notes: r.notes ?? undefined })));
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (!newName.trim()) { Alert.alert("Error", "Name is required"); return; }
    const { data, error } = await repo.createRoutine({ name: newName.trim(), notes: newNotes.trim() }, userId);
    if (error || !data) { Alert.alert("Error", error?.message ?? "Failed to create"); return; }
    createRoutine({ id: data.id, name: data.name, notes: data.notes ?? undefined });
    setNewName("");
    setNewNotes("");
    setShowCreate(false);
  }

  async function handleDelete(id: string, name: string) {
    Alert.alert("Delete routine", `Delete "${name}" and all its days?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await repo.deleteRoutine(id);
        deleteRoutine(id);
      }},
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100, gap: 10 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#0f172a", marginBottom: 4 }}>Routines</Text>

          {routines.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, padding: 32, alignItems: "center", gap: 8 }}>
              <Ionicons name="clipboard-outline" size={36} color="#94a3b8" />
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>No routines yet</Text>
              <Text style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
                Create a routine to save your favourite workout templates.
              </Text>
            </View>
          ) : (
            routines.map((r) => (
              <TouchableOpacity
                key={r.id}
                onPress={() => router.push(`/routines/${r.id}`)}
                onLongPress={() => handleDelete(r.id, r.name)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{r.name}</Text>
                  {r.notes ? <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }} numberOfLines={1}>{r.notes}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setShowCreate(true)}
        style={{ position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", shadowColor: "#6366f1", shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 }}
      >
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowCreate(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>New Routine</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }}
              placeholder="Routine name"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, height: 80, textAlignVertical: "top" }}
              placeholder="Notes (optional)"
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setShowCreate(false)} style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "500" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreate} style={{ flex: 1, backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

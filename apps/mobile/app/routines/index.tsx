import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRoutineStore } from "@fitnotes/core";
import { createRoutineRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";

export default function RoutinesScreen() {
  const router = useRouter();
  const { create } = useLocalSearchParams<{ create?: string }>();
  const routines = useRoutineStore((s) => s.routines);
  const isLoading = useRoutineStore((s) => s.isLoading);
  const loadRoutines = useRoutineStore((s) => s.loadRoutines);
  const createRoutine = useRoutineStore((s) => s.createRoutine);
  const updateRoutine = useRoutineStore((s) => s.updateRoutine);
  const deleteRoutine = useRoutineStore((s) => s.deleteRoutine);
  const setLoading = useRoutineStore((s) => s.setLoading);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [userId, setUserId] = useState("");

  // Edit routine
  const [editSource, setEditSource] = useState<{ id: string; name: string; notes: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Copy routine
  const [copySource, setCopySource] = useState<{ id: string; name: string } | null>(null);
  const [copyName, setCopyName] = useState("");
  const [copying, setCopying] = useState(false);

  const repo = createRoutineRepository(supabase);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) setUserId(session.user.id);
      const { data } = await repo.getRoutines();
      if (data) loadRoutines(data.map((r) => ({ id: r.id, name: r.name, notes: r.notes ?? undefined })));
      setLoading(false);
      if (create === "1") setShowCreate(true);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openMenu(id: string, name: string, notes: string) {
    Alert.alert(name, undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Editar", onPress: () => { setEditSource({ id, name, notes }); setEditName(name); setEditNotes(notes); } },
      { text: "Copiar", onPress: () => { setCopySource({ id, name }); setCopyName(`Copia de ${name}`); } },
      { text: "Eliminar", style: "destructive", onPress: () => confirmDelete(id, name) },
    ]);
  }

  function confirmDelete(id: string, name: string) {
    Alert.alert("Eliminar rutina", `¿Eliminar "${name}" y todos sus días?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        await repo.deleteRoutine(id);
        deleteRoutine(id);
      }},
    ]);
  }

  async function handleCreate() {
    if (!newName.trim()) { Alert.alert("Error", "El nombre es obligatorio"); return; }
    const { data, error } = await repo.createRoutine({ name: newName.trim(), notes: newNotes.trim() }, userId);
    if (error || !data) { Alert.alert("Error", error?.message ?? "Error al crear"); return; }
    createRoutine({ id: data.id, name: data.name, notes: data.notes ?? undefined });
    setNewName("");
    setNewNotes("");
    setShowCreate(false);
  }

  async function handleEdit() {
    if (!editSource || !editName.trim()) return;
    setEditSaving(true);
    const { error } = await repo.updateRoutine(editSource.id, { name: editName.trim(), notes: editNotes.trim() });
    if (error) { Alert.alert("Error", error.message); setEditSaving(false); return; }
    updateRoutine(editSource.id, { name: editName.trim(), notes: editNotes.trim() || undefined });
    setEditSaving(false);
    setEditSource(null);
  }

  async function handleCopy() {
    if (!copySource || !copyName.trim()) return;
    setCopying(true);
    const { data, error } = await repo.copyRoutine(copySource.id, copyName.trim(), userId);
    if (error || !data) { Alert.alert("Error", error?.message ?? "Error al copiar"); setCopying(false); return; }
    createRoutine({ id: data.id, name: data.name, notes: data.notes ?? undefined });
    setCopying(false);
    setCopySource(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100, gap: 10 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#0f172a", marginBottom: 4 }}>Rutinas</Text>

          {routines.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 16, padding: 32, alignItems: "center", gap: 8 }}>
              <Ionicons name="clipboard-outline" size={36} color="#94a3b8" />
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>Sin rutinas aún</Text>
              <Text style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
                Pulsa el botón + para crear tu primera rutina.
              </Text>
            </View>
          ) : (
            routines.map((r) => (
              <TouchableOpacity
                key={r.id}
                onPress={() => router.push(`/routines/${r.id}`)}
                style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 16, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, gap: 12 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{r.name}</Text>
                  {r.notes ? <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }} numberOfLines={1}>{r.notes}</Text> : null}
                </View>
                <TouchableOpacity
                  onPress={() => openMenu(r.id, r.name, r.notes ?? "")}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
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

      {/* Edit modal */}
      <Modal visible={editSource !== null} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setEditSource(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>Editar rutina</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }}
              placeholder="Nombre de la rutina"
              value={editName}
              onChangeText={setEditName}
              autoFocus
              selectTextOnFocus
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, height: 80, textAlignVertical: "top" }}
              placeholder="Notas (opcional)"
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setEditSource(null)} style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "500" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEdit}
                disabled={editSaving || !editName.trim()}
                style={{ flex: 1, backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: editSaving || !editName.trim() ? 0.6 : 1 }}
              >
                {editSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Guardar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Copy modal */}
      <Modal visible={copySource !== null} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCopySource(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>Copiar rutina</Text>
            <Text style={{ fontSize: 13, color: "#64748b" }}>Se copiarán todos los días, ejercicios y series predefinidas.</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }}
              placeholder="Nombre de la nueva rutina"
              value={copyName}
              onChangeText={setCopyName}
              autoFocus
              selectTextOnFocus
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setCopySource(null)} style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "500" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCopy}
                disabled={copying || !copyName.trim()}
                style={{ flex: 1, backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: copying || !copyName.trim() ? 0.6 : 1 }}
              >
                {copying
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Copiar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowCreate(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>Nueva rutina</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }}
              placeholder="Nombre de la rutina"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, height: 80, textAlignVertical: "top" }}
              placeholder="Notas (opcional)"
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setShowCreate(false)} style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "500" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreate} style={{ flex: 1, backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

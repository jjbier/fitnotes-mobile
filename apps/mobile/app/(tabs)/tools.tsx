import { useEffect, useMemo, useState, useCallback } from "react";
import { SafeAreaView, ScrollView, Text, View, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRoutineStore } from "@fitnotes/core";
import { createRoutineRepository } from "@fitnotes/database";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { useSyncStatus } from "../../contexts/SyncContext";
import { useRepositories } from "../../contexts/RepositoryContext";

export default function RoutinesScreen() {
  const theme = useTheme();
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

  const [editSource, setEditSource] = useState<{ id: string; name: string; notes: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [copySource, setCopySource] = useState<{ id: string; name: string } | null>(null);
  const [copyName, setCopyName] = useState("");
  const [copying, setCopying] = useState(false);

  const [menuTarget, setMenuTarget] = useState<{ id: string; name: string; notes: string } | null>(null);

  const [routineStats, setRoutineStats] = useState<Record<string, { lastUsed: string | null; sessionCount: number }>>({});

  const { routineRepo: repo, userId } = useRepositories();
  const remoteRoutineRepo = useMemo(() => createRoutineRepository(supabase), []);
  const { refetchSignal } = useSyncStatus();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await repo.getRoutines();
    if (data) {
      loadRoutines(data.map((r) => ({ id: r.id, name: r.name, notes: r.notes ?? undefined })));
      const ids = data.map((r) => r.id);
      const { data: stats } = await remoteRoutineRepo.getRoutineStats(ids);
      const statsMap: Record<string, { lastUsed: string | null; sessionCount: number }> = {};
      for (const s of stats) statsMap[s.routineId] = { lastUsed: s.lastUsed, sessionCount: s.sessionCount };
      setRoutineStats(statsMap);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, remoteRoutineRepo]);

  useEffect(() => {
    load().then(() => {
      if (create === "1") setShowCreate(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refetchSignal === 0) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchSignal]);

  // Nota: Alert.alert en Android solo soporta 3 botones (positive/negative/
  // neutral) — con 4 botones (Cancelar/Editar/Copiar/Eliminar) el 4º se
  // descartaba en silencio y "Eliminar" nunca aparecía. Usamos un Modal propio.
  function openMenu(id: string, name: string, notes: string) {
    setMenuTarget({ id, name, notes });
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100, gap: 10 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: theme.text, marginBottom: 4 }}>Rutinas</Text>

          {routines.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: theme.border, borderStyle: "dashed", borderRadius: 16, padding: 32, alignItems: "center", gap: 8 }}>
              <Ionicons name="clipboard-outline" size={36} color={theme.textMuted} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>Sin rutinas aún</Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: "center" }}>
                Pulsa el botón + para crear tu primera rutina.
              </Text>
            </View>
          ) : (
            routines.map((r) => (
              <TouchableOpacity
                key={r.id}
                onPress={() => router.push(`/routines/${r.id}`)}
                style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: theme.borderLight, borderRadius: 16, backgroundColor: theme.surfaceCard, paddingHorizontal: 16, paddingVertical: 14, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, gap: 12 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{r.name}</Text>
                  {r.notes ? <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }} numberOfLines={1}>{r.notes}</Text> : null}
                  {(() => {
                    const s = routineStats[r.id];
                    if (!s) return null;
                    const parts: string[] = [];
                    if (s.sessionCount > 0) parts.push(`${s.sessionCount} sesión${s.sessionCount !== 1 ? "es" : ""}`);
                    if (s.lastUsed) {
                      const days = Math.floor((Date.now() - new Date(s.lastUsed).getTime()) / 86400000);
                      parts.push(days === 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`);
                    }
                    if (parts.length === 0) return null;
                    return <Text style={{ fontSize: 11, color: theme.primary, marginTop: 3 }}>{parts.join(" · ")}</Text>;
                  })()}
                </View>
                <TouchableOpacity
                  testID={`routine-menu-${r.name}`}
                  onPress={() => openMenu(r.id, r.name, r.notes ?? "")}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
                  accessibilityLabel={`Opciones de ${r.name}`}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={theme.textMuted} />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={16} color={theme.textDisabled} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        testID="routine-fab-add"
        onPress={() => setShowCreate(true)}
        accessibilityLabel="Nueva rutina"
        style={{ position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center", shadowColor: theme.primary, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 }}
      >
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>

      {/* Menú de acciones de la rutina (Editar/Copiar/Eliminar) */}
      <Modal
        visible={menuTarget !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuTarget(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setMenuTarget(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
        >
          <View style={{ backgroundColor: theme.surfaceCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 32 }}>
            {menuTarget && (
              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textMuted, textAlign: "center", paddingVertical: 10 }}>
                {menuTarget.name}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => {
                if (!menuTarget) return;
                setEditSource(menuTarget);
                setEditName(menuTarget.name);
                setEditNotes(menuTarget.notes);
                setMenuTarget(null);
              }}
              style={{ paddingVertical: 16, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Ionicons name="create-outline" size={20} color={theme.text} />
              <Text style={{ fontSize: 15, color: theme.text }}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!menuTarget) return;
                setCopySource(menuTarget);
                setCopyName(`Copia de ${menuTarget.name}`);
                setMenuTarget(null);
              }}
              style={{ paddingVertical: 16, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Ionicons name="copy-outline" size={20} color={theme.text} />
              <Text style={{ fontSize: 15, color: theme.text }}>Copiar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!menuTarget) return;
                const { id, name } = menuTarget;
                setMenuTarget(null);
                confirmDelete(id, name);
              }}
              style={{ paddingVertical: 16, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Ionicons name="trash-outline" size={20} color={theme.danger} />
              <Text style={{ fontSize: 15, color: theme.danger }}>Eliminar</Text>
            </TouchableOpacity>
            <View style={{ height: 1, backgroundColor: theme.borderLight, marginVertical: 4 }} />
            <TouchableOpacity
              onPress={() => setMenuTarget(null)}
              style={{ paddingVertical: 16, paddingHorizontal: 24, alignItems: "center" }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: theme.textMuted }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit modal */}
      <Modal visible={editSource !== null} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setEditSource(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={{ padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Editar rutina</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.text, backgroundColor: theme.inputBg }}
              placeholder="Nombre de la rutina"
              placeholderTextColor={theme.textMuted}
              value={editName}
              onChangeText={setEditName}
              autoFocus
              selectTextOnFocus
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, height: 80, textAlignVertical: "top", color: theme.text, backgroundColor: theme.inputBg }}
              placeholder="Notas (opcional)"
              placeholderTextColor={theme.textMuted}
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setEditSource(null)} style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: theme.text }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEdit}
                disabled={editSaving || !editName.trim()}
                style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: editSaving || !editName.trim() ? 0.6 : 1 }}
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
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={{ padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Copiar rutina</Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary }}>Se copiarán todos los días, ejercicios y series predefinidas.</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.text, backgroundColor: theme.inputBg }}
              placeholder="Nombre de la nueva rutina"
              placeholderTextColor={theme.textMuted}
              value={copyName}
              onChangeText={setCopyName}
              autoFocus
              selectTextOnFocus
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setCopySource(null)} style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: theme.text }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCopy}
                disabled={copying || !copyName.trim()}
                style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: copying || !copyName.trim() ? 0.6 : 1 }}
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
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={{ padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Nueva rutina</Text>
            <TextInput
              testID="routine-name-input"
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.text, backgroundColor: theme.inputBg }}
              placeholder="Nombre de la rutina"
              placeholderTextColor={theme.textMuted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, height: 80, textAlignVertical: "top", color: theme.text, backgroundColor: theme.inputBg }}
              placeholder="Notas (opcional)"
              placeholderTextColor={theme.textMuted}
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setShowCreate(false)} style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: theme.text }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="routine-create-submit" onPress={handleCreate} style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

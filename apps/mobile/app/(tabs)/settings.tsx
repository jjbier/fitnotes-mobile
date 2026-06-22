import { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

export default function SettingsScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [signOutLoading, setSignOutLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      setEmail(session.user.email ?? "");
      setDisplayName((session.user.user_metadata?.display_name as string | undefined) ?? "");
      setWeightUnit((session.user.user_metadata?.weight_unit as "kg" | "lb" | undefined) ?? "kg");
    });
  }, []);

  async function handleWeightUnitChange(unit: "kg" | "lb") {
    setWeightUnit(unit);
    await supabase.auth.updateUser({ data: { weight_unit: unit } });
  }

  async function handleSave() {
    setSaveStatus("saving");
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    });
    setSaveStatus(error ? "error" : "saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  async function handleSignOut() {
    Alert.alert("Cerrar sesión", "¿Estás seguro de que quieres cerrar sesión?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          setSignOutLoading(true);
          await supabase.auth.signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Configuración</Text>

        {/* Profile */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Perfil</Text>
          {email ? <Text style={styles.emailText}>{email}</Text> : null}
          <Text style={styles.label}>Nombre visible</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Tu nombre"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />
          <TouchableOpacity
            onPress={handleSave}
            disabled={saveStatus === "saving"}
            style={[styles.btn, styles.btnPrimary]}
          >
            <Text style={styles.btnPrimaryText}>
              {saveStatus === "saving" ? "Guardando…" : saveStatus === "saved" ? "¡Guardado!" : saveStatus === "error" ? "Error — intentar de nuevo" : "Guardar cambios"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferencias</Text>
          <View style={styles.prefRow}>
            <View>
              <Text style={styles.prefLabel}>Unidad de peso por defecto</Text>
              <Text style={styles.prefSub}>Usada en toda la app</Text>
            </View>
            <View style={styles.unitToggle}>
              <TouchableOpacity
                onPress={() => handleWeightUnitChange("kg")}
                style={[styles.unitBtn, weightUnit === "kg" && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, weightUnit === "kg" && styles.unitBtnTextActive]}>kg</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleWeightUnitChange("lb")}
                style={[styles.unitBtn, weightUnit === "lb" && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, weightUnit === "lb" && styles.unitBtnTextActive]}>lb</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Health */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Salud</Text>
          <TouchableOpacity
            onPress={() => router.push("/body-tracker")}
            style={[styles.btn, styles.btnOutline]}
          >
            <Ionicons name="body-outline" size={16} color="#64748b" />
            <Text style={styles.btnOutlineText}>Medidas corporales</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <TouchableOpacity
            onPress={handleSignOut}
            disabled={signOutLoading}
            style={[styles.btn, styles.btnOutline]}
          >
            {signOutLoading ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={16} color="#64748b" />
                <Text style={styles.btnOutlineText}>Cerrar sesión</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={[styles.sectionTitle, { color: "#ef4444" }]}>Zona de peligro</Text>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Eliminar cuenta",
                "Esto eliminará permanentemente todos tus datos. Esta acción no se puede deshacer.",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Eliminar",
                    style: "destructive",
                    onPress: async () => {
                      const { error } = await supabase.rpc("delete_user");
                      if (error) { Alert.alert("Error", error.message); return; }
                      await supabase.auth.signOut();
                      router.replace("/(auth)/login");
                    },
                  },
                ]
              )
            }
            style={[styles.btn, styles.btnDanger]}
          >
            <Text style={styles.btnDangerText}>Eliminar cuenta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 60, gap: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  section: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, padding: 18, gap: 10 },
  dangerSection: { borderColor: "#fecaca" },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  emailText: { fontSize: 13, color: "#64748b" },
  label: { fontSize: 12, fontWeight: "500", color: "#64748b" },
  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0f172a" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  btnPrimary: { backgroundColor: "#6366f1" },
  btnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  btnOutline: { borderWidth: 1, borderColor: "#e2e8f0" },
  btnOutlineText: { color: "#64748b", fontSize: 14, fontWeight: "500" },
  btnDanger: { borderWidth: 1, borderColor: "#ef4444" },
  btnDangerText: { color: "#ef4444", fontSize: 14, fontWeight: "500" },
  prefRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  prefLabel: { fontSize: 13, fontWeight: "500", color: "#0f172a" },
  prefSub: { fontSize: 11, color: "#94a3b8", marginTop: 1 },
  unitToggle: { flexDirection: "row", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, overflow: "hidden" },
  unitBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  unitBtnActive: { backgroundColor: "#6366f1" },
  unitBtnText: { fontSize: 13, fontWeight: "500", color: "#64748b" },
  unitBtnTextActive: { color: "#fff" },
});

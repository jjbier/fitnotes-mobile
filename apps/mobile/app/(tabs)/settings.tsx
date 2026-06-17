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
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");
      setDisplayName((user.user_metadata?.display_name as string | undefined) ?? "");
    });
  }, []);

  async function handleSave() {
    setSaveStatus("saving");
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    });
    setSaveStatus(error ? "error" : "saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  async function handleSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
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
        <Text style={styles.title}>Settings</Text>

        {/* Profile */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          {email ? <Text style={styles.emailText}>{email}</Text> : null}
          <Text style={styles.label}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />
          <TouchableOpacity
            onPress={handleSave}
            disabled={saveStatus === "saving"}
            style={[styles.btn, styles.btnPrimary]}
          >
            <Text style={styles.btnPrimaryText}>
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved!" : saveStatus === "error" ? "Error — try again" : "Save changes"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.prefRow}>
            <View>
              <Text style={styles.prefLabel}>Default weight unit</Text>
              <Text style={styles.prefSub}>Used across the app</Text>
            </View>
            <View style={styles.unitToggle}>
              <TouchableOpacity
                onPress={() => setWeightUnit("kg")}
                style={[styles.unitBtn, weightUnit === "kg" && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, weightUnit === "kg" && styles.unitBtnTextActive]}>kg</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setWeightUnit("lb")}
                style={[styles.unitBtn, weightUnit === "lb" && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, weightUnit === "lb" && styles.unitBtnTextActive]}>lb</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
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
                <Text style={styles.btnOutlineText}>Sign out</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={[styles.sectionTitle, { color: "#ef4444" }]}>Danger Zone</Text>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Delete account",
                "This will permanently delete all your data. This cannot be undone.",
                [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive" }]
              )
            }
            style={[styles.btn, styles.btnDanger]}
          >
            <Text style={styles.btnDangerText}>Delete account</Text>
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

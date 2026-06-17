import { useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TextInput, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email || !password) { Alert.alert("Error", "Please fill in all fields"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { Alert.alert("Sign in failed", error.message); return; }
    router.replace("/(tabs)");
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>🏋️</Text>
          <Text style={{ fontSize: 26, fontWeight: "700", color: "#0f172a" }}>FitNotes</Text>
          <Text style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>Sign in to continue</Text>
        </View>

        <View style={{ gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#0f172a" }}>Email</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#f8fafc", paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 }}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#0f172a" }}>Password</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#f8fafc", paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 }}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
            />
          </View>

          <TouchableOpacity
            onPress={handleSignIn}
            disabled={loading}
            style={{ marginTop: 8, backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: loading ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
              {loading ? "Signing in…" : "Sign in"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ textAlign: "center", fontSize: 14, color: "#64748b", marginTop: 32 }}>
          No account?{" "}
          <Text
            style={{ color: "#6366f1", fontWeight: "500" }}
            onPress={() => router.push("/(auth)/register")}
          >
            Create one
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

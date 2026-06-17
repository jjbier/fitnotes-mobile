import { useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TextInput, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function RegisterScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSignUp() {
    if (!email || !password || !confirm) { Alert.alert("Error", "Please fill in all fields"); return; }
    if (password !== confirm) { Alert.alert("Error", "Passwords do not match"); return; }
    if (password.length < 8) { Alert.alert("Error", "Password must be at least 8 characters"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) { Alert.alert("Registration failed", error.message); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={{ fontSize: 48 }}>📬</Text>
        <Text style={{ fontSize: 22, fontWeight: "700", marginTop: 16, color: "#0f172a" }}>Check your email</Text>
        <Text style={{ textAlign: "center", color: "#64748b", marginTop: 8 }}>
          We sent a confirmation link to {email}. Click it to activate your account.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          style={{ marginTop: 24, backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Go to sign in</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>🏋️</Text>
          <Text style={{ fontSize: 26, fontWeight: "700", color: "#0f172a" }}>Create account</Text>
          <Text style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>Start your fitness journey</Text>
        </View>

        <View style={{ gap: 16 }}>
          {[
            { label: "Email", value: email, onChange: setEmail, placeholder: "you@example.com", keyboard: "email-address" as const, secure: false, complete: "email" as const },
            { label: "Password", value: password, onChange: setPassword, placeholder: "Min 8 characters", keyboard: "default" as const, secure: true, complete: "new-password" as const },
            { label: "Confirm password", value: confirm, onChange: setConfirm, placeholder: "Repeat password", keyboard: "default" as const, secure: true, complete: "new-password" as const },
          ].map(({ label, value, onChange, placeholder, keyboard, secure, complete }) => (
            <View key={label} style={{ gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: "#0f172a" }}>{label}</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#f8fafc", paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 }}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                keyboardType={keyboard}
                autoCapitalize="none"
                secureTextEntry={secure}
                autoComplete={complete}
              />
            </View>
          ))}

          <TouchableOpacity
            onPress={handleSignUp}
            disabled={loading}
            style={{ marginTop: 8, backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: loading ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
              {loading ? "Creating account…" : "Create account"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ textAlign: "center", fontSize: 14, color: "#64748b", marginTop: 32 }}>
          Already have an account?{" "}
          <Text
            style={{ color: "#6366f1", fontWeight: "500" }}
            onPress={() => router.push("/(auth)/login")}
          >
            Sign in
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

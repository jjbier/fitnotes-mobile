import { useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TextInput, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email || !password) { Alert.alert("Error", "Por favor, completa todos los campos"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { Alert.alert("Error al iniciar sesión", error.message); return; }
    router.replace("/(tabs)");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>🏋️</Text>
          <Text style={{ fontSize: 26, fontWeight: "700", color: theme.text }}>FitNotes</Text>
          <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 4 }}>Inicia sesión para continuar</Text>
        </View>

        <View style={{ gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: theme.text }}>Correo electrónico</Text>
            <TextInput
              testID="login-email-input"
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.inputBg, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: theme.text }}
              value={email}
              onChangeText={setEmail}
              placeholder="tu@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: theme.text }}>Contraseña</Text>
            <TextInput
              testID="login-password-input"
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.inputBg, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: theme.text }}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
            />
          </View>

          <TouchableOpacity
            testID="login-submit-button"
            onPress={handleSignIn}
            disabled={loading}
            style={{ marginTop: 8, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: loading ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
              {loading ? "Iniciando sesión…" : "Iniciar sesión"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ textAlign: "center", fontSize: 14, color: theme.textSecondary, marginTop: 32 }}>
          ¿Sin cuenta?{" "}
          <Text
            style={{ color: theme.primary, fontWeight: "500" }}
            onPress={() => router.push("/(auth)/register")}
          >
            Créate una
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

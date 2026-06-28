import { useState } from "react";
import { SafeAreaView, ScrollView, Text, View, TextInput, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

export default function RegisterScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSignUp() {
    if (!email || !password || !confirm) { Alert.alert("Error", "Por favor, completa todos los campos"); return; }
    if (password !== confirm) { Alert.alert("Error", "Las contraseñas no coinciden"); return; }
    if (password.length < 8) { Alert.alert("Error", "La contraseña debe tener al menos 8 caracteres"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) { Alert.alert("Error al registrarse", error.message); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={{ fontSize: 48 }}>📬</Text>
        <Text style={{ fontSize: 22, fontWeight: "700", marginTop: 16, color: theme.text }}>Revisa tu correo</Text>
        <Text style={{ textAlign: "center", color: theme.textSecondary, marginTop: 8 }}>
          Hemos enviado un enlace de confirmación a {email}. Haz clic en él para activar tu cuenta.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          style={{ marginTop: 24, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Ir a iniciar sesión</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>🏋️</Text>
          <Text style={{ fontSize: 26, fontWeight: "700", color: theme.text }}>Crear cuenta</Text>
          <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 4 }}>Empieza tu camino fitness</Text>
        </View>

        <View style={{ gap: 16 }}>
          {[
            { label: "Correo electrónico", value: email, onChange: setEmail, placeholder: "tu@ejemplo.com", keyboard: "email-address" as const, secure: false, complete: "email" as const },
            { label: "Contraseña", value: password, onChange: setPassword, placeholder: "Mín. 8 caracteres", keyboard: "default" as const, secure: true, complete: "new-password" as const },
            { label: "Confirmar contraseña", value: confirm, onChange: setConfirm, placeholder: "Repite la contraseña", keyboard: "default" as const, secure: true, complete: "new-password" as const },
          ].map(({ label, value, onChange, placeholder, keyboard, secure, complete }) => (
            <View key={label} style={{ gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: theme.text }}>{label}</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.inputBg, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: theme.text }}
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
            style={{ marginTop: 8, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: loading ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
              {loading ? "Creando cuenta…" : "Crear cuenta"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ textAlign: "center", fontSize: 14, color: theme.textSecondary, marginTop: 32 }}>
          ¿Ya tienes cuenta?{" "}
          <Text
            style={{ color: theme.primary, fontWeight: "500" }}
            onPress={() => router.push("/(auth)/login")}
          >
            Iniciar sesión
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

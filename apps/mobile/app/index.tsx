import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function LandingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Ionicons name="barbell-outline" size={48} color="#ffffff" />
        </View>

        {/* Title */}
        <Text style={styles.title}>FitNotes App</Text>
        <Text style={styles.subtitle}>
          Track your workouts, PRs and progress — all in one place.
        </Text>

        {/* CTA buttons */}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={styles.primaryButtonText}>Iniciar sesión</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push("/(auth)/register")}
          >
            <Text style={styles.secondaryButtonText}>Registrarse</Text>
          </TouchableOpacity>
        </View>

        {/* Feature bullets */}
        <View style={styles.features}>
          {[
            "Workout logging with sets, reps and weight",
            "Personal records tracked automatically",
            "Progress charts and body tracker",
          ].map((feature) => (
            <Text key={feature} style={styles.featureItem}>
              • {feature}
            </Text>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 20,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 24,
  },
  buttons: {
    width: "100%",
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "600",
  },
  features: {
    gap: 6,
    marginTop: 8,
  },
  featureItem: {
    fontSize: 13,
    color: "#94a3b8",
    textAlign: "center",
  },
});

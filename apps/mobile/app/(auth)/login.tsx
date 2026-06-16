/**
 * Login screen
 *
 * TODO:
 *  - Wire up email + password form to supabase.auth.signInWithPassword
 *  - Add magic link option via supabase.auth.signInWithOtp
 *  - Show loading state during sign-in
 *  - Navigate to (tabs) on success
 */

import { SafeAreaView, ScrollView, Text, View, TextInput, TouchableOpacity } from "react-native";

export default function LoginScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        contentContainerClassName="flex-1 justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-10">
          <Text className="text-4xl mb-2">🏋️</Text>
          <Text className="text-2xl font-bold text-foreground">FitNotes</Text>
          <Text className="text-sm text-muted-foreground mt-1">Sign in to continue</Text>
        </View>

        <View className="gap-4">
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-foreground">Email</Text>
            <TextInput
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm"
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium text-foreground">Password</Text>
            <TextInput
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm"
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
            />
          </View>

          {/* TODO: wire to supabase.auth.signInWithPassword */}
          <TouchableOpacity className="mt-2 w-full rounded-xl bg-primary py-4 items-center">
            <Text className="text-white font-semibold text-sm">Sign in</Text>
          </TouchableOpacity>

          <View className="flex-row items-center gap-3 my-2">
            <View className="flex-1 h-px bg-gray-200" />
            <Text className="text-xs text-muted-foreground uppercase">or</Text>
            <View className="flex-1 h-px bg-gray-200" />
          </View>

          {/* TODO: wire to supabase.auth.signInWithOtp */}
          <TouchableOpacity className="w-full rounded-xl border border-gray-200 py-4 items-center">
            <Text className="text-sm font-medium text-foreground">Send magic link</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-center text-sm text-muted-foreground mt-8">
          No account?{" "}
          {/* TODO: router.push("/(auth)/register") */}
          <Text className="text-primary font-medium">Create one</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

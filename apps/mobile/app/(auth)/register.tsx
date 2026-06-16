/**
 * Register screen
 *
 * TODO:
 *  - Wire up form to supabase.auth.signUp
 *  - Validate with createBodyMeasurementEntryInputSchema from @fitnotes/core
 *  - Confirm password field
 *  - Show email confirmation message after sign-up
 */

import { SafeAreaView, ScrollView, Text, View, TextInput, TouchableOpacity } from "react-native";

export default function RegisterScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        contentContainerClassName="flex-1 justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-10">
          <Text className="text-4xl mb-2">🏋️</Text>
          <Text className="text-2xl font-bold">Create account</Text>
          <Text className="text-sm text-muted-foreground mt-1">
            Start your fitness journey
          </Text>
        </View>

        <View className="gap-4">
          <View className="gap-1.5">
            <Text className="text-sm font-medium">Email</Text>
            <TextInput
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm"
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium">Password</Text>
            <TextInput
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm"
              placeholder="Min 8 characters"
              secureTextEntry
              autoComplete="new-password"
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium">Confirm password</Text>
            <TextInput
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm"
              placeholder="Repeat password"
              secureTextEntry
              autoComplete="new-password"
            />
          </View>

          {/* TODO: wire to supabase.auth.signUp */}
          <TouchableOpacity className="mt-2 w-full rounded-xl bg-primary py-4 items-center">
            <Text className="text-white font-semibold text-sm">Create account</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-center text-sm text-muted-foreground mt-8">
          Already have an account?{" "}
          {/* TODO: router.push("/(auth)/login") */}
          <Text className="text-primary font-medium">Sign in</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

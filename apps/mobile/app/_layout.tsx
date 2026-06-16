/**
 * Root layout
 *
 * TODO:
 *  - Load custom fonts with expo-font (Inter)
 *  - Hide splash screen once fonts are ready
 *  - Check Supabase session and redirect to (auth) if not authenticated
 *  - Initialize expo-sqlite database schema
 */

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "../global.css";

export default function RootLayout() {
  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="workout/[exerciseId]"
          options={{
            presentation: "fullScreenModal",
            headerTitle: "Training",
            headerBackTitle: "Back",
          }}
        />
        <Stack.Screen
          name="routines/index"
          options={{ headerTitle: "Routines" }}
        />
        <Stack.Screen
          name="routines/[id]"
          options={{ headerTitle: "Routine" }}
        />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

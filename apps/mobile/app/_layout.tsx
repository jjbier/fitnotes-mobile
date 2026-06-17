import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRouter, useSegments } from "expo-router";
import "../global.css";
import { supabase } from "../lib/supabase";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const inAuthGroup = segments[0] === "(auth)";
      const inTabsGroup = segments[0] === "(tabs)";

      if (session && !inTabsGroup) {
        router.replace("/(tabs)");
      } else if (!session && !inAuthGroup && segments[0] !== undefined && segments[0] !== "index") {
        router.replace("/(auth)/login");
      }
      setInitialized(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!initialized) return;
      if (session) {
        router.replace("/(tabs)");
      } else {
        router.replace("/(auth)/login");
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <Stack.Screen name="exercises/[categoryId]" options={{ headerTitle: "Exercises" }} />
        <Stack.Screen name="routines/index" options={{ headerTitle: "Routines" }} />
        <Stack.Screen name="routines/[id]" options={{ headerTitle: "Routine" }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

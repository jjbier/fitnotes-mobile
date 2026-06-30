import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, View, Text, ActivityIndicator, StyleSheet } from "react-native";
import type { AppStateStatus } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRouter, useSegments } from "expo-router";
import "../global.css";
import { supabase } from "../lib/supabase";
import { syncEngine, persistSyncQueue } from "../lib/sync";
import { SyncContext } from "../contexts/SyncContext";
import type { SyncStatus } from "@fitnotes/database";
import { useExerciseStore, useRoutineStore, ExerciseType } from "@fitnotes/core";
import { createExerciseRepository, createRoutineRepository } from "@fitnotes/database";

const styles = StyleSheet.create({
  syncBanner: {
    position: "absolute",
    bottom: 72,
    left: 16,
    right: 16,
    backgroundColor: "#6366f1",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 999,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  syncBannerError: {
    backgroundColor: "#ef4444",
  },
  syncBannerText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "500",
  },
});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [initialized, setInitialized] = useState(false);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [refetchSignal, setRefetchSignal] = useState(0);
  const appState = useRef(AppState.currentState);

  // Store actions for targeted updates after sync
  const loadExercises = useExerciseStore((s) => s.loadExercises);
  const loadRoutines = useRoutineStore((s) => s.loadRoutines);
  const exerciseRepo = useMemo(() => createExerciseRepository(supabase), []);
  const routineRepo = useMemo(() => createRoutineRepository(supabase), []);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const inAuthGroup = segments[0] === "(auth)";
      const inTabsGroup = segments[0] === "(tabs)";

      if (session && !inTabsGroup) {
        router.replace("/(tabs)");
      } else if (!session && !inAuthGroup && segments[0] !== undefined) {
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

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        setSyncStatus("syncing");
        try {
          const result = await syncEngine.sync(lastSyncAt ?? undefined);
          setSyncStatus("idle");
          setLastSyncAt(new Date().toISOString());
          setPendingCount(syncEngine.getPendingCount());
          void persistSyncQueue();

          const ct = result.changedTables;

          // Refresh exercise/routine stores directly so all screens see new data
          if (ct.has("exercises") || ct.has("categories")) {
            const [catRes, exRes] = await Promise.all([
              exerciseRepo.getCategories(),
              exerciseRepo.getExercises(),
            ]);
            if (catRes.data && exRes.data) {
              loadExercises(
                catRes.data,
                exRes.data.map((ex) => ({
                  id: ex.id,
                  name: ex.name,
                  category_id: ex.category_id ?? "",
                  type: ex.type as ExerciseType,
                  weight_unit: (ex.weight_unit as "kg" | "lb"),
                  notes: ex.notes ?? undefined,
                  is_favorite: ex.is_favorite,
                  created_at: ex.created_at,
                  weight_increment: ex.weight_increment ?? undefined,
                  default_rest_seconds: ex.default_rest_seconds ?? undefined,
                  default_chart: (ex.default_chart ?? "weight") as "weight" | "volume" | "reps",
                }))
              );
            }
          }

          if (ct.has("routines") || ct.has("routine_days") || ct.has("routine_day_exercises")) {
            const { data } = await routineRepo.getRoutines();
            if (data) {
              loadRoutines(data.map((r) => ({ id: r.id, name: r.name, notes: r.notes ?? undefined })));
            }
          }

          // Workout data is tab-scoped — refetchSignal triggers re-queries in index/calendar
          if (ct.has("workouts") || ct.has("workout_exercises") || ct.has("sets")) {
            setRefetchSignal((n) => n + 1);
          }
        } catch {
          setSyncStatus("error");
        }
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncAt]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SyncContext.Provider value={{ status: syncStatus, pendingCount, lastSyncAt, refetchSignal }}>
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
          <Stack.Screen name="routines/[id]" options={{ headerTitle: "Routine" }} />
          <Stack.Screen name="body-tracker/index" options={{ headerTitle: "Medidas corporales" }} />
          <Stack.Screen name="search/index" options={{ headerShown: false }} />
        </Stack>
        {syncStatus !== "idle" && (
          <View style={[styles.syncBanner, syncStatus === "error" && styles.syncBannerError]}>
            {syncStatus === "syncing" && <ActivityIndicator size="small" color="#ffffff" />}
            <Text style={styles.syncBannerText}>
              {syncStatus === "syncing" ? "Sincronizando..." : "Error de sincronización"}
            </Text>
          </View>
        )}
        <StatusBar style="auto" />
      </SyncContext.Provider>
    </GestureHandlerRootView>
  );
}

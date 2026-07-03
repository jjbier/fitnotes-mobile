import "../lib/cryptoPolyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View, Text, ActivityIndicator, StyleSheet } from "react-native";
import type { AppStateStatus } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRouter, useSegments } from "expo-router";
import "../global.css";
import { supabase } from "../lib/supabase";
import { getSyncEngine } from "../lib/sync";
import { useNetworkStatus } from "../lib/netinfo";
import { SyncContext } from "../contexts/SyncContext";
import type { SyncStatus } from "@fitnotes/database";
import { useExerciseStore, useRoutineStore, usePreferencesStore, ExerciseType, type UserPreferences } from "@fitnotes/core";
import {
  createLocalExerciseRepository,
  createLocalRoutineRepository,
  createLocalPreferencesRepository,
  claimGuestIdentity,
  setActiveIdentity,
} from "@fitnotes/database";
import { useThemeModeStore, type ThemeMode } from "../lib/theme";
import type { Session } from "@supabase/supabase-js";
import { RepositoryProvider, useRepositories } from "../contexts/RepositoryContext";
import { getLocalDb } from "../lib/db/client";

// Claves de UserPreferences que también viven en `user_metadata` de Supabase
// (mecanismo de sync entre dispositivos para cuentas reales — ver localPreferencesRepository).
const METADATA_PREFERENCE_KEYS = [
  "theme_preference",
  "display_name",
  "weight_unit",
  "default_weight_increment",
  "calendar_week_start",
  "auto_select_next_set",
  "track_personal_records",
  "mark_sets_complete",
  "default_rest_seconds",
  "rest_timer_sound_enabled",
  "rest_timer_volume",
  "estimated_records_rep_limit",
  "show_set_count_home",
  "hidden_category_ids",
  "calendar_show_day_panel",
  "calendar_show_category_dots",
] as const satisfies readonly (keyof UserPreferences)[];

// En modo invitado no hay `user_metadata` que leer — la tabla local (ya
// hidratada por RepositoryContext) sigue siendo el fallback y no se toca.
// Con cuenta real, el valor remoto gana sobre el local (refleja cambios
// hechos desde otro dispositivo) y se persiste local para futuras lecturas.
async function hydratePreferencesFromSession(session: Session | null) {
  if (!session) return;
  const metadata = session.user.user_metadata as Record<string, unknown> | undefined;
  if (!metadata) return;

  const remoteSubset: Partial<UserPreferences> = {};
  for (const key of METADATA_PREFERENCE_KEYS) {
    if (metadata[key] !== undefined) {
      (remoteSubset as Record<string, unknown>)[key] = metadata[key];
    }
  }
  if (metadata.theme_preference !== undefined) {
    useThemeModeStore.getState().setMode(metadata.theme_preference as ThemeMode);
  }
  if (Object.keys(remoteSubset).length === 0) return;

  const db = await getLocalDb();
  await createLocalPreferencesRepository(db).setMany(remoteSubset);
  usePreferencesStore.getState().loadPreferences(remoteSubset);
}

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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RepositoryProvider>
        <AppContent />
      </RepositoryProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const router = useRouter();
  const segments = useSegments();
  const [initialized, setInitialized] = useState(false);
  const { userId, isGuest, refreshIdentity, wipeAndSetIdentity } = useRepositories();

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [refetchSignal, setRefetchSignal] = useState(0);
  const appState = useRef(AppState.currentState);
  const isConnected = useNetworkStatus();
  const wasConnected = useRef<boolean | null>(null);

  // Store actions for targeted updates after sync
  const loadExercises = useExerciseStore((s) => s.loadExercises);
  const loadRoutines = useRoutineStore((s) => s.loadRoutines);

  const runSync = useCallback(async () => {
    if (isGuest) return; // sin cuenta real todavía — RLS/FK de Supabase rechazarían el push
    setSyncStatus("syncing");
    try {
      const engine = await getSyncEngine();
      const result = await engine.sync(userId);
      setSyncStatus(result.pushFailed > 0 ? "error" : "idle");
      setLastSyncAt(new Date().toISOString());
      setPendingCount(await engine.getPendingCount());

      const ct = result.changedTables;

      // Refresh exercise/routine stores directly so all screens see new data.
      // applyRemoteRows ya dejó los datos pulled en SQLite local durante el
      // sync — leemos de ahí en vez de volver a pedirlos a Supabase.
      if (ct.has("exercises") || ct.has("categories")) {
        const db = await getLocalDb();
        const exerciseRepo = createLocalExerciseRepository(db);
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
        const db = await getLocalDb();
        const routineRepo = createLocalRoutineRepository(db);
        const { data } = await routineRepo.getRoutines();
        if (data) {
          loadRoutines(data.map((r) => ({ id: r.id, name: r.name, notes: r.notes ?? undefined })));
        }
      }

      // Los entrenamientos ya viven en local — refetchSignal fuerza a las
      // pantallas a releer de ahí (applyRemoteRows ya dejó los datos en SQLite).
      if (ct.has("workouts") || ct.has("workout_exercises") || ct.has("sets")) {
        setRefetchSignal((n) => n + 1);
      }
    } catch {
      setSyncStatus("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isGuest]);

  // Reacciona a cambios de sesión de Supabase: si había datos de invitado,
  // los vincula (claim) a la cuenta recién creada/iniciada antes de
  // sincronizar. `runInitialBootstrap` no hace falta como paso aparte: al no
  // haber marca de agua todavía para esta cuenta en este dispositivo, el pull
  // normal de `runSync()` ya trae el histórico completo la primera vez.
  const handleSessionChange = useCallback(
    // `isExplicitSignOut` distingue un SIGNED_OUT real (borra la DB local) de
    // una mera comprobación de sesión sin resultado (p.ej. la sesión de
    // Supabase no sobrevivió a un `force-stop` — bug pre-existente conocido).
    // Tratar "sin sesión" como sign-out en el arranque en frío borraría datos
    // de una cuenta real que simplemente no pudo reautenticar en segundo
    // plano — en ese caso preferimos dejar la identidad como estaba y que el
    // sync falle silenciosamente hasta que el usuario vuelva a iniciar sesión.
    async (session: Session | null, isExplicitSignOut: boolean) => {
      await hydratePreferencesFromSession(session);
      if (session && session.user.id !== userId) {
        if (isGuest) {
          const db = await getLocalDb();
          await claimGuestIdentity(db, { guestUserId: userId, realUserId: session.user.id });
          await setActiveIdentity(db, { activeUserId: session.user.id, isGuest: false });
          await refreshIdentity();
        } else {
          // Edge case raro: login directo a otra cuenta real sin sign-out previo.
          // No se pueden mezclar datos de una cuenta con otra.
          await wipeAndSetIdentity({ userId: session.user.id, isGuest: false });
        }
      } else if (!session && !isGuest && isExplicitSignOut) {
        // Sign-out: vaciar la DB local para que la siguiente identidad (un
        // nuevo invitado, u otra cuenta) no vea datos cacheados de esta cuenta.
        // El aviso de "cambios sin sincronizar" ya se mostró en Settings antes
        // de llamar a signOut().
        await wipeAndSetIdentity();
      }
      void runSync();
    },
    [userId, isGuest, refreshIdentity, wipeAndSetIdentity, runSync]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      void handleSessionChange(session, false);
      const inTabsGroup = segments[0] === "(tabs)";
      const inAuthGroup = segments[0] === "(auth)";
      if (!inTabsGroup && !inAuthGroup) {
        router.replace("/(tabs)");
      }
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!initialized) return;
      void handleSessionChange(session, event === "SIGNED_OUT");
      // Login/registro exitoso o sign-out — en ambos casos se vuelve a la app
      // (ya no hay pantalla de "deslogueado", el modo invitado la reemplaza).
      router.replace("/(tabs)");
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  // Sync al volver la app a primer plano.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        void runSync();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [runSync]);

  // Sync al recuperar conexión — puede pasar con la app ya en primer plano
  // (p.ej. saliendo de modo avión), algo que el listener de AppState no detecta.
  useEffect(() => {
    if (isConnected && wasConnected.current === false) {
      void runSync();
    }
    wasConnected.current = isConnected;
  }, [isConnected, runSync]);

  return (
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
        <Stack.Screen name="body-tracker/index" options={{ headerShown: false }} />
        <Stack.Screen name="search/index" options={{ headerShown: false }} />
        <Stack.Screen name="exercise-history/[exerciseId]" options={{ headerShown: false }} />
        <Stack.Screen name="workout-detail/[workoutId]" options={{ headerShown: false }} />
        <Stack.Screen name="calculators" options={{ headerShown: false }} />
        <Stack.Screen name="goals/index" options={{ headerShown: false }} />
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
  );
}

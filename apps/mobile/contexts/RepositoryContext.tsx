/**
 * Contexto de inyección de dependencias para toda la capa offline de mobile.
 *
 * Provee, a través de `useRepositories()`, la DB SQLite local ya migrada, los
 * 7 repositorios locales (workout/exercise/routine/body-tracker/goals/
 * progress/preferences) construidos sobre esa misma conexión, y la identidad
 * activa del dispositivo (invitado o cuenta real vinculada). La UI de mobile
 * SOLO debe hablar con estos repos locales — los repos remotos quedan
 * reservados al `SyncEngine` y a analíticas fuera de alcance offline (ver
 * `.agent/context/offline-sync.md`). También resuelve el arranque hidratando
 * `usePreferencesStore`/`useThemeModeStore` desde la tabla local, y expone las
 * operaciones de identidad (`refreshIdentity`, `wipeAndSetIdentity`) que usan
 * las pantallas de cuenta para reaccionar a login/logout/claim.
 */
import { createContext, useCallback, useContext, useEffect, useState, useMemo, type ReactNode } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { usePreferencesStore, useWorkoutStore, useExerciseStore, useRoutineStore } from "@fitnotes/core";
import { useThemeModeStore } from "../lib/theme";
import type {
  SqlExecutor,
  LocalWorkoutRepository,
  LocalExerciseRepository,
  LocalRoutineRepository,
  LocalBodyTrackerRepository,
  LocalGoalsRepository,
  LocalProgressRepository,
  LocalPreferencesRepository,
  LocalCalendarRepository,
} from "@fitnotes/database";
import {
  createLocalWorkoutRepository,
  createLocalExerciseRepository,
  createLocalRoutineRepository,
  createLocalBodyTrackerRepository,
  createLocalGoalsRepository,
  createLocalProgressRepository,
  createLocalPreferencesRepository,
  createLocalCalendarRepository,
  getOrCreateLocalIdentity,
  setActiveIdentity,
} from "@fitnotes/database";
import { getLocalDb, resetLocalDb } from "../lib/db/client";

// `userId`/`isGuest` resuelven la identidad local del dispositivo (invitado o
// cuenta real vinculada) — reemplaza el patrón anterior de cada pantalla
// llamando a `getSession()` por su cuenta. `userId` siempre está resuelto
// (nunca vacío); `isGuest` distingue si aún no hay cuenta real.
interface RepositoryContextValue {
  db: SqlExecutor;
  workoutRepo: LocalWorkoutRepository;
  exerciseRepo: LocalExerciseRepository;
  routineRepo: LocalRoutineRepository;
  bodyTrackerRepo: LocalBodyTrackerRepository;
  goalsRepo: LocalGoalsRepository;
  progressRepo: LocalProgressRepository;
  preferencesRepo: LocalPreferencesRepository;
  calendarRepo: LocalCalendarRepository;
  userId: string;
  isGuest: boolean;
  /** Vuelve a leer `local_identity` — llamar tras un claim. */
  refreshIdentity: () => Promise<void>;
  /**
   * Vacía la DB local por completo y establece la identidad indicada (o un
   * nuevo invitado si no se indica ninguna) — usado en sign-out y en el
   * cambio directo entre dos cuentas reales sin pasar por sign-out.
   */
  wipeAndSetIdentity: (identity?: { userId: string; isGuest: boolean }) => Promise<void>;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#ffffff",
  },
  errorText: {
    color: "#ef4444",
    paddingHorizontal: 24,
    textAlign: "center",
  },
});

/**
 * Provider raíz de la capa offline: abre/espera la DB SQLite local
 * (`getLocalDb()`) y, una vez lista, delega en `RepositoryProviderReady` para
 * construir los repos y resolver la identidad. Muestra un spinner mientras la
 * DB no está lista y un mensaje de error si `getLocalDb()` falla (p.ej. disco
 * lleno o migración corrupta) — un fallo aquí bloquea toda la app, ya que
 * ninguna pantalla puede leer/escribir sin `db`.
 *
 * También es dueño de `wipeAndSetIdentity` (en vez de vivir en
 * `RepositoryProviderReady`) porque necesita `setDb`: tras vaciar la DB el
 * executor es una instancia nueva y hay que propagarla para que los repos y
 * la identidad memoizados más abajo se reconstruyan contra ella.
 */
export function RepositoryProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SqlExecutor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLocalDb()
      .then(setDb)
      .catch((err: Error) => setError(err.message));
  }, []);

  // Vive aquí (no en RepositoryProviderReady) porque necesita `setDb`: tras
  // vaciar la DB, el executor es una instancia nueva y hay que propagarla
  // para que los repos/identidad memoizados se reconstruyan contra ella.
  const wipeAndSetIdentity = useCallback(async (identity?: { userId: string; isGuest: boolean }) => {
    const fresh = await resetLocalDb();
    await getOrCreateLocalIdentity(fresh);
    if (identity) {
      await setActiveIdentity(fresh, { activeUserId: identity.userId, isGuest: identity.isGuest });
    }
    setDb(fresh);
    // Las pantallas ya montadas (p.ej. la tab "Hoy") solo recargan sus datos
    // en el mount inicial — sin esto, tras un wipe seguirían mostrando el
    // historial de workouts/ejercicios/rutinas de la identidad anterior hasta
    // el próximo reinicio de la app.
    useWorkoutStore.getState().resetWorkout();
    useExerciseStore.getState().loadExercises([], []);
    useRoutineStore.getState().loadRoutines([]);
  }, []);

  if (error) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>No se pudo abrir la base de datos local: {error}</Text>
      </View>
    );
  }

  if (!db) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <RepositoryProviderReady db={db} wipeAndSetIdentity={wipeAndSetIdentity}>
      {children}
    </RepositoryProviderReady>
  );
}

/**
 * Construye los 7 repos locales (memoizados por `db`, así que solo se
 * recrean tras un wipe) y resuelve/hidrata la identidad activa vía
 * `getOrCreateLocalIdentity` (crea un invitado en el primer arranque si no
 * existe ninguna fila en `local_identity`). Mientras la identidad no está
 * resuelta muestra un spinner, para no dejar pasar a pantallas que asuman
 * `userId` disponible.
 *
 * También hidrata `usePreferencesStore`/`useThemeModeStore` desde
 * `preferencesRepo.getAll()` en un efecto separado (dependiente de `db`, para
 * volver a correr tras un wipe) — si hay sesión de cuenta real activa,
 * `_layout.tsx` sobrescribe esto después con `user_metadata` remoto (el
 * remoto gana, para reflejar cambios hechos desde otro dispositivo).
 */
function RepositoryProviderReady({
  db,
  wipeAndSetIdentity,
  children,
}: {
  db: SqlExecutor;
  wipeAndSetIdentity: (identity?: { userId: string; isGuest: boolean }) => Promise<void>;
  children: ReactNode;
}) {
  const workoutRepo = useMemo(() => createLocalWorkoutRepository(db), [db]);
  const exerciseRepo = useMemo(() => createLocalExerciseRepository(db), [db]);
  const routineRepo = useMemo(() => createLocalRoutineRepository(db), [db]);
  const bodyTrackerRepo = useMemo(() => createLocalBodyTrackerRepository(db), [db]);
  const goalsRepo = useMemo(() => createLocalGoalsRepository(db), [db]);
  const progressRepo = useMemo(() => createLocalProgressRepository(db), [db]);
  const preferencesRepo = useMemo(() => createLocalPreferencesRepository(db), [db]);
  const calendarRepo = useMemo(() => createLocalCalendarRepository(db), [db]);
  const [identity, setIdentity] = useState<{ userId: string; isGuest: boolean } | null>(null);

  const refreshIdentity = useMemo(
    () => async () => {
      const result = await getOrCreateLocalIdentity(db);
      setIdentity({ userId: result.activeUserId, isGuest: result.isGuest });
    },
    [db]
  );

  useEffect(() => {
    refreshIdentity();
  }, [refreshIdentity]);

  // Hidrata el store de preferencias (y el tema, que vive en su propio store
  // por depender de `useColorScheme` de RN) desde la DB local — vuelve a
  // correr tras un wipe (cambio de `db`), igual que la identidad. Si hay una
  // cuenta real con sesión activa, `_layout.tsx` pisa esto después con el
  // valor de `user_metadata` (remoto gana, para reflejar otros dispositivos).
  useEffect(() => {
    preferencesRepo.getAll().then((prefs) => {
      usePreferencesStore.getState().loadPreferences(prefs);
      useThemeModeStore.getState().setMode(prefs.theme_preference);
    });
  }, [preferencesRepo]);

  // Reparación de un solo uso: recalcula los `personal_records` que quedaron
  // huérfanos antes de que `deleteWorkout`/`removeExercise`/`deleteSet`
  // empezaran a llamar a `resyncPersonalRecordsForExercise` (ver
  // `app_migrations`). Marca la reparación como aplicada para no repetirla.
  useEffect(() => {
    if (!identity) return;
    db.getFirstAsync<{ id: string }>(`SELECT id FROM app_migrations WHERE id = ?`, ["pr_orphan_repair_v1"]).then(
      async (row) => {
        if (row) return;
        await workoutRepo.repairOrphanedPersonalRecords(identity.userId);
        await db.runAsync(`INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)`, [
          "pr_orphan_repair_v1",
          new Date().toISOString(),
        ]);
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, identity?.userId]);

  if (!identity) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <RepositoryContext.Provider
      value={{
        db,
        workoutRepo,
        exerciseRepo,
        routineRepo,
        bodyTrackerRepo,
        goalsRepo,
        progressRepo,
        preferencesRepo,
        calendarRepo,
        userId: identity.userId,
        isGuest: identity.isGuest,
        refreshIdentity,
        wipeAndSetIdentity,
      }}
    >
      {children}
    </RepositoryContext.Provider>
  );
}

/**
 * Hook de acceso al contexto de repos/identidad — punto de entrada único que
 * usan las pantallas para leer/escribir datos locales (`workoutRepo`,
 * `exerciseRepo`, `routineRepo`, `bodyTrackerRepo`, `goalsRepo`,
 * `progressRepo`, `preferencesRepo`), conocer la identidad activa
 * (`userId`, `isGuest`) y reaccionar a cambios de cuenta (`refreshIdentity`,
 * `wipeAndSetIdentity`). Lanza si se llama fuera de un `RepositoryProvider`.
 */
export function useRepositories(): RepositoryContextValue {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error("useRepositories() debe usarse dentro de <RepositoryProvider>");
  return ctx;
}

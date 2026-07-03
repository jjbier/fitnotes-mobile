import { createContext, useCallback, useContext, useEffect, useState, useMemo, type ReactNode } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import type {
  SqlExecutor,
  LocalWorkoutRepository,
  LocalExerciseRepository,
  LocalRoutineRepository,
  LocalBodyTrackerRepository,
  LocalGoalsRepository,
} from "@fitnotes/database";
import {
  createLocalWorkoutRepository,
  createLocalExerciseRepository,
  createLocalRoutineRepository,
  createLocalBodyTrackerRepository,
  createLocalGoalsRepository,
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

export function useRepositories(): RepositoryContextValue {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error("useRepositories() debe usarse dentro de <RepositoryProvider>");
  return ctx;
}

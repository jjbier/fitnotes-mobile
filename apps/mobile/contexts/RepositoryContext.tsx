import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import type { SqlExecutor, LocalWorkoutRepository } from "@fitnotes/database";
import { createLocalWorkoutRepository } from "@fitnotes/database";
import { getLocalDb } from "../lib/db/client";

// Repositorios locales concretos se añaden aquí a medida que cada fase del
// plan offline los implementa (workoutRepo: Fase 2, exerciseRepo/routineRepo:
// Fase 4, bodyTrackerRepo/goalsRepo: Fase 5).
interface RepositoryContextValue {
  db: SqlExecutor;
  workoutRepo: LocalWorkoutRepository;
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

  return <RepositoryProviderReady db={db}>{children}</RepositoryProviderReady>;
}

function RepositoryProviderReady({ db, children }: { db: SqlExecutor; children: ReactNode }) {
  const workoutRepo = useMemo(() => createLocalWorkoutRepository(db), [db]);
  return <RepositoryContext.Provider value={{ db, workoutRepo }}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): RepositoryContextValue {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error("useRepositories() debe usarse dentro de <RepositoryProvider>");
  return ctx;
}

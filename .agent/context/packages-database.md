# packages/database — @fitnotes/database

## Cliente Supabase (`src/supabase/client.ts`)

```ts
createBrowserClient()              // cliente componente/browser
createServerClient(cookieStore)    // Server Components / Route Handlers
```

Lee `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` del env.
Ambas funciones devuelven `SupabaseClient<Database>`.

**Pendiente:** `Database` en `types.ts` es un stub. Ejecutar:
```bash
supabase gen types typescript --project-id <id> > packages/database/src/supabase/types.ts
```

## Migration (`src/supabase/migrations/001_initial_schema.sql`)

- 10 tablas con `user_id uuid references auth.users ON DELETE CASCADE`
- RLS activado en todas con policy `auth.uid() = user_id`
- Índices en: `workouts.date`, `sets.workout_exercise_id`, `personal_records(exercise_id, reps)`, `workout_exercises.workout_id`
- Trigger `handle_updated_at()` en categories, exercises, workouts, workout_exercises, sets, routines
- Trigger `update_personal_record()` en `sets` (INSERT/UPDATE) → inserta en `personal_records` si el peso es nuevo máximo para ese ejercicio+reps
- Enums SQL: `exercise_type`, `goal_type`

## SyncEngine (`src/sync/syncEngine.ts`)

Clase para sync offline-first en mobile. **Solo esqueleto — sin implementación real.**

```ts
class SyncEngine {
  pushLocalChanges(): Promise<number>   // TODO: expo-sqlite pending queue
  pullRemoteChanges(): Promise<number>  // TODO: watermark last_synced_at
  resolveConflicts(localTs, remoteTs)   // last-write-wins — IMPLEMENTADO
  sync(): Promise<SyncResult>           // push + pull
}
```

Estrategia de conflictos: el `updated_at` más reciente gana.

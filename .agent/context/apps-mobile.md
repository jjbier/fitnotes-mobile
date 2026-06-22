# apps/mobile — Expo SDK 52

_Last updated: 2026-06-22_

## Config
- `app.json` → scheme `fitnotes`, typedRoutes enabled. **expo-sqlite plugin ELIMINADO** (causaba crash)
- `babel.config.js` → `babel-preset-expo` con `jsxImportSource: "nativewind"` + `reanimated/plugin`. **SIN `nativewind/babel`**
- `metro.config.js` → `watchFolders: [monorepoRoot]`, `nodeModulesPaths`, `withNativeWind`, **custom resolveRequest .js→.ts**
- `.npmrc` raíz → `public-hoist-pattern` para Babel — requerido para `assembleRelease`
- `lib/supabase.ts` → `createClient` con **FileStorage** (expo-file-system) como auth storage — NO AsyncStorage

## Supabase en mobile
```typescript
// SIEMPRE usar getSession() en pantallas (no getUser())
const { data: { session } } = await supabase.auth.getSession();
if (session?.user) setUserId(session.user.id);

// getUser() solo en _layout.tsx para verificación inicial
```

## workout_exercise ID — regla crítica
```typescript
// En workout/[exerciseId].tsx — addToWorkout effect:
// 1. Esperar a que userId esté disponible (guard)
if (exercise && userId) {
  if (activeWorkout && activeWorkout.id && !workoutExercise) {
    const { data, error } = await repo.addExercise({...}, userId);
    if (!error && data) {
      addExerciseToWorkout(exerciseId, data.id); // ← pasar UUID real de DB
    }
  }
}
// Sin esto: el store tiene ID local, la DB tiene UUID distinto → delete/update fallan vía RLS
```

## Estructura Expo Router

```
app/
├── _layout.tsx              Stack root — auth guard + AppState sync + SyncContext.Provider
├── (auth)/login.tsx         email + password
├── (auth)/register.tsx
├── (tabs)/
│   ├── _layout.tsx          6 tabs: index/calendar/exercises/progress/tools/settings
│   ├── index.tsx            Hoy — workout por fecha, delete ejercicio, reacciona a refetchSignal
│   ├── calendar.tsx
│   ├── exercises.tsx        FAB modal (crear ejercicio + categoría inline)
│   ├── progress.tsx         PRs expandibles + 1RM estimado
│   ├── tools.tsx            1RM / Set% / Plate calculators
│   └── settings.tsx         perfil, kg/lb, body-tracker link, sign-out, delete account
├── workout/[exerciseId].tsx  sets CRUD — todos los ExerciseTypes — RestTimer — delete ejercicio
├── body-tracker/index.tsx   tabs Registrar/Historial — CRUD medidas + entradas
├── routines/index.tsx       lista + crear + eliminar
├── routines/[id].tsx        días + ejercicios, edit mode, log routine day → workout real
└── exercises/[categoryId].tsx
```

## Sync
- `lib/sync.ts` — singleton `syncEngine = new SyncEngine(supabase)`
- `contexts/SyncContext.tsx` — `{ status, pendingCount, lastSyncAt, refetchSignal }`
- `_layout.tsx` — AppState listener: sync on foreground, incrementa `refetchSignal` si `pulled > 0`
- `(tabs)/index.tsx` — escucha `refetchSignal`, recarga workout del día al cambiar

## Android build

```bash
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon
# Output: app/build/outputs/apk/release/app-release.apk
adb install app/build/outputs/apk/release/app-release.apk
```

Fixes permanentes en Android:
- `gradle.properties`: `android.kotlinVersion=1.9.24`
- `app/build.gradle`: `implementation("androidx.core:core-splashscreen:1.0.1")`
- `react-native.config.js`: override `expo` packageImportPath
- `@react-native-async-storage/async-storage` NO instalado (usa FileStorage)

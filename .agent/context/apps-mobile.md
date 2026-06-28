# apps/mobile — Expo SDK 52

_Last updated: 2026-06-28_

## Config
- `app.json` → scheme `fitnotes`, typedRoutes enabled. **expo-sqlite plugin ELIMINADO** (causaba crash)
- `babel.config.js` → `babel-preset-expo` con `jsxImportSource: "nativewind"` + `reanimated/plugin`. **SIN `nativewind/babel`**
- `metro.config.js` → `watchFolders: [monorepoRoot]`, `nodeModulesPaths`, `withNativeWind`, **custom resolveRequest .js→.ts**
- `.npmrc` raíz → `public-hoist-pattern` para Babel — requerido para `assembleRelease`
- `lib/supabase.ts` → `createClient` con **FileStorage** (expo-file-system) como auth storage — NO AsyncStorage
- `lib/theme.ts` → `useTheme()` + `Colors.light` / `Colors.dark` — dark mode vía `useColorScheme()`

## Supabase en mobile
```typescript
// SIEMPRE usar getSession() en pantallas (no getUser())
const { data: { session } } = await supabase.auth.getSession();
```

## workout_exercise ID — regla crítica
```typescript
addExerciseToWorkout(exerciseId, data.id)  // ← UUID real de DB, no ID local
// Sin esto: store tiene ID local, DB tiene UUID distinto → delete/update fallan vía RLS
```

## Dark mode
```typescript
import { useTheme } from "../../lib/theme";  // ajustar ruta relativa
// Dentro del componente:
const theme = useTheme();
// Usar theme.background, theme.text, theme.primary, etc.
// NUNCA hardcodear #fff, #0f172a, #e2e8f0, etc.
```

- Tab bar: `useColorScheme()` directo en `(tabs)/_layout.tsx` (no useTheme — es layout)
- StatusBar: `<StatusBar style="auto" />` ya configurado en `_layout.tsx`

## Accessibility
- Icon-only buttons deben tener `accessibilityLabel="..."` en español
- Botones con texto visible no necesitan label adicional

## Estructura Expo Router

```
app/
├── _layout.tsx                  Stack root — auth guard + AppState sync + SyncContext.Provider
├── (auth)/login.tsx
├── (auth)/register.tsx
├── (tabs)/
│   ├── _layout.tsx              6 tabs: Hoy/Calendario/Ejercicios/Progreso/Rutinas/Configuración
│   ├── index.tsx                Hoy — workout por fecha, delete ejercicio, refetchSignal
│   ├── calendar.tsx
│   ├── exercises.tsx            browse + speed dial FAB (crear ejercicio / nueva rutina → /tools?create=1)
│   ├── progress.tsx             PRs expandibles + 1RM estimado
│   ├── tools.tsx                ← TAB "RUTINAS" (icon: list-outline) — lista/crear/editar/copiar/eliminar
│   └── settings.tsx             perfil, kg/lb, Herramientas (→/calculators), body-tracker, sign-out, delete
├── workout/[exerciseId].tsx     sets CRUD — todos los ExerciseTypes — RestTimer — delete ejercicio
├── routines/[id].tsx            días + ejercicios, edit mode, drag&drop, predefined sets, supersets+nombres, log
├── routines/index.tsx           ⚠ CÓDIGO MUERTO — duplicado por (tabs)/tools.tsx
├── calculators.tsx              1RM / Set% / Plate calculators (desde Settings → Herramientas)
├── body-tracker/index.tsx       CRUD medidas + entradas
├── exercises/[categoryId].tsx
├── search/index.tsx             búsqueda global con historial reciente
├── goals/index.tsx              objetivos por ejercicio
└── exercise-history/[exerciseId].tsx  historial completo + gráfico LineChart
```

## Supersets — flujo completo

1. En edit mode de `routines/[id].tsx`: tap 🔗 en ejercicio sin grupo → se une con el siguiente
2. Tap 🔗 en ejercicio con grupo → Alert: "Renombrar grupo" | "Quitar del grupo" | "Cancelar"
3. "Renombrar grupo" → modal TextInput → guarda en `routine_day_exercises.group_name` via `updateDayGroupName`
4. Log day → `workoutRepository.addExercise` propaga `group_id` y `group_name`
5. En workout activo: nav strip muestra pills de color por grupo; marcar set completo → auto-jump al siguiente del grupo

## Rutinas — predefined sets race condition fix
```typescript
const psLoadingForRef = useRef<string | null>(null);
psLoadingForRef.current = rdeId;
// ... fetch ...
if (psLoadingForRef.current !== rdeId) return; // descartar si cambió ejercicio
```

## Drag & drop
- `react-native-draggable-flatlist@4.0.3`
- `GestureHandlerRootView` en `app/_layout.tsx`
- `NestableScrollContainer` + `NestableDraggableFlatList` en `routines/[id].tsx`

## Android build

```bash
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon
/opt/Android-Sdk/platform-tools/adb install app/build/outputs/apk/release/app-release.apk
```

Fixes permanentes:
- `gradle.properties`: `android.kotlinVersion=1.9.24`
- `app/build.gradle`: `implementation("androidx.core:core-splashscreen:1.0.1")`
- `react-native.config.js`: override `expo` packageImportPath
- NO `@react-native-async-storage/async-storage` (usa FileStorage)

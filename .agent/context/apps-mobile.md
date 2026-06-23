# apps/mobile — Expo SDK 52

_Last updated: 2026-06-23_

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
```

## workout_exercise ID — regla crítica
```typescript
addExerciseToWorkout(exerciseId, data.id)  // ← UUID real de DB, no ID local
// Sin esto: store tiene ID local, DB tiene UUID distinto → delete/update fallan vía RLS
```

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
├── routines/[id].tsx            días + ejercicios, edit mode, drag&drop, predefined sets, supersets, log
├── routines/index.tsx           ⚠ CÓDIGO MUERTO — duplicado por (tabs)/tools.tsx
├── calculators.tsx              1RM / Set% / Plate calculators (desde Settings → Herramientas)
├── body-tracker/index.tsx       CRUD medidas + entradas
└── exercises/[categoryId].tsx
```

## Rutinas — características completas

- Lista en tab "Rutinas" (`tools.tsx`). Menú ⋮ por rutina: Editar / Copiar / Eliminar
- `?create=1` en `/tools` → auto-abre modal nueva rutina
- Speed dial FAB en ejercicios → "Nueva rutina" → `/tools?create=1`
- Editor `routines/[id].tsx`:
  - Edit mode toggle (botón lápiz, siempre visible)
  - Días: crear, eliminar, drag & drop reordenar
  - Ejercicios: añadir picker, eliminar, drag & drop reordenar (nested)
  - Predefined sets: tap `≡` → modal campos por ExerciseType; vacío = copia historial
    - Race condition fix: `useRef psLoadingForRef` descarta respuestas de fetch stale
  - Supersets: icono 🔗 — gris=sin grupo, morado=en grupo; barra morada en lectura
    - Tap en gris: une con siguiente ejercicio (group_id compartido)
    - Tap en morado: disuelve todos los miembros del grupo
  - Log day → crea workout real + aplica predefined sets

## Drag & drop
- `react-native-draggable-flatlist@4.0.3`
- `GestureHandlerRootView` en `app/_layout.tsx`
- `NestableScrollContainer` + `NestableDraggableFlatList` en `routines/[id].tsx`

## Expo Router types
- `.expo/types/router.d.ts` se regenera al iniciar servidor
- Si `tsc --noEmit` falla por ruta nueva: añadir a `hrefInputParams`, `hrefOutputParams`, `href`

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

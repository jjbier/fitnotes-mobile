# apps/mobile — Expo SDK 52

_Last updated: 2026-07-02_

## Config
- `app.json` → scheme `fitnotes`, typedRoutes enabled. **expo-sqlite plugin ELIMINADO** (causaba crash). EAS `projectId` es placeholder — requiere `eas init`
- `babel.config.js` → `babel-preset-expo` con `jsxImportSource: "nativewind"` + `reanimated/plugin`. **SIN `nativewind/babel`**
- `metro.config.js` → `watchFolders: [monorepoRoot]`, `nodeModulesPaths`, `withNativeWind`, **custom resolveRequest .js→.ts**
- `.npmrc` raíz → `public-hoist-pattern` para Babel — requerido para `assembleRelease`
- `lib/supabase.ts` → `createClient` con **FileStorage** (expo-file-system) como auth storage — NO AsyncStorage
- `lib/theme.ts` → `useTheme()` + `Colors.light` / `Colors.dark` + **`useThemeModeStore`** (zustand: `mode: "light"|"dark"|"system"`) — `useTheme()` resuelve `mode === "system" ? useColorScheme() : mode`
- Deps nativas añadidas 2026-07-01 (via `npx expo install`, autolinking sin cambios extra): `expo-av@~15.0.2` (sonido rest timer), `expo-sharing@~13.0.1` + `react-native-view-shot@~4.0.3` (exportar imagen de gráficos)
- `assets/sounds/timer-end.mp3` — sonido del rest timer (generado con ffmpeg, dos beeps ~1.15s)

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
const theme = useTheme();
// Usar theme.background, theme.text, theme.primary, etc.
// NUNCA hardcodear #fff, #0f172a, #e2e8f0, etc.
```
- Tab bar: `useColorScheme()` directo en `(tabs)/_layout.tsx` (no useTheme — es layout)
- StatusBar: `<StatusBar style="auto" />` ya configurado en `_layout.tsx`
- **Selector manual de tema**: `useThemeModeStore.getState().setMode("light"|"dark"|"system")` en Ajustes; `_layout.tsx` inicializa el store desde `user_metadata.theme_preference` en `getSession()` y `onAuthStateChange`

## user_metadata — claves usadas (Supabase Auth)
```
weight_unit, default_weight_increment, calendar_week_start, auto_select_next_set,
track_personal_records, mark_sets_complete, default_rest_seconds,
estimated_records_rep_limit, display_name, theme_preference,
rest_timer_sound_enabled, rest_timer_volume (0-100),
show_set_count_home, hidden_category_ids (string[]),
calendar_show_day_panel, calendar_show_category_dots
```
Todas se leen con `session.user.user_metadata?.clave` y se escriben con `supabase.auth.updateUser({ data: { clave: valor } })`.

## Sync cross-device
- `SyncContext` → `refetchSignal` counter, incrementado por `_layout.tsx` tras pull
- **Todos los tabs** suscritos: `index.tsx`, `exercises.tsx`, `progress.tsx`, `tools.tsx`, `calendar.tsx`
- `calendar.tsx` usa `useCallback` para `loadMonth(y, m)` y recarga en `useEffect([refetchSignal])`
- `_layout.tsx` actualiza ejercicios (`loadExercises`) y rutinas (`loadRoutines`) directamente cuando `changedTables` contiene esas tablas — no requiere refetchSignal para estos stores
- workout/workout_exercises/sets → `setRefetchSignal(n + 1)`

## Rest Timer (workout/[exerciseId].tsx)
- Solo arranque manual — NO se inicia automáticamente al añadir/completar series
- Fin de tiempo: `Vibration.vibrate([0, 400, 150, 400, 150, 400])` + `Haptics.notificationAsync(Success)` + **sonido opcional** (`expo-av`, `Audio.Sound` precargado en un `useEffect` con `require("../../assets/sounds/timer-end.mp3")`, `setVolumeAsync` + `replayAsync()` si `rest_timer_sound_enabled`)
- Recuerda última duración usada: `last-timer-duration.json` (expo-file-system), fallback a `user_metadata.default_rest_seconds`
- **Sin** push notifications (`expo-notifications` eliminado del flujo del timer)

## Accessibility
- Icon-only buttons deben tener `accessibilityLabel="..."` en español

## Estructura Expo Router

```
app/
├── _layout.tsx                  Stack root — auth guard + AppState sync + SyncContext.Provider
├── (auth)/login.tsx
├── (auth)/register.tsx
├── (tabs)/
│   ├── _layout.tsx              6 tabs: Hoy/Calendario/Ejercicios/Progreso/Rutinas/Configuración
│   ├── index.tsx                Hoy — workout por fecha, delete ejercicio, refetchSignal
│   ├── calendar.tsx             grid + lista, swipe entre meses, refetchSignal ✅
│   ├── exercises.tsx            browse + speed dial FAB (Nuevo ejercicio / **Nueva categoría** — modal standalone, ya NO "Nueva rutina": no pertenecía a esta pantalla)
│   ├── progress.tsx             PRs expandibles + 1RM estimado
│   ├── tools.tsx                ← TAB "RUTINAS" — lista/crear/editar/copiar/eliminar
│   └── settings.tsx             perfil, kg/lb, Herramientas→calculadoras, body-tracker, sign-out, delete
├── workout/[exerciseId].tsx     sets CRUD — todos los ExerciseTypes — RestTimer manual+vibración+sonido
├── workout-detail/[workoutId].tsx  detalle completo de un workout por fecha arbitraria (solo lectura)
├── routines/[id].tsx            días + ejercicios, edit mode, drag&drop, predefined sets, supersets+nombres, log
├── calculators.tsx              1RM / Set% (Add-to-Workout + Select Max) / Plate (configurable) / IMC
├── body-tracker/index.tsx       CRUD medidas + entradas, tap en gráfica → medidas relacionadas
├── exercises/[categoryId].tsx
├── search/index.tsx             búsqueda global con historial reciente
├── goals/index.tsx              objetivos por ejercicio
└── exercise-history/[exerciseId].tsx  historial + gráfico LineChart + export imagen (view-shot) + link a workout-detail
```

## Rutinas — menú por rutina (`(tabs)/tools.tsx`)
El menú de opciones (Editar/Copiar/Eliminar) usa un **`Modal` propio**, NO `Alert.alert`: Android solo soporta 3 botones nativos en `Alert.alert` (positive/negative/neutral) — con 4 (Cancelar/Editar/Copiar/Eliminar) el 4º se descartaba en silencio y "Eliminar" nunca aparecía. Mismo patrón para cualquier menú con >3 acciones. Verificado en vivo con Detox contra dispositivo físico (único bug de esta clase encontrado tras auditar los ~76 `Alert.alert()` de la app).

## Supersets — flujo completo

1. Edit mode `routines/[id].tsx`: tap 🔗 en ejercicio sin grupo → se une con el siguiente
2. Tap 🔗 en ejercicio con grupo → Alert: "Renombrar grupo" | "Quitar del grupo" | "Cancelar"
3. "Renombrar grupo" → modal TextInput → guarda en `routine_day_exercises.group_name` via `updateDayGroupName`
4. Log day → `workoutRepository.addExercise` propaga `group_id` y `group_name`

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
- `NestableScrollContainer` + `NestableDraggableFlatList` en `routines/[id].tsx`, `body-tracker/index.tsx` (tab Track) y `(tabs)/index.tsx` (lista de ejercicios del workout activo — reorder por `onLongPress={drag}` en icono `reorder-three-outline`, deshabilitado en modo selección múltiple)

## Home ("Hoy") — multi-select y reorder
- `(tabs)/index.tsx`: botón `checkbox-outline` en el header activa `selectMode` — checkboxes por ejercicio, barra "N seleccionado(s) — Eliminar seleccionados"
- Reorder: `reorderExercises` (store, `useWorkoutStore`) + `workoutRepository.reorderExercises` (persistencia), mismo patrón que la tira de navegación horizontal de `workout/[exerciseId].tsx`
- Timer del workout: pausa/reanudar manual (`timerState: "idle"|"running"|"paused"`, acumula segundos en un ref al pausar)

## LineChart.tsx — onPointPress
- Prop `onPointPress?: (dataIndex: number) => void` — se llama con el índice en el array `data` completo (ya corregido el offset de `data.slice(-20)`), usado en `body-tracker/index.tsx` para mostrar el resto de medidas registradas ese día

## Android build

```bash
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon
/opt/Android-Sdk/platform-tools/adb install app/build/outputs/apk/release/app-release.apk
```

**Gotchas de build/release:**
- **Gradle no detecta cambios en `packages/core`/`packages/database`** como input de `createBundleReleaseJsAndAssets` — si se edita un paquete compartido y se corre `assembleRelease`, esa tarea puede quedar UP-TO-DATE con el bundle JS viejo. Forzar: `./gradlew createBundleReleaseJsAndAssets --rerun-tasks --no-daemon` antes de `assembleRelease`. Verificar con `unzip -p app-release.apk assets/index.android.bundle | grep -a "<string-a-buscar>"` (es bytecode Hermes, usar `grep -a`).
- **Detox pisa la release**: `android.debug` y `android.release` comparten `applicationId: com.fitnotes.app` (sin `applicationIdSuffix`) — instalar la build debug de Detox para testear sobrescribe la release ya instalada, y esa build debug necesita Metro corriendo para cargar el JS (si no, pantalla en blanco / "Unable to load script"). **Reinstalar la release al terminar de testear con Detox.**

Fixes permanentes:
- `gradle.properties`: `android.kotlinVersion=1.9.24`
- `app/build.gradle`: `implementation("androidx.core:core-splashscreen:1.0.1")`
- `react-native.config.js`: override `expo` packageImportPath
- NO `@react-native-async-storage/async-storage` (usa FileStorage)
- **Detox** (ver CLAUDE.md "E2E mobile (Detox)"): `android/build.gradle` — repo maven local `node_modules/detox/Detox-android`; `app/build.gradle` — `testInstrumentationRunner`, `testBuildType`, `androidTestImplementation('com.wix:detox:20.51.4')` (versión pineada, no `+`); `app/src/androidTest/java/com/fitnotes/app/DetoxTest.java` (runner custom) — todo esto vive en `android/` (gitignorado) y hay que reaplicarlo tras cualquier `expo prebuild` limpio

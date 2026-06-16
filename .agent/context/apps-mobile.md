# apps/mobile — Expo SDK 52

## Config
- `app.json` → scheme `fitnotes`, typedRoutes enabled, expo-sqlite con FTS
- `babel.config.js` → `babel-preset-expo` con `jsxImportSource: "nativewind"` + `nativewind/babel` + `reanimated/plugin`
- `tailwind.config.js` → content `app/**` + `components/**`, preset `nativewind/preset`
- `metro.config.js` → `watchFolders: [monorepoRoot]`, `nodeModulesPaths` para resolver workspace packages, `withNativeWind`
- **Importante:** usa Tailwind v3 (NativeWind v4 no soporta Tailwind v4)

## Estructura Expo Router

```
app/
├── _layout.tsx             Stack root — fonts, splash, auth guard TODO
├── (auth)/
│   ├── login.tsx           email + magic link
│   └── register.tsx        registro
├── (tabs)/
│   ├── _layout.tsx         4 tabs con Ionicons
│   ├── index.tsx           Home — useWorkoutStore, startWorkout
│   ├── calendar.tsx        mes + workout list
│   ├── exercises.tsx       búsqueda + chips + useExerciseStore
│   └── progress.tsx        PRs + useProgressStore + calculate1RM
├── workout/
│   └── [exerciseId].tsx    modal fullScreen — SetRow list + add set
└── routines/
    ├── index.tsx           lista + FAB
    └── [id].tsx            editor días + Start Workout
```

## Componentes

### `components/workout/`
| Componente | Estado |
|---|---|
| `TrainingScreen.tsx` | Stub — SetRow list + Add Set + Finish Workout buttons |
| `SetRow.tsx` | **Funcional** — muestra campos según valores presentes, complete toggle, delete |
| `RestTimer.tsx` | **Funcional** — countdown con interval, +/-30s, pause/resume |

### `components/ui/`
| Componente | Estado |
|---|---|
| `Button.tsx` | Funcional — variantes (default/secondary/destructive/outline/ghost/link), sizes, loading |
| `Input.tsx` | Funcional — label, error state, disabled, usa `InputBaseProps` de `@fitnotes/ui` |

## Tabs del navigator

| Tab | Screen | Icono |
|---|---|---|
| Today | `(tabs)/index` | home / home-outline |
| Calendar | `(tabs)/calendar` | calendar / calendar-outline |
| Exercises | `(tabs)/exercises` | barbell / barbell-outline |
| Progress | `(tabs)/progress` | trending-up / trending-up-outline |

## Pendiente crítico

1. Auth guard en `_layout.tsx` — verificar sesión Supabase al montar
2. `expo-sqlite` schema no inicializado — no existe tabla `pending_changes`
3. `SetForm` no existe en mobile — inputs inline en `workout/[exerciseId].tsx`
4. No hay `expo-haptics` instalado para `RestTimer` y `Button`
5. `metro.config.js` requiere `nativewind` instalado para `withNativeWind` import
6. Variables de entorno mobile: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (no `NEXT_PUBLIC_`)

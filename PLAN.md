# FitNotes APP — Plan de Trabajo

> **Proyecto:** FitNotes App (Web + Mobile)
> **Stack:** Turborepo · Next.js 15 · Expo SDK 52 · Supabase · Zustand · TypeScript
> **Metodología:** Cada fase es desplegable de forma independiente. Ninguna fase comienza sin que los tests de la anterior estén en verde.

---

## Índice

- [Fase 0 — Setup & Página de Inicio](#fase-0--setup--página-de-inicio)
- [Fase 1 — Gestión de Ejercicios](#fase-1--gestión-de-ejercicios)
- [Fase 2 — Rutinas](#fase-2--rutinas)
- [Fase 3 — Registro de Entrenamientos](#fase-3--registro-de-entrenamientos)
- [Fase 4 — Seguimiento del Progreso](#fase-4--seguimiento-del-progreso)
- [Fase 5 — Body Tracker & Calendario](#fase-5--body-tracker--calendario)
- [Fase 6 — Herramientas de Entrenamiento](#fase-6--herramientas-de-entrenamiento)
- [Fase 7 — Pulido, Performance & Lanzamiento](#fase-7--pulido-performance--lanzamiento)

---

## Fase 0 — Setup & Página de Inicio

**Objetivo:** Repositorio funcional, CI verde, y una página de inicio visible en web y móvil con el nombre del proyecto.

**Duración estimada:** 2–3 días

### Tareas

#### 0.1 Inicializar monorepo
- [ ] Crear repositorio Git
- [ ] Inicializar Turborepo con `pnpm` workspaces
- [ ] Configurar `turbo.json` con pipelines: `build`, `dev`, `lint`, `type-check`, `test`
- [ ] Crear estructura de carpetas: `apps/web`, `apps/mobile`, `packages/core`, `packages/database`, `packages/tsconfig`
- [ ] Configurar `.gitignore`, `.env.example`, `README.md`

#### 0.2 Configurar TypeScript compartido
- [ ] `packages/tsconfig/base.json` — strict, ES2022, bundler moduleResolution
- [ ] `packages/tsconfig/nextjs.json` — extiende base con opciones de Next.js
- [ ] `packages/tsconfig/expo.json` — extiende base con opciones de React Native
- [ ] Verificar que `tsc --noEmit` pasa en todos los packages

#### 0.3 Configurar packages/core
- [ ] Inicializar package con `name: @fitnotes/core`
- [ ] Instalar dependencias: `zustand`, `zod`, `immer`
- [ ] Crear `types/index.ts` con todas las interfaces del dominio
- [ ] Crear `schemas/index.ts` con schemas Zod que espejean los tipos
- [ ] Verificar que el package no importa nada de React, Next.js ni Expo

#### 0.4 Configurar packages/database
- [ ] Inicializar package con `name: @fitnotes/database`
- [ ] Instalar: `@supabase/supabase-js`, `@supabase/ssr`
- [ ] Crear `supabase/client.ts` con `createBrowserClient` y `createServerClient`
- [ ] Crear proyecto en Supabase y añadir credenciales al `.env.local`
- [ ] Crear migración `001_initial_schema.sql` con todas las tablas, RLS, índices y trigger de PRs
- [ ] Ejecutar migración con `supabase db push`

#### 0.5 Configurar apps/web (Next.js)
- [ ] Crear app Next.js 15 con App Router y TypeScript
- [ ] Instalar y configurar Tailwind CSS v4
- [ ] Instalar y configurar shadcn/ui
- [ ] Instalar `@fitnotes/core` y `@fitnotes/database` como dependencias del workspace
- [ ] Configurar middleware de Supabase para manejo de sesión
- [ ] Crear `app/layout.tsx` con providers (AuthProvider, ThemeProvider)
- [ ] Crear página de inicio `app/page.tsx`:
  - Mostrar nombre del proyecto **"FitNotes App"** centrado
  - Botones "Iniciar sesión" y "Registrarse" visibles
  - Responsive (mobile-first)

#### 0.6 Configurar apps/mobile (Expo)
- [ ] Crear app Expo SDK 52 con Expo Router y TypeScript
- [ ] Instalar y configurar NativeWind v4
- [ ] Instalar `@fitnotes/core` y `@fitnotes/database` como dependencias del workspace
- [ ] Configurar `app/_layout.tsx` con providers y fuentes
- [ ] Crear pantalla de inicio `app/index.tsx`:
  - Mostrar nombre del proyecto **"FitNotes App"**
  - Botones "Iniciar sesión" y "Registrarse"
- [ ] Verificar que la app arranca en simulador iOS, Android y web (`expo start`)

#### 0.7 Configurar CI/CD
- [ ] Crear workflow GitHub Actions: `.github/workflows/ci.yml`
  - Jobs: `lint`, `type-check`, `test`, `build`
  - Se ejecuta en cada PR a `main`
- [ ] Configurar Vercel para deploy automático de `apps/web`

### ✅ Tests de verificación — Fase 0

| ID | Test | Tipo | Criterio de éxito |
|----|------|------|-------------------|
| T0.1 | Workspace resolution | Unit | `pnpm -r exec tsc --noEmit` sin errores |
| T0.2 | Core sin dependencias de plataforma | Unit | `grep -r "from 'react'" packages/core` → 0 resultados |
| T0.3 | Schemas Zod validan tipos | Unit | Cada schema de `packages/core/schemas` parsea un objeto válido sin errores |
| T0.4 | Supabase conexión | Integration | `supabase db push` ejecuta sin errores; tablas visibles en dashboard |
| T0.5 | Página de inicio web | E2E (Playwright) | `GET /` retorna 200; el texto "FitNotes App" está en el DOM |
| T0.6 | Página de inicio mobile | Manual / Detox | App arranca sin crash; texto "FitNotes App" visible en pantalla |
| T0.7 | CI pipeline | CI | PR a `main` dispara workflow; todos los jobs pasan en verde |
| T0.8 | RLS Supabase | Integration | Query a cualquier tabla sin autenticación retorna 0 filas |

---

## Fase 1 — Gestión de Ejercicios

**Objetivo:** El usuario puede registrar, editar, eliminar y listar ejercicios y categorías, tanto en web como en móvil.

**Duración estimada:** 4–5 días

### Tareas

#### 1.1 Store de ejercicios (packages/core)
- [ ] Implementar `stores/exerciseStore.ts` con Zustand:
  - Estado: `categories`, `exercises`, `favorites`, `isLoading`, `error`
  - Acciones: `loadCategories`, `loadExercises`, `addExercise`, `updateExercise`, `deleteExercise`, `toggleFavorite`, `addCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`
- [ ] Implementar persistencia con `zustand/middleware` (`persist`)

#### 1.2 Capa de datos — Supabase
- [ ] Crear `packages/database/repositories/exerciseRepository.ts`:
  - `getCategories()`, `createCategory()`, `updateCategory()`, `deleteCategory()`
  - `getExercises(categoryId?)`, `createExercise()`, `updateExercise()`, `deleteExercise()`
  - `toggleFavorite(exerciseId)`
- [ ] Todos los métodos filtran por `user_id` del usuario autenticado

#### 1.3 Autenticación
- [ ] Crear flujo de login/register en web: `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`
- [ ] Crear flujo de login/register en mobile: `app/(auth)/login.tsx`, `app/(auth)/register.tsx`
- [ ] Proteger rutas autenticadas con middleware (web) y redirect en layout (mobile)

#### 1.4 UI Web — Gestión de Ejercicios
- [ ] `app/(app)/exercises/page.tsx` — Lista de categorías con color indicador
- [ ] `app/(app)/exercises/[categoryId]/page.tsx` — Lista de ejercicios de una categoría
- [ ] Componente `ExerciseForm.tsx` — Formulario crear/editar ejercicio (nombre, notas, categoría, tipo, unidad de peso)
- [ ] Componente `CategoryForm.tsx` — Formulario crear/editar categoría (nombre, color)
- [ ] Componente `ExerciseCard.tsx` — Tarjeta con menú contextual (editar, eliminar, favorito, ver historial)
- [ ] Búsqueda de ejercicios con debounce (búsqueda parcial: "dum press" encuentra "Dumbbell Press")
- [ ] Mostrar ejercicios favoritos en categoría "Favorites" al inicio de la lista
- [ ] Opción para mostrar detalles adicionales: "Workout Count" y "Last Used Date"

#### 1.5 UI Mobile — Gestión de Ejercicios
- [ ] `app/(tabs)/exercises.tsx` — Lista de categorías
- [ ] `app/exercises/[categoryId].tsx` — Lista de ejercicios con barra de búsqueda
- [ ] Sheet/Modal para crear y editar ejercicio
- [ ] Sheet/Modal para crear y editar categoría
- [ ] Swipe-to-delete en ejercicios y categorías
- [ ] Menú contextual con opciones: Editar, Eliminar, Favorito
- [ ] Reordenar categorías mediante drag-and-drop

#### 1.6 Tipos de ejercicio
- [ ] Implementar los 2 tipos base: `WEIGHT_REPS`, `DISTANCE_TIME`
- [ ] UI para seleccionar tipo al crear ejercicio
- [ ] Mostrar ícono o badge del tipo en la lista

### ✅ Tests de verificación — Fase 1

| ID | Test | Tipo | Criterio de éxito |
|----|------|------|-------------------|
| T1.1 | Store — addExercise | Unit | `addExercise()` agrega el ejercicio al estado y llama al repositorio |
| T1.2 | Store — deleteExercise | Unit | `deleteExercise()` elimina el ejercicio y sus datos asociados del estado |
| T1.3 | Store — toggleFavorite | Unit | `toggleFavorite()` alterna el estado favorito del ejercicio |
| T1.4 | Repository — getExercises | Integration | Retorna solo ejercicios del usuario autenticado (RLS) |
| T1.5 | Repository — createExercise | Integration | Crea ejercicio en Supabase; `getExercises()` retorna el nuevo ítem |
| T1.6 | Búsqueda parcial | Unit | `filterExercises("dum press")` retorna ejercicios que contienen ambos términos |
| T1.7 | Formulario validación web | E2E (Playwright) | Intentar guardar sin nombre muestra error de validación inline |
| T1.8 | Crear ejercicio web | E2E (Playwright) | Usuario crea ejercicio → aparece en la lista de la categoría correcta |
| T1.9 | Editar ejercicio web | E2E (Playwright) | Usuario edita nombre → lista muestra el nombre actualizado |
| T1.10 | Eliminar ejercicio web | E2E (Playwright) | Confirmación → ejercicio desaparece de la lista |
| T1.11 | Favoritos web | E2E (Playwright) | Marcar favorito → aparece en categoría "Favorites" al inicio |
| T1.12 | Crear ejercicio mobile | E2E (Detox) | Usuario crea ejercicio → aparece en lista de la categoría |
| T1.13 | Colores de categoría | E2E (Playwright) | El color elegido al crear categoría es visible en la lista |
| T1.14 | Autenticación requerida | E2E (Playwright) | Acceder a `/exercises` sin sesión redirige a `/login` |

---

## Fase 2 — Rutinas

**Objetivo:** El usuario puede crear rutinas con días y ejercicios, configurar series predefinidas, y usar la rutina para iniciar un entrenamiento.

**Duración estimada:** 4–5 días

### Tareas

#### 2.1 Store de rutinas (packages/core)
- [ ] Implementar `stores/routineStore.ts` con Zustand:
  - Estado: `routines`, `activeRoutineId`, `isLoading`
  - Acciones: `loadRoutines`, `createRoutine`, `updateRoutine`, `deleteRoutine`, `copyRoutine`, `addDay`, `updateDay`, `deleteDay`, `reorderDays`, `addExerciseToDay`, `removeExerciseFromDay`, `reorderExercisesInDay`, `savePredefinedSets`, `createSuperset`, `removeFromSuperset`

#### 2.2 Capa de datos — Supabase
- [ ] Crear `packages/database/repositories/routineRepository.ts`:
  - CRUD completo para `routines`, `routine_days`, `routine_day_exercises`, `predefined_sets`
  - `logRoutineWorkout(routineId, dayId)` — copia predefined sets al workout del día actual

#### 2.3 UI Web — Rutinas
- [ ] `app/(app)/routines/page.tsx` — Lista de rutinas con opciones: abrir, copiar, eliminar
- [ ] `app/(app)/routines/[id]/page.tsx` — Vista detalle de la rutina:
  - Secciones colapsables por Day
  - Modo lectura y modo edición (toggle)
  - En modo edición: añadir/eliminar/reordenar días y ejercicios
- [ ] Componente `RoutineForm.tsx` — Crear/editar nombre y notas de la rutina
- [ ] Componente `DaySection.tsx` — Sección de un día con su lista de ejercicios
- [ ] Componente `PredefinedSetForm.tsx` — Configurar sets predefinidos (peso/reps fijos o "copiar del anterior")
- [ ] Componente `SupersetBadge.tsx` — Indicador visual de grupo/superset con color
- [ ] Botón "Log All" por día — abre modal para confirmar/editar sets antes de añadir al workout

#### 2.4 UI Mobile — Rutinas
- [ ] `app/routines/index.tsx` — Lista de rutinas
- [ ] `app/routines/[id].tsx` — Detalle con días y ejercicios
- [ ] Bottom sheet para crear/editar rutina y días
- [ ] Pantalla de configuración de Predefined Sets
- [ ] Indicador de superset (barra de color lateral)
- [ ] Flujo "Log All" desde la rutina hacia el Home (workout del día)

#### 2.5 Lógica de "copiar valor anterior"
- [ ] Al ejecutar `logRoutineWorkout`, los sets con campo vacío se rellenan con el valor del último workout que usó esa rutina
- [ ] Si es la primera vez, los valores vacíos quedan en 0

### ✅ Tests de verificación — Fase 2

| ID | Test | Tipo | Criterio de éxito |
|----|------|------|-------------------|
| T2.1 | Store — createRoutine | Unit | `createRoutine()` genera rutina con ID único en el estado |
| T2.2 | Store — addDay | Unit | `addDay()` añade el día a la rutina correcta |
| T2.3 | Store — savePredefinedSets | Unit | Sets con campo vacío se marcan como `copy_previous: true` |
| T2.4 | Store — createSuperset | Unit | Dos ejercicios del mismo día comparten el mismo `group_id` |
| T2.5 | Repository — logRoutineWorkout | Integration | Crea workout con sets correctos en la fecha de hoy |
| T2.6 | Copiar valor anterior | Integration | Segunda ejecución de rutina: sets vacíos se rellenan con valores del workout anterior |
| T2.7 | Crear rutina web | E2E (Playwright) | Usuario crea rutina con 2 días y 3 ejercicios → visible en lista |
| T2.8 | Predefined sets web | E2E (Playwright) | Configurar 3 sets para un ejercicio → al hacer "Log All" aparecen los 3 sets en el workout |
| T2.9 | Superset web | E2E (Playwright) | Agrupar 2 ejercicios → ambos muestran barra de color y mismo group_id |
| T2.10 | Copiar rutina web | E2E (Playwright) | "Copy Routine" crea nueva rutina con mismo contenido y nombre "Copy of X" |
| T2.11 | Eliminar rutina web | E2E (Playwright) | Confirmación → rutina y todos sus datos desaparecen |
| T2.12 | Log rutina mobile | E2E (Detox) | "Log All" en día de rutina → workout del día se puebla con los sets |
| T2.13 | Reordenar días | E2E (Playwright) | Drag & drop cambia el `order_index` de los días; el nuevo orden persiste al recargar |

---

## Fase 3 — Registro de Entrenamientos

**Objetivo:** El usuario puede registrar entrenamientos completos, gestionar series, usar supersets y marcar series como completadas.

**Duración estimada:** 5–6 días

### Tareas

#### 3.1 Store de workout activo (packages/core)
- [ ] Implementar `stores/workoutStore.ts` completo:
  - Acciones: `startWorkout`, `addExerciseToWorkout`, `createSet`, `updateSet`, `deleteSet`, `markSetComplete`, `reorderSets`, `reorderExercises`, `addComment`, `groupExercises`, `ungroupExercise`, `finishWorkout`, `deleteWorkout`, `copyWorkout`, `moveWorkout`
- [ ] Lógica de superset: al crear set en ejercicio de un grupo → el store devuelve el siguiente ejercicio del grupo

#### 3.2 Capa de datos — Supabase
- [ ] Crear `packages/database/repositories/workoutRepository.ts`:
  - CRUD de `workouts`, `workout_exercises`, `sets`
  - `getWorkoutByDate(date)`, `copyWorkout(fromDate, toDate)`, `moveWorkout(workoutId, newDate)`
  - `shareWorkout(workoutId)` — genera texto plano exportable

#### 3.3 UI Web — Training Screen
- [ ] `app/(app)/dashboard/page.tsx` — Pantalla principal: workout del día, navegación entre fechas
- [ ] `app/(app)/workout/[date]/page.tsx` — Detalle del workout de una fecha
- [ ] Componente `TrainingScreen.tsx` — Vista principal de sets para un ejercicio:
  - Campos dinámicos según tipo de ejercicio (Peso/Reps o Distancia/Tiempo)
  - Botones +/- para incrementar valores
  - Lista de sets con edición inline
  - Ícono de trofeo en sets que son PR
- [ ] Componente `SetRow.tsx` — Fila de set con checkbox de completado, ícono de comentario y trofeo
- [ ] Componente `SetCommentModal.tsx` — Modal para añadir/editar comentario de un set
- [ ] Componente `NavigationPanel.tsx` — Drawer lateral con lista de ejercicios del workout
- [ ] Componente `WorkoutCommentModal.tsx` — Comentario a nivel de workout
- [ ] Componente `WorkoutTimer.tsx` — Temporizador de duración del workout
- [ ] Componente `ShareWorkoutModal.tsx` — Selección de ejercicios/sets para exportar como texto
- [ ] Componente `CopyWorkoutModal.tsx` — Selección desde calendario para copiar workout
- [ ] Indicadores de progreso en Navigation Panel cuando "Mark Sets Complete" está activo

#### 3.4 UI Mobile — Training Screen
- [ ] `app/(tabs)/index.tsx` — Home Screen: workout del día con swipe entre fechas
- [ ] `app/workout/[exerciseId].tsx` — Training Screen en modal full screen
- [ ] Componente `SetRow.tsx` mobile — con checkbox, comentario y PR badge
- [ ] Navigation Panel como drawer deslizable desde el borde izquierdo
- [ ] Auto-jump al siguiente ejercicio del superset al guardar set
- [ ] Auto-jump al siguiente ejercicio al completar todos los sets ("Mark Sets Complete")

#### 3.5 Gestión del workout
- [ ] Eliminar ejercicio del workout (long-press → selección múltiple → eliminar)
- [ ] Reordenar ejercicios desde Home Screen y Navigation Panel
- [ ] Copiar workout desde otro día
- [ ] Mover workout a otra fecha
- [ ] Auto-start timer al crear primer set (opcional, configurable)

### ✅ Tests de verificación — Fase 3

| ID | Test | Tipo | Criterio de éxito |
|----|------|------|-------------------|
| T3.1 | Store — createSet | Unit | Set se añade al ejercicio correcto del workout activo |
| T3.2 | Store — updateSet | Unit | Valores del set se actualizan correctamente en el estado |
| T3.3 | Store — deleteSet | Unit | Set eliminado; comentario asociado también se elimina |
| T3.4 | Store — superset auto-jump | Unit | Al crear set en ejercicio A de grupo, `nextExerciseId` retorna B |
| T3.5 | Store — markSetComplete (todos) | Unit | Al completar todos los sets de un ejercicio, `allComplete` es `true` |
| T3.6 | Repository — getWorkoutByDate | Integration | Retorna workout correcto para la fecha dada del usuario autenticado |
| T3.7 | Repository — copyWorkout | Integration | Workout copiado tiene mismos ejercicios y sets en la nueva fecha |
| T3.8 | Crear set web | E2E (Playwright) | Rellenar peso/reps + "Save" → set aparece en la lista |
| T3.9 | Editar set web | E2E (Playwright) | Tocar set → valores en formulario → "Update" → lista refleja cambio |
| T3.10 | Comentario de set web | E2E (Playwright) | Añadir comentario → ícono cambia a azul; texto visible al reabrir |
| T3.11 | PR badge web | E2E (Playwright) | Set que supera PR anterior muestra ícono de trofeo |
| T3.12 | Navigation panel web | E2E (Playwright) | Abrir panel → lista de ejercicios del workout → click navega al ejercicio |
| T3.13 | Mark sets complete web | E2E (Playwright) | Checkbox en todos los sets → prompt de "¿pasar al siguiente ejercicio?" |
| T3.14 | Share workout web | E2E (Playwright) | "Share Workout" genera texto con nombre de ejercicios y sets seleccionados |
| T3.15 | Copy workout web | E2E (Playwright) | Copiar workout de ayer → hoy muestra los mismos ejercicios |
| T3.16 | Crear set mobile | E2E (Detox) | Guardar set en Training Screen → aparece en Set List |
| T3.17 | Superset auto-jump mobile | E2E (Detox) | Guardar set en ejercicio A del grupo → pantalla salta a ejercicio B |

---

## Fase 4 — Seguimiento del Progreso

**Objetivo:** El usuario puede ver su historial de entrenamiento, gráficas de progreso, récords personales, estadísticas y objetivos por ejercicio.

**Duración estimada:** 5–6 días

### Tareas

#### 4.1 Store de progreso (packages/core)
- [ ] Implementar `stores/progressStore.ts`:
  - Estado: `personalRecords`, `goals`, `statistics`
  - Acciones: `loadPersonalRecords`, `loadStatistics`, `addGoal`, `updateGoal`, `deleteGoal`
- [ ] Implementar `utils/calculations.ts`:
  - `calculate1RM(weight, reps)` — fórmula Brzycki
  - `estimateRepMax(oneRM, reps)`
  - `calculateVolume(sets)`
  - `calculatePace(distance, timeSeconds)`
  - `calculateSpeed(distance, timeSeconds)`

#### 4.2 Capa de datos — Supabase
- [ ] Crear `packages/database/repositories/progressRepository.ts`:
  - `getPersonalRecords(exerciseId)`, `getPersonalRecordHistory(exerciseId, reps)`
  - `getStatistics(exerciseId, period, date)`
  - `getGoals(exerciseId)`, `createGoal()`, `updateGoal()`, `deleteGoal()`
  - `getProgressGraphData(exerciseId, graphType)` — agrupa datos por workout para gráficas

#### 4.3 UI Web — Progreso
- [ ] `app/(app)/progress/page.tsx` — Vista general de progreso
- [ ] Componente `TrainingHistory.tsx` — Historial completo del ejercicio con sets y PRs resaltados; acciones: "View Workout", "Edit Sets", "Copy Sets"
- [ ] Componente `ProgressChart.tsx` — Gráfica de línea (Recharts) con:
  - Selector de tipo de gráfica (dropdown)
  - Puntos interactivos con detalle al hacer click
  - Línea de tendencia (toggle)
  - Opción Y-axis desde 0
  - Botón "Share" para exportar imagen
- [ ] Componente `PersonalRecords.tsx` — Tabs Estimado / Real; historial de PR por rep-count
- [ ] Componente `ExerciseStats.tsx` — Estadísticas con selector de período
- [ ] Componente `GoalsList.tsx` — Lista de objetivos con barra de progreso
- [ ] Componente `ExerciseOverview.tsx` — Vista unificada: historial + gráfica + records + stats + goals en un solo panel (abre desde Training Screen o Calendar)

#### 4.4 UI Mobile — Progreso
- [ ] `app/(tabs)/progress.tsx` — Lista de ejercicios con últimos PRs
- [ ] Tabs en Training Screen: "Sets" | "History" | "Graph"
- [ ] Pantalla Records/Stats/Goals accesible desde botón en Training Screen
- [ ] Gráficas con Victory Native o Skia
- [ ] Exercise Overview como modal full screen

#### 4.5 Tipos de gráficas a implementar
- [ ] Estimated 1RM, Max Weight, Workout Volume, Total Reps, Max Reps
- [ ] Weight & Reps (por rep-count seleccionable), Rep Maxes
- [ ] Max Distance, Max Time, Max Speed, Max Pace, Total Distance, Total Time

### ✅ Tests de verificación — Fase 4

| ID | Test | Tipo | Criterio de éxito |
|----|------|------|-------------------|
| T4.1 | Brzycki formula | Unit | `calculate1RM(100, 5)` retorna `~116.67` (±0.01) |
| T4.2 | calculateVolume | Unit | `calculateVolume([{weight:100,reps:5},{weight:100,reps:5}])` retorna `1000` |
| T4.3 | calculateSpeed | Unit | `calculateSpeed(10, 3600)` retorna `10` (km/h) |
| T4.4 | PR precedencia | Unit | PR de 5 reps con 50 kg supercede PR de 4 reps con 40 kg |
| T4.5 | Repository — getPersonalRecords | Integration | Retorna records correctos para el ejercicio y usuario |
| T4.6 | Repository — getProgressGraphData | Integration | Dataset correcto para tipo "Max Weight" por workout |
| T4.7 | Gráfica se renderiza web | E2E (Playwright) | Componente `ProgressChart` visible con datos; no muestra estado de error |
| T4.8 | Seleccionar punto en gráfica | E2E (Playwright) | Click en punto → detalle aparece debajo con fecha y valor |
| T4.9 | Cambiar tipo de gráfica | E2E (Playwright) | Selector cambia a "Workout Volume" → gráfica y eje Y se actualizan |
| T4.10 | Trend line toggle | E2E (Playwright) | Activar trend line → línea discontinua aparece sobre la gráfica |
| T4.11 | Records tab — estimado | E2E (Playwright) | Tab "Estimated" muestra 1RM calculado con la fórmula Brzycki |
| T4.12 | Records tab — real | E2E (Playwright) | Tab "Actual" lista RMs reales; valores supersedidos aparecen atenuados |
| T4.13 | Crear objetivo | E2E (Playwright) | Añadir goal "100 kg" → barra de progreso refleja avance actual |
| T4.14 | Training history — edit sets | E2E (Playwright) | Editar set desde historial → workout histórico se actualiza |
| T4.15 | Exercise Overview abre | E2E (Playwright) | Click en ejercicio desde Calendar → abre Exercise Overview con 5 tabs |

---

## Fase 5 — Body Tracker & Calendario

**Objetivo:** El usuario puede registrar medidas corporales con gráficas de progreso y navegar su historial de entrenamientos en un calendario visual.

**Duración estimada:** 4–5 días

### Tareas

#### 5.1 Body Tracker — Store y datos
- [ ] Implementar `stores/bodyTrackerStore.ts`:
  - Estado: `measurements`, `entries`, `enabledMeasurements`
  - Acciones: `loadMeasurements`, `enableMeasurement`, `disableMeasurement`, `createMeasurement`, `updateMeasurement`, `deleteMeasurement`, `addEntry`, `resetMeasurement`, `reorderMeasurements`
- [ ] Crear `packages/database/repositories/bodyTrackerRepository.ts`
- [ ] Añadir tablas `body_measurements` y `body_measurement_entries` a migración SQL

#### 5.2 UI Web — Body Tracker
- [ ] `app/(app)/body-tracker/page.tsx` — Tabs: Track | History | Graph
- [ ] Track: lista de medidas habilitadas con último valor y delta (+/-)
- [ ] Modal para registrar nuevo valor con fecha/hora personalizable y comentario
- [ ] History: agrupado por fecha con deltas coloreados según goal (verde/rojo)
- [ ] Graph: gráfica de línea por medida con línea de objetivo específico si aplica
- [ ] `app/(app)/body-tracker/settings/page.tsx` — Configurar medidas (habilitar, crear custom, reordenar)
- [ ] Unidades predefinidas: kg, lbs, cm, in, %; opción de unidad custom

#### 5.3 UI Mobile — Body Tracker
- [ ] Pantalla accesible desde overflow menu del Home
- [ ] Misma estructura de tabs: Track | History | Graph
- [ ] Bottom sheet para registrar nuevo valor

#### 5.4 Calendario — Store y datos
- [ ] Crear `packages/database/repositories/calendarRepository.ts`:
  - `getWorkoutDates(month)` — fechas con categorías para mostrar dots
  - `getWorkoutSummary(date)` — resumen de ejercicios del día
  - `filterWorkouts(categoryIds, matchAll)`, `filterWorkoutsByExercise(exerciseId, conditions)`

#### 5.5 UI Web — Calendario
- [ ] `app/(app)/calendar/page.tsx` — Vista mensual con dots de color por categoría
- [ ] Click en día → popup con resumen del workout; click en ejercicio → Exercise Overview
- [ ] Toggle: Workout Panel (panel inferior), Category Dots, Navigation Bar
- [ ] List View: historial cronológico de todos los workouts
- [ ] Filtro por categoría (Match All / Match Any)
- [ ] Filtro por ejercicio con condiciones avanzadas (ej: peso ≥ 100 kg, reps ≥ 5)

#### 5.6 UI Mobile — Calendario
- [ ] `app/(tabs)/calendar.tsx` — Vista mensual nativa
- [ ] Dots de colores por categoría debajo de cada día
- [ ] Swipe left/right entre meses
- [ ] List View alternativo

### ✅ Tests de verificación — Fase 5

| ID | Test | Tipo | Criterio de éxito |
|----|------|------|-------------------|
| T5.1 | Store — addEntry | Unit | Entrada añadida; delta calculado respecto al valor anterior |
| T5.2 | Store — delta color | Unit | Medida con goal "Decrease": entrada mayor → delta marcado como negativo |
| T5.3 | Store — disableMeasurement | Unit | Deshabilitar no elimina entradas existentes |
| T5.4 | Repository — bodyTracker RLS | Integration | Entradas de otro usuario no son visibles |
| T5.5 | Registrar medida web | E2E (Playwright) | Track → seleccionar medida → ingresar valor → Save → lista se actualiza con delta |
| T5.6 | Gráfica body tracker | E2E (Playwright) | Graph muestra línea de datos; línea de objetivo visible si goal es "Specific Value" |
| T5.7 | Custom measurement | E2E (Playwright) | Crear medida custom "Calorías" con unidad "kcal" → aparece en Track habilitada |
| T5.8 | Reset measurement | E2E (Playwright) | Reset → historial de la medida queda vacío; medida sigue en la lista |
| T5.9 | Calendario dots colores | E2E (Playwright) | Días con workout muestran dots; colores corresponden a categorías del workout |
| T5.10 | Popup workout desde calendario | E2E (Playwright) | Click en día → popup con ejercicios → click en ejercicio → Exercise Overview |
| T5.11 | Filtro categoría calendario | E2E (Playwright) | Seleccionar categoría "Chest" → solo días con ejercicios de Chest visibles |
| T5.12 | Filtro ejercicio avanzado | E2E (Playwright) | Filtrar "Bench Press ≥ 100 kg" → solo días donde se cumple la condición |
| T5.13 | List View calendario | E2E (Playwright) | Lista muestra todos los workouts en orden cronológico inverso |

---

## Fase 6 — Herramientas de Entrenamiento

**Objetivo:** Implementar las herramientas auxiliares: Rest Timer, Calculadora 1RM, Set Calculator y Plate Calculator.

**Duración estimada:** 3–4 días

### Tareas

#### 6.1 Lógica de herramientas (packages/core)
- [ ] `utils/calculations.ts` — ampliar con:
  - `calculatePlates(targetWeight, barWeight, availablePlates)` — algoritmo greedy
  - `calculateSetWeight(baseWeight, percentage)` — para Set Calculator
  - `roundToNearest(value, increment)` — para "Round To Closest"

#### 6.2 Rest Timer
- [ ] Componente `RestTimer.tsx` (web y mobile):
  - Countdown configurable por ejercicio (desde Exercise Notes) o manualmente
  - Opciones: Vibrar al llegar a 0, Sonido (beep), Auto-start al guardar set
  - Control de volumen del sonido
  - Notificación persistente en mobile mientras el timer corre
  - Persiste el último tiempo usado

#### 6.3 1RM Calculator
- [ ] Componente `OneRMCalculator.tsx` (web y mobile):
  - Inputs: Peso y Reps
  - Muestra tabla de RM estimados: 1RM → 15RM
  - Se abre desde el overflow menu de la Training Screen

#### 6.4 Set Calculator
- [ ] Componente `SetCalculator.tsx` (web y mobile):
  - Input de peso base con botón "Select Max" (abre lista de PRs del ejercicio)
  - Selector de porcentaje (lista predefinida o input libre)
  - Botón "Round To Closest" (2.5 / 5.0 / 10.0 kg)
  - Botón "Add To Workout" — crea set con el peso calculado

#### 6.5 Plate Calculator
- [ ] Componente `PlateCalculator.tsx` (web y mobile):
  - Input de peso objetivo
  - Visualización de discos por lado de la barra
  - Pantalla de configuración: lista de discos disponibles (checkbox), peso de barra configurable por ejercicio
  - Discos por defecto en kg y lbs
  - Opción de crear disco personalizado

#### 6.6 Integración en Training Screen
- [ ] Rest Timer accesible desde botón en Training Screen (web y mobile)
- [ ] 1RM, Set Calculator y Plate Calculator desde overflow menu (web) y menú de opciones (mobile)

### ✅ Tests de verificación — Fase 6

| ID | Test | Tipo | Criterio de éxito |
|----|------|------|-------------------|
| T6.1 | calculatePlates — caso básico | Unit | `calculatePlates(100, 20, [20,15,10,5,2.5])` retorna `[{plate:20,count:2},{plate:10,count:1}]` por lado |
| T6.2 | calculatePlates — barra vacía | Unit | `calculatePlates(20, 20, [...])` retorna array vacío (solo la barra) |
| T6.3 | calculateSetWeight | Unit | `calculateSetWeight(100, 0.75)` retorna `75` |
| T6.4 | roundToNearest | Unit | `roundToNearest(73, 2.5)` retorna `72.5` |
| T6.5 | Rest Timer countdown | Unit | Timer iniciado en 60s → después de 1s el estado muestra 59s |
| T6.6 | Rest Timer auto-start | E2E (Playwright) | Con auto-start activo, guardar set → timer inicia automáticamente |
| T6.7 | 1RM Calculator tabla | E2E (Playwright) | Ingresar 100 kg × 5 reps → tabla muestra 1RM ≈ 116 kg y 5RM = 100 kg |
| T6.8 | Set Calculator — Select Max | E2E (Playwright) | "Select Max" abre PRs del ejercicio; seleccionar 1RM → rellena el campo base |
| T6.9 | Set Calculator — Add To Workout | E2E (Playwright) | Calcular peso → "Add To Workout" → set aparece en la lista de la Training Screen |
| T6.10 | Plate Calculator render | E2E (Playwright) | Ingresar 100 kg con barra 20 kg → muestra 2×20 kg por lado |
| T6.11 | Plate Calculator config | E2E (Playwright) | Desmarcar disco 20 kg → recalcula sin ese disco |
| T6.12 | Rest Timer notificación mobile | E2E (Detox) | Timer activo → notificación visible en barra de estado del dispositivo |

---

## Fase 7 — Pulido, Performance & Lanzamiento

**Objetivo:** Optimizar rendimiento, completar configuración de la app, sincronización offline y preparar el lanzamiento en producción.

**Duración estimada:** 5–7 días

### Tareas

#### 7.1 Configuración y Settings
- [ ] `app/(app)/settings/page.tsx` (web) y pantalla equivalente (mobile)
- [ ] General: tema (light/dark), sistema de unidades (kg/lbs), día inicio de semana, incremento de peso por defecto, Track Personal Records, Mark Sets Complete, Auto-Select Next Set, Keep Screen On
- [ ] Data: Backup manual (`.fitnotes`), Restore backup, Backup automático a Google Drive, Exportación CSV (workout + body tracker), Recalcular PRs, Eliminar historial de entrenamientos (por rango/ejercicio)
- [ ] Dark mode: implementar en web (next-themes) y mobile (Appearance API de RN)

#### 7.2 Sync offline-first (mobile)
- [ ] Implementar `packages/database/sync/syncEngine.ts`:
  - `pushLocalChanges()` — sube cambios de SQLite local a Supabase
  - `pullRemoteChanges()` — descarga cambios de Supabase a SQLite
  - `resolveConflicts()` — last-write-wins por `updated_at`
- [ ] Cola de operaciones pendientes para cuando no hay red
- [ ] Indicador visual de estado de sincronización en mobile
- [ ] Manejo de errores de red sin crash

#### 7.3 Performance web
- [ ] Virtualización de listas largas (Training History, Exercise List) con `react-window` o `tanstack-virtual`
- [ ] `loading.tsx` y `error.tsx` en cada segmento de ruta (App Router)
- [ ] Optimistic updates en operaciones CRUD frecuentes (crear set, toggle favorito)
- [ ] Lighthouse score ≥ 90 en Performance, Accessibility y Best Practices

#### 7.4 Performance mobile
- [ ] Lazy loading de pantallas con `React.lazy` y `Suspense`
- [ ] Hermes engine activado
- [ ] Reducir re-renders con `React.memo` en componentes de lista

#### 7.5 Accesibilidad
- [ ] Todos los botones e iconos interactivos tienen `aria-label` (web) y `accessibilityLabel` (mobile)
- [ ] Contraste de color mínimo WCAG AA en ambas plataformas
- [ ] Navegación por teclado funcional en web

#### 7.6 Preparación para producción
- [ ] Variables de entorno de producción configuradas en Vercel y EAS
- [ ] `eas build` genera APK/IPA sin errores
- [ ] `next build` sin warnings de tipo ni errores
- [ ] Rate limiting en Supabase Edge Functions si aplica
- [ ] README actualizado con instrucciones de contribución

### ✅ Tests de verificación — Fase 7

| ID | Test | Tipo | Criterio de éxito |
|----|------|------|-------------------|
| T7.1 | Dark mode web | E2E (Playwright) | Toggle dark mode → clases `dark:` aplicadas; recarga mantiene preferencia |
| T7.2 | Dark mode mobile | E2E (Detox) | Cambiar a dark → todos los fondos y textos reflejan el tema oscuro |
| T7.3 | Backup y restore | Integration | Generar backup → borrar datos → restore → datos idénticos al original |
| T7.4 | CSV export workout | Integration | CSV generado contiene columnas: date, exercise, set, weight, reps, comment |
| T7.5 | Sync offline — push | Integration | Crear set sin red → red disponible → set aparece en Supabase |
| T7.6 | Sync offline — pull | Integration | Crear workout en web → abrir mobile → workout visible después de sync |
| T7.7 | Conflict resolution | Integration | Mismo set editado en web y mobile → versión con `updated_at` más reciente prevalece |
| T7.8 | Lighthouse web | Performance | Score ≥ 90 en Performance, Accessibility, Best Practices en `/dashboard` |
| T7.9 | Lista larga virtualizada | Performance | Exercise list con 500 ejercicios → scroll fluido (≥ 60 fps), tiempo inicial < 200ms |
| T7.10 | Optimistic update | E2E (Playwright) | Crear set → aparece en UI inmediatamente sin esperar respuesta del servidor |
| T7.11 | Accesibilidad teclado | Accessibility (axe) | Flujo crear ejercicio completable solo con teclado; sin trampas de foco |
| T7.12 | Build producción web | CI | `next build` en GitHub Actions sin errores ni type errors |
| T7.13 | Build producción mobile | CI | `eas build --platform all` finaliza con APK e IPA descargables |
| T7.14 | RLS producción | Security | Desde Supabase Studio con usuario B: query a datos de usuario A retorna 0 filas |

---

## Resumen de Fases

| Fase | Descripción | Tests | Duración est. |
|------|-------------|-------|---------------|
| 0 | Setup & Página de Inicio | 8 | 2–3 días |
| 1 | Gestión de Ejercicios | 14 | 4–5 días |
| 2 | Rutinas | 13 | 4–5 días |
| 3 | Registro de Entrenamientos | 17 | 5–6 días |
| 4 | Seguimiento del Progreso | 15 | 5–6 días |
| 5 | Body Tracker & Calendario | 13 | 4–5 días |
| 6 | Herramientas de Entrenamiento | 12 | 3–4 días |
| 7 | Pulido, Performance & Lanzamiento | 14 | 5–7 días |
| **Total** | | **106 tests** | **32–41 días** |

---

## Convenciones generales

- **Commits**: `feat(fase-N): descripción` / `fix(fase-N): descripción` / `test(fase-N): descripción`
- **Branches**: `phase/N-descripcion-corta`
- **Definition of Done**: fase completada cuando todos sus tests pasan en CI y el PR está mergeado a `main`
- **No regresiones**: cada PR ejecuta los tests de todas las fases anteriores

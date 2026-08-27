# Referencia — `apps/mobile`

_Generado a partir de la documentación TSDoc/JSDoc añadida al código fuente (2026-07-16). Expo SDK 52, Expo Router v4, React Native — offline-first con cuenta opcional (`useRepositories()` para CRUD contra SQLite local)._

## `app/` — raíz y auth
| Archivo | Responsabilidad |
|---|---|
| `_layout.tsx` | Stack raíz: `RepositoryProvider` + toda la lógica de identidad (invitado/cuenta real), claim de datos de invitado y sincronización — **sin auth guard**. `AppContent` resuelve sesión/identidad al arrancar, reacciona a cambios de auth, dispara sync en foreground/reconexión. `handleSessionChange` implementa el guard `isExplicitSignOut` (distingue un `SIGNED_OUT` real de un fallo de restauración de sesión tras `force-stop`). `hydratePreferencesFromSession` sincroniza preferencias locales desde `user_metadata` (remoto gana) |
| `index.tsx` | Pantalla de bienvenida en `/`, no usada en el flujo real de arranque (el layout raíz redirige siempre a `(tabs)`) |
| `(auth)/_layout.tsx` | Stack sin cabecera para login/registro — alcanzable solo desde Configuración, no un gate de arranque |
| `(auth)/login.tsx` / `register.tsx` | Formularios de email/contraseña contra Supabase (`signInWithPassword` / `signUp`) |

## `app/(tabs)/` — 6 tabs
| Archivo | Responsabilidad |
|---|---|
| `_layout.tsx` | Declara las 6 `Tabs.Screen` con iconos Ionicons activo/inactivo según tema |
| `index.tsx` (Hoy) | Ciclo de vida completo del entrenamiento diario: iniciar desde rutina, copiar/mover, reordenar (drag&drop), selección múltiple + borrado, temporizador, resumen final + compartir |
| `calendar.tsx` | Grid mensual navegable por swipe/flechas, panel del día, filtros combinables, toggles de preferencia persistidos |
| `exercises.tsx` | Catálogo agrupado por categoría con búsqueda global, FAB crear ejercicio/categoría, reorder de categorías drag&drop (`CategoryCard`, `ExerciseRow`) |
| `progress.tsx` | PRs expandibles con 1RM estimado (Brzycki), resumen semanal por categoría, acceso a Objetivos |
| `settings.tsx` | Perfil, preferencias (siempre resueltas localmente, con replicación a `user_metadata` si hay cuenta), backup/CSV/restaurar/eliminar historial/cuenta gateados con `requireAccount()`, cerrar sesión |
| `tools.tsx` (tab "Rutinas", nombre de archivo histórico) | Listar/crear/editar/copiar/eliminar rutinas; menú `Modal` propio (no `Alert.alert`, límite de 3 botones en Android) |

## `app/` — rutas de detalle (no-tab)
| Ruta | Responsabilidad |
|---|---|
| `body-tracker/index.tsx` | CRUD de medidas + entradas en 3 pestañas (Registrar/Historial/Gráfico), drag&drop de orden, tap-en-gráfico → medidas relacionadas del mismo día |
| `calculators.tsx` | 4 calculadoras: 1RM, porcentaje de set (con "añadir al entrenamiento de hoy"), discos de barra, IMC |
| `exercise-history/[exerciseId].tsx` | Historial/Gráfico/Estadísticas de un ejercicio: edición/borrado individual y en lote, métricas con línea de tendencia, exportación de imagen (view-shot) |
| `exercises/[categoryId].tsx` | Ejercicios de una categoría: buscar/crear/editar (incl. conversión de peso histórico)/eliminar/favorito |
| `goals/index.tsx` | CRUD de objetivos por ejercicio (peso y/o reps), barra de progreso, comprobación automática de logros al cargar |
| `routines/[id].tsx` | Detalle de rutina: días/ejercicios drag&drop, supersets, series predefinidas, registrar un día como entrenamiento nuevo. Contiene el fix de race condition `psLoadingForRef` en la carga de series predefinidas |
| `search/index.tsx` | Búsqueda global sobre datos ya cargados, prioriza usados recientemente |
| `workout-detail/[workoutId].tsx` | Vista de solo lectura de un entrenamiento arbitrario por id |
| `workout/[exerciseId].tsx` | CRUD de series del entrenamiento activo, supersets, temporizador de descanso (vibración+sonido+haptics), pestañas de historial/gráfico. `ExercisePickerItem` — fila memoizada del selector de "añadir ejercicio" |

## `lib/`
| Archivo | Export | Responsabilidad |
|---|---|---|
| `cryptoPolyfill.ts` | (efecto secundario) | Polyfill de `crypto.randomUUID()` para Hermes vía `expo-crypto` |
| `db/client.ts` | `getLocalDb`, `resetLocalDb` | Singleton de SQLite local: abre, aplica migraciones y devuelve el `SqlExecutor` compartido; `resetLocalDb` cierra+borra+reabre (sign-out/cambio de cuenta) |
| `netinfo.ts` | `useNetworkStatus` | Estado de conectividad real (no solo enlace), dispara sync al reconectar |
| `supabase.ts` | `supabase` | Cliente Supabase con `FileStorage` (no AsyncStorage) como storage de auth; usado por `SyncEngine` y pantallas de cuenta, no por la UI de datos |
| `sync.ts` | `getSyncEngine` | Construye/memoiza el `SyncEngine` compartido conectado a Supabase + DB local |
| `theme.ts` | `useThemeModeStore`, `Colors`, `ThemeColors` (type), `useTheme`, `ThemeMode` (type) | Store zustand del modo de tema elegido (fuera de `packages/core` por depender de `useColorScheme` de RN) + paleta light/dark + hook de resolución |

## `contexts/`
| Archivo | Export | Responsabilidad |
|---|---|---|
| `RepositoryContext.tsx` | `RepositoryProvider`, `useRepositories` | DI de los 7 repos locales offline + identidad invitado/cuenta (claim/wipe). `RepositoryProvider` abre/espera la DB local; `useRepositories()` expone `db`, los 7 repos, `userId`/`isGuest`, `refreshIdentity`, `wipeAndSetIdentity` |
| `SyncContext.tsx` | `SyncContext`, `useSyncStatus` | Estado de solo lectura de sincronización (`status`, `pendingCount`, `lastSyncAt`, `refetchSignal`), provisto realmente desde `_layout.tsx` |

## `components/`
| Componente | Responsabilidad |
|---|---|
| `DateInput` | Selector de fecha con `DateTimePicker` nativo, formato español, hora fijada a mediodía (evita desfases de zona horaria) |
| `LineChart` | Gráfica SVG con degradado, línea de tendencia/objetivo opcional, tap-to-select por punto (resuelve el tap a un índice de punto vía segmentos centrados) |

> **2026-07-16**: eliminados `ui/Button.tsx`, `ui/Input.tsx`, `workout/RestTimer.tsx`, `workout/SetRow.tsx` y `workout/TrainingScreen.tsx` — scaffolds NativeWind sin usar desde ninguna pantalla real (confirmado por grep, cero imports); la implementación real del entrenamiento vive inline en `app/workout/[exerciseId].tsx`.

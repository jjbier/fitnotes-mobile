# FitNotes App — Resumen ejecutivo técnico

_Generado por análisis directo del código fuente y la documentación de arquitectura del repositorio · última actividad registrada: 2026-07-03_

## 1. Propósito del sistema

**FitNotes App** es una aplicación de seguimiento de entrenamiento de fuerza y fitness (workout logging), construida como réplica funcional y visual completa de la app de referencia "FitNotes" (Android original), pero con dos clientes propios: **web** y **mobile**, compartiendo la misma lógica de negocio.

Problema que resuelve: permitir a un usuario registrar entrenamientos (ejercicios, series, repeticiones, peso, distancia, tiempo según el tipo de ejercicio), ver su progreso histórico (récords personales, 1RM estimado, gráficas), planificar rutinas reutilizables, hacer seguimiento corporal (peso, medidas) y fijar objetivos — todo con cálculos deportivos estándar (1RM vía fórmula de Brzycki, cálculo de discos de barra, ritmo/velocidad en cardio).

La particularidad más relevante del proyecto es que la app **mobile funciona 100% sin necesidad de crear una cuenta** desde el primer arranque (modo invitado local), y la cuenta pasa a ser una activación opcional de sincronización en la nube — no una barrera de entrada.

## 2. Stack tecnológico

**Monorepo**: Turborepo 2 + pnpm workspaces, TypeScript estricto (`strict` + `verbatimModuleSyntax`).

| Capa | Tecnología |
|---|---|
| Web | Next.js 15 (App Router), React 19, Tailwind CSS v4, Recharts (gráficas), Radix UI (primitivas de diálogo/dropdown/tabs), `lucide-react` (iconos), `@tanstack/react-virtual` (listas virtualizadas) |
| Mobile | Expo SDK 52, React Native 0.76, Expo Router v4, `react-native-reanimated`/`gesture-handler` (animaciones/drag&drop), `nativewind` (solo como transformer Metro, no en componentes — se usa `StyleSheet`), `expo-sqlite` (BD local), `expo-crypto` (UUIDs), `expo-av` (sonido), `@react-native-community/netinfo` (detección de red) |
| Lógica compartida | `packages/core` — TypeScript puro (cero dependencias de plataforma), Zustand 5 + Immer para estado, Zod para validación |
| Backend / datos | Supabase (Postgres + Auth + RLS + funciones RPC), `@supabase/supabase-js` + `@supabase/ssr` (versiones fijadas para evitar romper genéricos) |
| Testing | Vitest (306 tests: 219 en core + 87 en database), Playwright (E2E web, 13 specs/66 tests), Detox (E2E mobile, dispositivo físico) |
| CI/CD | GitHub Actions + Dependabot, despliegue web en Vercel |

## 3. Arquitectura y módulos principales

```
apps/web            Next.js — cliente que SIEMPRE requiere cuenta (Supabase remoto)
apps/mobile          Expo — cliente offline-first con cuenta opcional
packages/core        Lógica de negocio pura (tipos, stores Zustand, cálculos, utils)
packages/database    Acceso a datos: repositorios remotos (Supabase) + repositorios
                     locales (SQLite) + motor de sincronización
packages/ui          Vacío (sin implementar)
```

**Patrón central: Repository Pattern espejado.** Cada entidad (workouts, exercises, routines, body-tracker, goals, progress) tiene un repositorio remoto (`createXxxRepository(supabaseClient)`) y, para mobile, un repositorio local SQLite con **el mismo nombre de método y misma forma de respuesta** (`{data, error}`). Esto permite que la UI de mobile hable siempre con SQLite local sin saber si hay red o cuenta.

**Módulos funcionales (ambos clientes, 6 secciones de navegación equivalentes):**
- **Hoy/Dashboard** — entrenamiento del día, franja semanal + racha, cronómetro pausable, resumen al finalizar
- **Ejercicios** — catálogo por categorías, historial, favoritos, tipos de ejercicio (10 variantes: peso+reps, solo reps, distancia+tiempo, etc.)
- **Progreso** — récords personales, 1RM estimado, gráficas de evolución, estadísticas por periodo
- **Calendario** — vista mensual con entrenamientos por categoría, filtros
- **Rutinas** — plantillas reutilizables con días, ejercicios, series predefinidas y supersets (grupos de ejercicios)
- **Configuración** — perfil, unidades, backup/restore, exportación CSV, integración con Google Drive, gestión de cuenta
- **Body tracker** y **Herramientas** (calculadoras 1RM/porcentaje/discos/temporizador de descanso) — accesibles desde Configuración, no como pestañas de primer nivel

**Capa offline de mobile (la pieza arquitectónica más compleja):**
- Base de datos SQLite local que espeja 13 tablas remotas, con UUIDs reales generados en cliente (nunca IDs temporales), tombstones para deletes (evita "resucitar" filas borradas en un pull concurrente), y cascadas de claves foráneas replicadas a mano.
- Un `SyncEngine` con cola de operaciones pendientes durable en SQLite, resolución de conflictos (gana lo local si está "sucio", si no gana el más reciente por `updated_at`), y disparadores de sincronización al volver a primer plano o reconectar red.
- Identidad de "invitado" (`local_identity`): un UUID generado en el dispositivo resuelve siempre un `userId` de escritura, incluso sin cuenta. Al crear/vincular una cuenta real, un proceso de "claim" reescribe ese `user_id` en las 13 tablas y en las operaciones ya encoladas, dentro de una transacción — sin necesidad de un paso de "primer sync" aparte.
- Récords personales (PRs) se calculan localmente en JavaScript replicando exactamente el trigger SQL remoto, para que el modo invitado también genere trofeos sin depender de red.

## 4. Flujos de datos más importantes

1. **Registrar un set de entrenamiento (mobile, offline)**: UI → repo local SQLite (INSERT con UUID real, en transacción) → se encola una operación pendiente → si aplica, se calcula un nuevo récord personal en la misma transacción → cuando hay red, el `SyncEngine` la empuja a Supabase respetando el orden de dependencias (padres antes que hijos).
2. **Sincronización cross-device**: al recuperar foreground o reconectar red, el motor hace *pull* paginado por marca de agua (`updated_at`) por tabla, aplica filas remotas (con reglas de conflicto) y notifica a las pantallas qué tablas cambiaron para que releean solo desde SQLite (no vuelven a pedir a Supabase).
3. **Registrar un set (web)**: UI → Supabase directamente (RLS filtra por `auth.uid()`) → un trigger SQL en Postgres recalcula el récord personal automáticamente.
4. **Vincular cuenta desde modo invitado**: login/registro → detecta que el `user_id` de sesión difiere del invitado local → reescribe `user_id` en todas las tablas locales y pendientes → un `sync()` normal hace de "bootstrap" completo (como los marcadores de agua están vacíos, el pull trae todo el histórico).
5. **Backup/restauración y CSV**: exportación/restauración completa de datos del usuario vía repositorio dedicado (`backupRepository`), disponible solo con cuenta real (no en modo invitado).

## 5. Integraciones con sistemas externos

| Integración | Estado | Detalle |
|---|---|---|
| Supabase | Activo | Backend as a service: Postgres (esquema con Row Level Security por usuario), Auth (email/password), funciones RPC (p. ej. `delete_user()` con `SECURITY DEFINER`), triggers SQL para récords personales |
| Google Drive API | Activo | Backup automático desde web (`/api/google/auth`, `/callback`, `/backup`, `/disconnect`): sube copias de seguridad y rota automáticamente, conservando solo las 5 más recientes |
| Vercel | Activo | Hosting y despliegue del cliente web, con headers de seguridad (CSP) duplicados en `vercel.json` |
| Expo Application Services (EAS) | Pendiente | `projectId` es aún un placeholder en `app.json` — requiere `eas init` con cuenta Expo real |

## 6. Estado actual

Ambos clientes tienen paridad funcional y visual completa frente a la app de referencia. El plan de "offline-first" en mobile (6 fases) está terminado y verificado en dispositivo físico.

**Limitaciones aceptadas (no bloqueantes):**
- **PRs duplicados tras claim+sync** — un récord generado offline y el mismo regenerado por el trigger SQL remoto al pushear el set pueden convivir como dos filas distintas.
- **Sesión no sobrevive a force-stop (Android)** — pese a persistencia configurada, forzar el cierre del proceso deja el sync detenido en silencio hasta iniciar sesión de nuevo manualmente.
- **Multi-dispositivo en modo invitado** — el mismo usuario como invitado en dos dispositivos antes de crear cuenta genera filas duplicadas al vincularse a la misma cuenta.

`packages/ui` sin implementar · sin gaps funcionales conocidos vs. app de referencia.

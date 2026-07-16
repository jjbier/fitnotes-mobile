# FitNotes App

App de seguimiento de fitness con registro de entrenamientos, PRs, rutinas, body tracker y calculadoras. Monorepo con **web** (Next.js 15) y **mobile** (Expo SDK 52) compartiendo lógica de negocio vía `@fitnotes/core`. Todo el producto está en español.

Rasgo distintivo: **mobile es 100% offline con cuenta opcional** — funciona por completo desde el primer arranque sin necesidad de login (identidad de invitado local), y crear/vincular una cuenta solo activa la sincronización en segundo plano. Web siempre requiere cuenta.

## Índice

- [Stack](#stack)
- [Estructura](#estructura)
- [Setup local](#setup-local)
- [Arquitectura offline (mobile)](#arquitectura-offline-mobile)
- [Desarrollo](#desarrollo)
- [Testing](#testing)
- [Build / Compilación](#build--compilación)
- [Despliegue](#despliegue)
- [CI/CD — GitHub Actions](#cicd--github-actions)
- [Google Drive backup (opcional)](#google-drive-backup-opcional)
- [Funcionalidades](#funcionalidades)
- [Packages](#packages)
- [Referencia de código](#referencia-de-código)
- [Problemas conocidos](#problemas-conocidos)
- [Contribuir](#contribuir)

## Stack

| Capa | Tecnología |
|------|------------|
| Monorepo | Turborepo 2 + pnpm workspaces |
| Lenguaje | TypeScript strict (`verbatimModuleSyntax`) |
| Web | Next.js 15 App Router, React 19, Tailwind CSS v4, Recharts, Radix UI |
| Mobile | Expo SDK 52, Expo Router v4, React Native 0.76, StyleSheet (no NativeWind en componentes) |
| Mobile — offline | `expo-sqlite` (BD local), `expo-crypto` (UUIDs), `@react-native-community/netinfo` |
| Estado | Zustand 5 + Immer |
| Backend | Supabase (Auth + Postgres + RLS + funciones RPC) |
| Validación | Zod 3 |
| Testing | Vitest (core + database), Playwright (web E2E), Detox (mobile E2E) |
| CI/CD | GitHub Actions + Dependabot, Vercel (web), EAS Build (mobile) |

## Estructura

```
fitnotes-app/
├── apps/
│   ├── web/            # Next.js 15 App Router (puerto 3000) — siempre requiere cuenta
│   └── mobile/         # Expo SDK 52 + Expo Router v4 — offline-first, cuenta opcional
├── packages/
│   ├── core/           # Lógica de negocio pura — CERO imports de react/next/expo
│   ├── database/       # Cliente Supabase + repositorios remotos + repos locales SQLite + SyncEngine
│   ├── ui/              # Vacío, sin implementar (reservado)
│   └── tsconfig/       # Presets TypeScript base/nextjs/expo
├── docs/
│   ├── reference/       # Referencia de código por módulo (generada, ver más abajo)
│   └── *.md             # Docs de producto (paridad con app de referencia) y resúmenes ejecutivos
└── .agent/context/      # Notas de arquitectura profundas para agentes/IA (decisiones, gotchas)
```

Detalle de cada carpeta en [Referencia de código](#referencia-de-código).

## Setup local

### Requisitos

- Node.js >= 20
- pnpm >= 9 (`npm i -g pnpm`)
- Proyecto en [Supabase](https://supabase.com)
- Para compilar mobile: Android Studio / Android SDK + JDK 17, o una cuenta Expo (EAS) para build en la nube
- Para Detox (E2E mobile): un dispositivo Android físico conectado por ADB (no se ha configurado emulador en este proyecto)

### Instalación

```bash
git clone <repo-url>
cd fitnotes-app
pnpm install
```

### Variables de entorno

```bash
# Web
cp .env.example apps/web/.env.local
# Mobile
cp .env.example apps/mobile/.env
# Editar ambos archivos con las credenciales de tu proyecto Supabase
```

| Variable | Dónde se usa | Dónde obtenerla |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | Supabase → Project Settings → API |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile/.env` | Supabase → Project Settings → API |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `apps/web/.env.local` (opcional) | Google Cloud Console → Credenciales — ver [Google Drive backup](#google-drive-backup-opcional) |
| `NEXT_PUBLIC_APP_URL` | `apps/web/.env.local` | URL canónica de la app (sin barra final) |
| `PLAYWRIGHT_USER_EMAIL` / `PLAYWRIGHT_USER_PASSWORD` | `apps/web/.env.local` (opcional, solo E2E) | Cuenta Supabase dedicada a tests — ver [Testing](#testing) |

### Base de datos

Aplicar las migraciones en tu proyecto Supabase. Los archivos SQL están en `packages/database/src/supabase/migrations/` (001 → 008 a fecha de este documento). Ejecutarlos **en orden** desde el SQL Editor de Supabase Studio, o vía la Management API si no tienes el CLI de Supabase instalado:

```bash
curl -X POST "https://api.supabase.com/v1/projects/<project-ref>/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query": "<contenido del archivo .sql>"}'
```

Genera un Personal Access Token en [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).

## Arquitectura offline (mobile)

Mobile no habla con Supabase directamente para el CRUD de pantallas — usa una capa de repositorios locales SQLite (`packages/database/src/local/`) que espeja 1:1 los repositorios remotos, más un `SyncEngine` que empuja/trae cambios en segundo plano cuando hay red y sesión real:

- **Identidad de invitado**: un UUID generado en el dispositivo (`local_identity`) resuelve el `userId` de escritura siempre presente, con o sin cuenta.
- **UUIDs reales desde el insert** (nunca IDs temporales) y **tombstones** en lugar de borrado físico (evita que un pull concurrente "resucite" una fila borrada offline).
- **Cascadas de FK replicadas a mano** (SQLite local corre sin `PRAGMA foreign_keys` a propósito).
- **Récords personales generados en JS** (`computePersonalRecordUpdate`, réplica pura del trigger SQL) para que el modo invitado también genere PRs sin depender de sync.
- Al vincular una cuenta real, un "claim" reescribe `user_id` de invitado → cuenta en las 13 tablas locales + operaciones ya encoladas, en una transacción.

Detalle completo (esquema, cola de sync, resolución de conflictos, gotchas): [`.agent/context/offline-sync.md`](.agent/context/offline-sync.md) y [`docs/reference/database.md`](docs/reference/database.md). Web no usa nada de esto — siempre lee/escribe Supabase directamente.

## Desarrollo

```bash
# Web
pnpm --filter @fitnotes/web dev

# Mobile (inicia Metro bundler — escanea el QR con Expo Go o usa un build de desarrollo)
pnpm --filter @fitnotes/mobile start

# Tests de un paquete concreto
pnpm --filter @fitnotes/core test
pnpm --filter @fitnotes/database test
```

### Type check

```bash
cd apps/mobile && npx tsc --noEmit
pnpm --filter @fitnotes/web build   # next build incluye type-check
pnpm run type-check                 # todos los paquetes (turbo)
```

## Testing

| Paquete/App | Framework | Comando | Cobertura actual |
|---|---|---|---|
| `packages/core` | Vitest | `pnpm --filter @fitnotes/core test` | 219 tests, 10 archivos |
| `packages/database` | Vitest | `pnpm --filter @fitnotes/database test` | 87 tests, 16 archivos (1 fallando actualmente — ver [Problemas conocidos](#problemas-conocidos)) |
| `apps/web` | Playwright | ver abajo | 13 specs en `apps/web/e2e/` |
| `apps/mobile` | Detox | ver abajo | 4 specs en `apps/mobile/e2e/` (smoke, navigation, interactions, routines-delete) |

### Playwright (web E2E)

Requiere una cuenta Supabase dedicada a tests (no una cuenta real — los specs asumen datos limpios en fechas relativas):

```bash
cd apps/web
PLAYWRIGHT_USER_EMAIL=x PLAYWRIGHT_USER_PASSWORD=y npx playwright test --project=chromium-auth
```

Sin esas variables, los tests que requieren auth se saltan automáticamente. Hay 3 proyectos configurados: `setup` (login), `chromium` (specs legacy sin auth), `chromium-auth` (CRUD con `storageState` reutilizado).

### Detox (mobile E2E)

Corre contra un **dispositivo Android físico** conectado por ADB (no hay emulador configurado):

```bash
cd apps/mobile
./gradlew -p android assembleDebug assembleAndroidTest -DtestBuildType=debug   # build de test
npx detox test --configuration android.att.debug                              # ejecutar specs
```

**Importante**: la build debug de Detox comparte `applicationId` (`com.fitnotes.app`) con la build release — instalarla sobreescribe la release ya instalada en el dispositivo. Reinstalar la release al terminar de testear (ver [Problemas conocidos](#problemas-conocidos)).

## Build / Compilación

```bash
# Web — build de producción Next.js
pnpm --filter @fitnotes/web build

# Mobile — APK release local
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon
/opt/Android-Sdk/platform-tools/adb install -r app/build/outputs/apk/release/app-release.apk

# Mobile — build en la nube (EAS, requiere `eas login` una vez)
cd apps/mobile && eas build --platform android --profile production
```

**Gotcha de Gradle** (ver [Problemas conocidos](#problemas-conocidos)): si tocas `packages/core` o `packages/database` y el cambio no aparece en el APK, el bundle JS quedó stale. Forzar:

```bash
cd apps/mobile/android && ./gradlew createBundleReleaseJsAndAssets --rerun-tasks --no-daemon && ./gradlew assembleRelease --no-daemon
```

## Despliegue

### Web — Vercel

1. Conecta el repositorio en [vercel.com](https://vercel.com)
2. Configura el directorio raíz: **`apps/web`**
3. Vercel detecta Next.js automáticamente — `apps/web/vercel.json` ya tiene el `installCommand`/`buildCommand` correctos para el monorepo, además de los headers de seguridad (CSP, X-Frame-Options, etc.)
4. Añade en el dashboard de Vercel las mismas variables de entorno de la tabla de [Variables de entorno](#variables-de-entorno) (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`)

El `ignoreCommand` en `vercel.json` evita rebuilds innecesarios cuando solo cambia `apps/mobile`.

### Mobile — EAS Build

El proyecto ya está vinculado a una cuenta Expo (`extra.eas.projectId` en `apps/mobile/app.json`). Si se parte de un fork o proyecto nuevo:

```bash
npm install -g eas-cli
cd apps/mobile && eas init          # solo si projectId no está configurado
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://<ref>.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon_key>"
```

Perfiles definidos en `apps/mobile/eas.json`: `development` (dev client), `preview` (APK interno), `production` (APK, `autoIncrement: true`).

```bash
cd apps/mobile && eas build --platform android --profile production
```

El workflow `.github/workflows/eas-build.yml` dispara builds automáticamente al pushear un tag `v*.*.*`, o manualmente desde GitHub Actions (`workflow_dispatch`, eligiendo perfil y plataforma). Requiere el secret `EXPO_TOKEN` (ver [CI/CD](#cicd--github-actions)).

## CI/CD — GitHub Actions

### `.github/workflows/ci.yml` — en cada push/PR a `main`

| Job | Qué hace | Cuándo |
|---|---|---|
| `ci` | Type check + tests + build de web | Siempre |
| `lint` | ESLint en todos los paquetes | Siempre |
| `rls-audit` | Verifica RLS habilitado + políticas correctas en las 13 tablas + 0 filas visibles sin auth | Push a `main`, o PRs con label `db` |

Todos usan **Turborepo remote caching** (`TURBO_TOKEN`/`TURBO_TEAM`) y cancelan runs anteriores del mismo PR (`cancel-in-progress: true`).

### `.github/workflows/eas-build.yml` — builds de mobile

Se dispara con un tag `v*.*.*` o manualmente (`workflow_dispatch`, eligiendo perfil `preview`/`production` y plataforma `android`/`ios`/`all`). Encola el build en EAS y no espera a que termine (`--no-wait`).

### Secrets necesarios (Settings → Secrets and variables → Actions)

| Secret | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Credenciales públicas de Supabase |
| `SUPABASE_PROJECT_REF` | Referencia del proyecto (ej. `fbhjiwtriqrxibqwsyqj`) |
| `SUPABASE_PAT` | Personal Access Token — [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `TURBO_TOKEN` | Token de Turborepo remote cache |
| `EXPO_TOKEN` | Access token de Expo (expo.dev → Account Settings → Access Tokens) |

### Variables necesarias (Settings → Secrets and variables → Actions → Variables)

| Variable | Descripción |
|---|---|
| `TURBO_TEAM` | Nombre del equipo en Turborepo remote cache |

## Google Drive backup (opcional)

La funcionalidad de backup automático a Google Drive (solo web) requiere una app OAuth2 en Google Cloud Console.

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → crear/seleccionar proyecto
2. Habilitar la **Google Drive API**
3. Credenciales → **OAuth 2.0 Client ID** → tipo Web application
4. Añadir URI de redirección autorizado: `https://<tu-dominio>/api/google/callback`
5. Copiar `Client ID`/`Client Secret` a `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
6. Establecer `NEXT_PUBLIC_APP_URL` con la URL canónica (sin barra final)

Una vez configurado, desde **Configuración → Datos** el usuario conecta su Drive y activa backup automático al finalizar cada entrenamiento (`apps/web/lib/driveBackup.ts`); se conservan las 5 copias más recientes (rotación automática en `api/google/backup/route.ts`).

## Funcionalidades

### Web (`/dashboard`, `/exercise`, `/progress`, `/calendar`, `/routines`, `/body-tracker`, `/tools`, `/settings`)

- Registro de entrenamientos por fecha con navegación día a día, franja semanal + racha
- Gestión completa de ejercicios y categorías, 10 tipos de ejercicio
- Historial por ejercicio con gráficas de progreso (Recharts) exportables como PNG, trend line de regresión lineal
- PRs (real + estimado 1RM), tabla de estimaciones 1–15 reps
- Rutinas con días, ejercicios, supersets y series predefinidas
- Calendario con dots de color por categoría y filtros avanzados (por categoría Match Any/All, por ejercicio con condiciones de peso/reps)
- Body tracker configurable (medidas + objetivos)
- Herramientas: calculadora 1RM, Set%, discos de barra, temporizador de descanso
- Backup/restore completo (`.fitnotes`, JSON de 13 tablas), backup automático a Google Drive, CSV import/export
- Eliminación de cuenta e historial (con filtros), dark mode, accesibilidad WCAG AA, CSP

### Mobile (Android APK) — offline-first, cuenta opcional

- **Funciona sin cuenta desde el primer arranque**: CRUD completo de entrenamientos, ejercicios/categorías, rutinas, body tracker, goals y récords personales sin red, con sincronización automática si más tarde se crea/vincula una cuenta
- Todos los tipos de ejercicio, supersets con nombres personalizables y drag & drop
- RestTimer manual con vibración + sonido + haptics
- Rutinas con días reordenables, predefined sets, registro directo a un workout real
- Calendario con swipe entre meses, búsqueda global con historial, historial completo por ejercicio con gráfica
- Objetivos por ejercicio, body tracker, preferencias (tema/unidades/toggles) persistidas localmente incluso en modo invitado
- Dark mode con selector manual (claro/oscuro/sistema)

## Packages

### `@fitnotes/core`
Lógica de negocio sin dependencias de plataforma (cero imports de `react`/`next`/`expo`/`react-native`). Tipos de dominio, 6 stores Zustand (workout/exercise/progress/routine/bodyTracker/preferences), utilidades (`calculate1RM` Brzycki, `calculateVolume`, `calculatePace`, `calculatePlates`, `computePersonalRecordUpdate`, `generateUUID`…). **219 tests Vitest**.

### `@fitnotes/database`
Dos mitades: `repositories/`+`supabase/` (cliente Supabase + 8 repositorios remotos, usados por web y por el `SyncEngine`) y `local/`+`sync/` (7 repositorios locales SQLite + `SyncEngine`, usados solo por mobile). **87 tests Vitest**.

### `@fitnotes/ui`
Vacío — reservado, sin design tokens ni componentes todavía.

### `@fitnotes/tsconfig`
Presets TypeScript compartidos: `base.json`, `nextjs.json`, `expo.json`.

## Referencia de código

Documentación generada a partir del código fuente (TSDoc/JSDoc inline + estos índices por módulo):

| Documento | Contenido |
|---|---|
| [`docs/reference/core.md`](docs/reference/core.md) | Cada store, tipo y utilidad de `packages/core`, con su exports |
| [`docs/reference/database.md`](docs/reference/database.md) | Repositorios remotos, repos locales SQLite y motor de sync de `packages/database` |
| [`docs/reference/web.md`](docs/reference/web.md) | Cada ruta y componente de `apps/web` |
| [`docs/reference/mobile.md`](docs/reference/mobile.md) | Cada pantalla y componente de `apps/mobile` |
| [`docs/executive-summary-2026-07.md`](docs/executive-summary-2026-07.md) | Resumen ejecutivo técnico (propósito, stack, flujos de datos, integraciones) |
| [`.agent/context/`](.agent/context/) | Notas de arquitectura profundas por área (`architecture.md`, `apps-web.md`, `apps-mobile.md`, `packages-core.md`, `packages-database.md`, `repositories.md`, `offline-sync.md`, `stores.md`) — pensadas para agentes de IA pero igual de útiles para onboarding humano |

## Problemas conocidos

### Corregidos
- ~~**1 test fallando en `packages/database`**~~ — **arreglado** (2026-07-16). `syncEngine.test.ts` › "clears _dirty on the local row after a successful push" comparaba el `updated_at` de una fila remota simulada contra un literal fijo (`2026-07-04`) que ya había quedado en el pasado respecto al reloj real usado por `createWorkout` — el test siempre "perdía" el last-write-wins y fallaba desde esa fecha en adelante. Ahora el timestamp remoto se calcula relativo a `Date.now()`. 87/87 tests en verde.
- ~~**Sesión Supabase no sobrevive a `force-stop` en mobile**~~ — **causa raíz encontrada y corregida en código** (2026-07-16, `apps/mobile/lib/supabase.ts`). El intento de fix anterior (cola serializada + patrón write-tmp-then-rename) tenía un bug propio: `writeAll` borraba el archivo real (`deleteAsync`) *antes* de mover el temporal encima, reabriendo con otra forma la misma ventana "sin archivo en disco" que decía cerrar — un `force-stop` justo ahí perdía la sesión entera. Confirmado en el código nativo de `expo-file-system` (`FileSystemModule.kt`) que en Android `moveAsync` ya usa `File.renameTo` (`rename(2)`, atómico y sobrescribe el destino) — el borrado previo era innecesario y activamente peligroso; eliminado. También se añadió gating de `startAutoRefresh()` por conectividad real (no solo primer plano), como salvaguarda adicional contra refrescos de token fallidos justo tras un cold start sin red todavía (patrón reportado en el ecosistema Supabase+RN, aunque esta versión de `auth-js` ya protege `_callRefreshToken` contra fallos de red). **Sin dispositivo físico en este entorno para confirmar el arreglo end-to-end** — el razonamiento está verificado por código (comportamiento de `File.renameTo`), no por reproducción en dispositivo.

### Limitaciones de diseño aceptadas / requieren dispositivo físico
- **Gradle no detecta cambios en `packages/core`/`packages/database`**: gotcha de build con workaround documentado (ver [Build / Compilación](#build--compilación)). `apps/mobile/android/` es generado por `expo prebuild` y está en `.gitignore` — un fix real requeriría un [config plugin](https://docs.expo.dev/config-plugins/introduction/) que parchee `build.gradle` en cada prebuild, algo que no se puede verificar de extremo a extremo sin compilar una APK completa y sin un dispositivo donde instalarla.
- **Detox pisa la build release**: mismo motivo que el punto anterior (`android/` gitignored, requeriría config plugin para `applicationIdSuffix`) — se documenta el workaround manual (reinstalar la release) en vez de un fix no verificable.
- **`Alert.alert` en Android — máximo 3 botones**: esto **no es un bug**, es una limitación de la API nativa de Android. Ya está resuelto en el código: donde hace falta un menú de más de 3 opciones (p. ej. rutinas) se usa un `Modal` propio en vez de `Alert.alert`.
- **Duplicado de PRs tras claim+sync / multi-dispositivo en modo invitado**: **no son bugs, son tradeoffs de diseño aceptados y documentados** — dedup entre el PR generado offline y el regenerado por el trigger SQL remoto (o entre dos dispositivos invitado) añadiría complejidad de resolución de conflictos no justificada por el impacto real (histórico duplicado, no pérdida de datos). Ver razonamiento completo en `.agent/context/offline-sync.md`.

## Contribuir

1. Crea una rama desde `main`: `git checkout -b feat/nombre`
2. Instala dependencias: `pnpm install`
3. Antes de abrir PR:
   ```bash
   cd apps/mobile && npx tsc --noEmit
   pnpm --filter @fitnotes/web build
   pnpm --filter @fitnotes/core test
   pnpm --filter @fitnotes/database test
   ```
4. Regla crítica: `packages/core` no puede importar `react`, `next`, `expo` ni `react-native`
5. Si tocas el esquema de Supabase, añade la migración SQL en `packages/database/src/supabase/migrations/` con el siguiente número correlativo
6. El CI verifica tipos, tests, build, lint y RLS automáticamente en cada PR (ver plantilla en `.github/PULL_REQUEST_TEMPLATE.md`)

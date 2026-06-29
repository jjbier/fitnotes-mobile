# FitNotes App

App de seguimiento de fitness con registro de entrenamientos, PRs, rutinas y body tracker. Monorepo con web (Next.js 15) y mobile (Expo SDK 52) compartiendo lógica de negocio via `@fitnotes/core`.

## Stack

| Capa | Tecnología |
|------|------------|
| Monorepo | Turborepo 2 + pnpm workspaces |
| Lenguaje | TypeScript strict |
| Web | Next.js 15 App Router, Tailwind CSS v4 |
| Mobile | Expo SDK 52, Expo Router v4 |
| Estado | Zustand 5 + Immer |
| Backend | Supabase (Auth + Postgres + RLS) |
| Validación | Zod 3 |

## Estructura

```
fitnotes-app/
├── apps/
│   ├── web/        # Next.js 15 (puerto 3000)
│   └── mobile/     # Expo SDK 52
└── packages/
    ├── core/       # Lógica compartida — sin imports de react/next/expo
    ├── database/   # Supabase client + repositorios
    └── tsconfig/   # Configs TypeScript base/nextjs/expo
```

## Setup local

### Requisitos

- Node.js >= 20
- pnpm >= 9 (`npm i -g pnpm`)
- Proyecto en [Supabase](https://supabase.com)

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

Ver `.env.example` para todas las variables disponibles.

### Base de datos

Aplicar las migraciones en tu proyecto Supabase. Los archivos SQL están en `packages/database/src/supabase/migrations/`. Ejecutarlos en orden (001 → 005) desde el SQL Editor de Supabase Studio.

### Desarrollo

```bash
# Web
pnpm --filter @fitnotes/web dev

# Mobile (inicia Metro bundler)
pnpm --filter @fitnotes/mobile start

# Tests del core
pnpm --filter @fitnotes/core test
```

### Build

```bash
# Web (Next.js production build)
pnpm --filter @fitnotes/web build

# Mobile — APK release local
cd apps/mobile/android && ./gradlew assembleRelease --no-daemon

# Mobile — EAS build (requiere cuenta Expo)
cd apps/mobile && eas build --platform android --profile production
```

### Type check

```bash
cd apps/mobile && npx tsc --noEmit
pnpm --filter @fitnotes/web build  # next build incluye type check
```

---

## Despliegue

### Web — Vercel

1. Conecta el repositorio en [vercel.com](https://vercel.com)
2. Configura el directorio raíz: **`apps/web`**
3. Vercel detecta automáticamente Next.js — el `vercel.json` ya tiene el `installCommand` y `buildCommand` correctos para el monorepo
4. Añade las variables de entorno en el dashboard de Vercel:

| Variable | Dónde obtenerla |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credenciales |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credenciales |
| `NEXT_PUBLIC_APP_URL` | URL de producción de Vercel (sin barra final) |

El `ignoreCommand` en `vercel.json` evita rebuilds innecesarios cuando solo cambia `apps/mobile`.

### Mobile — EAS Build

Configuración inicial (solo una vez):

```bash
# 1. Instalar EAS CLI
npm install -g eas-cli

# 2. Vincular el proyecto a tu cuenta Expo
cd apps/mobile && eas init

# 3. Crear secrets de Supabase en EAS
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://<ref>.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon_key>"
```

Builds manuales:

```bash
# APK release (Android)
cd apps/mobile && eas build --platform android --profile production

# Bundle de producción iOS
cd apps/mobile && eas build --platform ios --profile production
```

---

## CI/CD — GitHub Actions

El workflow en `.github/workflows/ci.yml` se ejecuta en cada push y PR a `main`.

### Jobs

| Job | Qué hace | Cuándo |
|---|---|---|
| `ci` | Type check + tests + web build | Siempre |
| `lint` | ESLint en todos los packages | Siempre |
| `rls-audit` | Verifica RLS habilitado + 0 rows anon en Supabase | Push a `main` o PRs con label `db` |

Todos los jobs usan **Turborepo remote caching** (`TURBO_TOKEN` + `TURBO_TEAM`) para reutilizar artefactos entre runs.

Las ramas con PRs abiertos cancelan runs anteriores del mismo grupo (`cancel-in-progress: true`).

### GitHub Secrets necesarios

Configurar en: **Settings → Secrets and variables → Actions**

| Secret | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key pública de Supabase |
| `SUPABASE_PROJECT_REF` | Referencia del proyecto (ej. `fbhjiwtriqrxibqwsyqj`) |
| `SUPABASE_PAT` | Personal Access Token de Supabase — [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `TURBO_TOKEN` | Token de Turborepo remote cache — [vercel.com/docs/monorepos/remote-caching](https://vercel.com/docs/monorepos/remote-caching) |
| `EXPO_TOKEN` | Access token de Expo — expo.dev → Account Settings → Access Tokens |

### GitHub Variables necesarias

Configurar en: **Settings → Secrets and variables → Actions → Variables**

| Variable | Descripción |
|---|---|
| `TURBO_TEAM` | Nombre del equipo en Turborepo remote cache |

---

## Google Drive backup (opcional)

La funcionalidad de backup automático a Google Drive requiere una app OAuth2 en Google Cloud Console.

### Configuración

1. Ir a [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Crear un proyecto (o usar uno existente)
3. Habilitar la **Google Drive API**
4. Crear credenciales → **OAuth 2.0 Client ID** → tipo: Web application
5. Añadir URI de redirección autorizado: `https://<tu-dominio>/api/google/callback`
6. Copiar `Client ID` y `Client Secret` a las variables de entorno (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
7. Establecer `NEXT_PUBLIC_APP_URL` con la URL canónica de la app (sin barra final)

Una vez configurado, los usuarios pueden conectar su Google Drive desde **Configuración → Datos** y activar el backup automático al finalizar cada entrenamiento.

---

## Funcionalidades

### Web (`/dashboard`, `/exercise`, `/progress`, `/calendar`, `/routines`, `/body-tracker`, `/tools`, `/settings`)

- Registro de entrenamientos por fecha con navegación día a día
- Gestión completa de ejercicios y categorías
- Historial por ejercicio con gráficas de progreso exportables como PNG
- Seguimiento de PRs (real + estimado 1RM), tabla de estimaciones 1–12 reps
- Trend line de regresión lineal en gráficas de progreso
- Edición de sets desde el historial (acordeón por fecha)
- Rutinas con días y ejercicios
- Calendario con dots de color por categoría muscular
- Filtros avanzados de calendario: por categoría (Match Any / All) y por ejercicio con condiciones (peso ≥ X, reps ≥ Y)
- Body tracker (peso, medidas corporales)
- Herramientas: calculadora 1RM, Set%, Placas
- Backup / Restore completo en formato `.fitnotes` (JSON, 13 tablas)
- Backup automático a Google Drive (OAuth2, fire-and-forget al finalizar entrenamiento)
- Exportación CSV e importación de historial
- Eliminación de cuenta
- Dark mode + loading/error boundaries en todas las rutas

### Mobile (Android APK)

- Todos los tipos de ejercicio (WEIGHT_REPS, BODYWEIGHT, CARDIO, TIMED, etc.)
- Workout con sets CRUD, RestTimer con haptics
- Supersets con nombres personalizables y drag & drop
- Rutinas con días reordenables, predefined sets, log a workout real
- Calendario con swipe left/right entre meses y dots de color por categoría
- Calculadoras (1RM, Set%, Placas)
- Búsqueda global de ejercicios con historial
- Historial completo por ejercicio con gráfica
- Objetivos por ejercicio
- Body tracker
- Dark mode siguiendo esquema del sistema
- APK release disponible para Android

---

## Packages

### `@fitnotes/core`

Lógica de negocio sin dependencias de plataforma. Importable en web y mobile.

- **types** — `Exercise`, `Workout`, `Set`, `Routine`, `BodyMeasurement`…
- **stores** — Zustand: `useWorkoutStore`, `useExerciseStore`, `useProgressStore`, `useRoutineStore`
- **utils** — `calculate1RM` (Brzycki), `calculateVolume`, `calculatePace`, `calculatePlates`…
- **144 tests Vitest**

### `@fitnotes/database`

Cliente Supabase + repositorios con el patrón `createXxxRepository(client)`.

Repositorios: `exercise`, `workout`, `routine`, `progress`, `bodyTracker`, `calendar`, `goals`.

### `@fitnotes/tsconfig`

Presets TypeScript para Next.js y Expo.

---

## Contribuir

1. Crea una rama desde `main`: `git checkout -b feat/nombre`
2. Instala dependencias: `pnpm install`
3. Comprueba tipos antes de abrir PR:
   ```bash
   cd apps/mobile && npx tsc --noEmit
   pnpm --filter @fitnotes/web build
   ```
4. Asegúrate de que los tests del core pasan: `pnpm --filter @fitnotes/core test`
5. Regla crítica: `packages/core` no puede importar `react`, `next` ni `expo`
6. El CI verifica tipos, tests, build y lint automáticamente en cada PR

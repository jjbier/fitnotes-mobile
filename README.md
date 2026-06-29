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

## Setup

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
# Rellenar SUPABASE_URL y SUPABASE_ANON_KEY en ambos archivos
```

Ver `.env.example` para las variables necesarias.

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

## Funcionalidades

**Web** (`/dashboard`, `/exercise`, `/progress`, `/calendar`, `/routines`, `/body-tracker`, `/tools`, `/settings`)

- Registro de entrenamientos por fecha con navegación día a día
- Gestión completa de ejercicios y categorías (drag & drop reordenar)
- Historial por ejercicio con virtualización para listas largas
- Seguimiento de PRs y estimación de 1RM
- Rutinas con días y ejercicios
- Body tracker (peso, medidas corporales)
- Exportación CSV y eliminación de cuenta

**Mobile** (Android APK disponible)

- Todos los ejercicios (WEIGHT_REPS, BODYWEIGHT, CARDIO, etc.)
- Workout con sets CRUD, RestTimer con haptics, supersets
- Rutinas con drag & drop, predefined sets, log a workout real
- Calculadoras (1RM, Set%, Placas)
- Sincronización offline-first: push al recuperar conexión, pull al volver a primer plano
- Dark mode siguiendo esquema del sistema
- Body tracker y objetivos por ejercicio

## Packages

### `@fitnotes/core`

Lógica de negocio sin dependencias de plataforma. Importable en web y mobile.

- **types** — `Exercise`, `Workout`, `Set`, `Routine`, `BodyMeasurement`…
- **stores** — Zustand: `useWorkoutStore`, `useExerciseStore`, `useProgressStore`, `useRoutineStore`
- **utils** — `calculate1RM` (Brzycki), `calculateVolume`, `calculatePace`, `calculatePlates`…

### `@fitnotes/database`

Cliente Supabase + repositorios con el patrón `createXxxRepository(client)`.

Repositorios: `exercise`, `workout`, `routine`, `progress`, `bodyTracker`, `calendar`, `goals`.

### `@fitnotes/tsconfig`

Presets TypeScript para Next.js y Expo.

## Contribuir

1. Crea una rama desde `main`: `git checkout -b feat/nombre`
2. Instala dependencias: `pnpm install`
3. Comprueba tipos antes de abrir PR: `cd apps/mobile && npx tsc --noEmit`
4. Asegúrate de que los tests del core pasan: `pnpm --filter @fitnotes/core test`
5. Regla crítica: `packages/core` no puede importar `react`, `next` ni `expo`

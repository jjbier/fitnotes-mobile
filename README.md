# FitNotes App

A cross-platform fitness tracking application built with a Turborepo monorepo, sharing business logic between a Next.js web app and an Expo mobile app.

## Stack

| Layer | Tech |
|-------|------|
| Monorepo | Turborepo + pnpm workspaces |
| Language | TypeScript (strict) |
| Web | Next.js 15, App Router, Tailwind CSS v4, shadcn/ui |
| Mobile | Expo SDK 52, Expo Router v4, NativeWind v4 |
| State | Zustand |
| Backend | Supabase (Auth + Postgres + Realtime) |
| Validation | Zod |
| Local DB (mobile) | expo-sqlite (offline-first) |

## Monorepo Structure

```
fitnotes-app/
├── apps/
│   ├── web/        # Next.js 15 App Router
│   └── mobile/     # Expo SDK 52 + Expo Router
├── packages/
│   ├── core/       # Shared business logic (stores, types, utils, schemas)
│   ├── ui/         # Shared primitive components
│   ├── database/   # Supabase client + migrations
│   └── tsconfig/   # Shared TypeScript configs
```

## Setup

### Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Supabase account + project

### Install

```bash
# Clone the repository
git clone <repo-url>
cd fitnotes-app

# Install all workspace dependencies
pnpm install
```

### Configure environment

```bash
cp .env.example apps/web/.env.local
cp .env.example apps/mobile/.env.local
# Fill in your Supabase URL and anon key in both files
```

### Database setup

```bash
# Apply the initial schema migration to your Supabase project
# via the Supabase dashboard SQL editor or CLI:
supabase db push
```

### Run in development

```bash
# Start all apps in parallel
pnpm dev

# Or run individually
pnpm --filter @fitnotes/web dev
pnpm --filter @fitnotes/mobile dev
```

### Build

```bash
pnpm build
```

### Type check

```bash
pnpm type-check
```

## Packages

### `@fitnotes/core`

Platform-agnostic business logic. No React, no Next.js, no Expo. Safe to import in any environment.

- **types** — Domain model TypeScript interfaces
- **stores** — Zustand stores (workout, exercise, progress, routine)
- **utils** — Calculations (1RM, volume, pace) and date utilities
- **schemas** — Zod validation schemas

### `@fitnotes/database`

Supabase client factory and type definitions.

### `@fitnotes/ui`

Shared UI primitive tokens (used as a bridge between web shadcn/ui and mobile NativeWind).

### `@fitnotes/tsconfig`

Shared TypeScript configuration presets.

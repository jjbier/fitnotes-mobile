# Trabajo pendiente — priorizado

## P0 — Bloquea cualquier uso real

- [ ] Conectar Supabase: crear proyecto, copiar URL+key en `.env.local`
- [ ] `supabase gen types typescript` → `packages/database/src/supabase/types.ts`
- [ ] Auth web: crear `apps/web/middleware.ts` con `@supabase/ssr` para proteger rutas `/(app)/*`
- [ ] Auth mobile: en `app/_layout.tsx`, verificar sesión y redirigir a `(auth)/login`

## P1 — Funcionalidad core

- [ ] **Web pages**: añadir queries Supabase reales en dashboard, exercise list, progress
- [ ] **Mobile**: inicializar esquema expo-sqlite en `_layout.tsx` al arrancar
- [ ] `useWorkoutStore`: persistir workout a Supabase en `finishWorkout()`
- [ ] `useExerciseStore`: cargar ejercicios desde Supabase en `loadExercises()`
- [ ] `useProgressStore`: cargar PRs desde Supabase en `loadPersonalRecords()`
- [ ] `routineStore.logRoutineWorkout()`: implementar dispatch a `workoutStore`

## P2 — UI/UX incompleto

- [ ] `Sidebar.tsx` + `MobileNav.tsx` web: añadir `"use client"` + `usePathname()` para active state
- [ ] `ProgressChart.tsx`: implementar con Recharts `<LineChart>` + `<ResponsiveContainer>`
- [ ] `shadcn/ui`: ejecutar `npx shadcn@latest init` en `apps/web` para generar `components.json`
- [ ] Mobile: crear `SetForm` component (actualmente lógica inline en training screen)
- [ ] Mobile `RestTimer`: añadir `expo-haptics` + sonido al terminar

## P3 — Infraestructura

- [ ] ESLint config en cada package/app
- [ ] Tests unitarios para `packages/core` (cálculos + reducers de stores)
- [ ] `SyncEngine.pushLocalChanges()` + `pullRemoteChanges()` implementados
- [ ] CI/CD básico (GitHub Actions: type-check + lint)

## Notas de gotchas conocidos

- **NativeWind v4 requiere Tailwind v3** en mobile — no usar `@tailwindcss/postcss` en mobile
- **Expo + pnpm**: si Metro no resuelve paquetes del workspace, verificar `metro.config.js` watchFolders
- **`verbatimModuleSyntax`**: imports de tipos deben usar `import type`, imports de valores deben tener extensión `.js`
- **Brzycki singularity**: `reps >= 37` hace denominador ≤ 0 — hay guard en `calculate1RM`
- **Supabase env vars**: web usa `NEXT_PUBLIC_*`, mobile usa `EXPO_PUBLIC_*`

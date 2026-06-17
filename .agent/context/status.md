# Status — FitNotes App

_Last updated: 2026-06-17_

## What works (end-to-end with real Supabase data)

### Web
- [x] Auth: login, register, sign-out, middleware session guard
- [x] Dashboard: create/load workout by date, add exercises, log sets (all ExerciseTypes), complete toggle, delete
- [x] Exercises: browse by category, create/edit/delete exercise + category
- [x] Progress: PR list per exercise, Recharts LineChart (maxWeight/volume/reps), 1RM estimates
- [x] Calendar: month grid with workout dots, list view, day popup
- [x] Routines: list, create/copy/delete, detail with days + exercises + predefined sets
- [x] Body Tracker: enabled measurements grid, log entry, history
- [x] Tools: 1RM Calculator (table 1–15RM), Set Calculator (% table + rounding), Plate Calculator (greedy solver + bar viz)
- [x] Settings: load/save display name (Supabase auth.updateUser), weight unit toggle (localStorage), sign-out

### Mobile
- [x] Auth guard (_layout.tsx) + login/register screens
- [x] Today tab: date navigation, load/create workout, navigate to exercise training
- [x] Training screen: sets CRUD, all ExerciseTypes (weight/reps/distance/time fields)
- [x] Calendar: month grid, list view
- [x] Exercises: browse by category
- [x] Progress: all PRs, expandable per exercise with estimated 1RM
- [x] Tools: 1RM, Set%, Plate calculators
- [x] Settings: profile, weight unit, sign-out with confirmation
- [x] Routines: list, create, delete, detail with days + exercises
- [x] RestTimer: functional with +/-30s buttons (no haptics yet)

### Packages
- [x] `@fitnotes/core`: all types, 4 stores, utils, Zod schemas
- [x] `@fitnotes/database`: 6 repositories, browser/server client, generated types
- [x] All three packages pass `tsc --noEmit` clean

## What's pending

### High priority
- [ ] `routineStore.logRoutineWorkout()` — empty, needs to create workout + exercises from routine day
- [ ] Delete account in settings — UI only, no Supabase call
- [ ] `/workout/[date]` page — exists but not linked from dashboard (dashboard uses query param ?date=)

### Mobile-specific
- [ ] Body tracker mobile — basic list only, no create/edit measurement, no entry CRUD
- [ ] `RestTimer` — no haptics, no sound
- [ ] Weight unit (kg/lb) — saved in state but not used in set input display

### Offline sync (not started)
- [ ] `SyncEngine` — all methods are empty stubs
- [ ] `expo-sqlite` — no schema initialized, no `pending_changes` table
- [ ] `NetInfo` listener for pause/resume sync

### Infrastructure
- [ ] No tests (no unit, no e2e)
- [ ] No ESLint config in any package
- [ ] `shadcn/ui` not initialized (no `components.json`) — web uses raw Tailwind
- [ ] `packages/ui` is empty

## Known gotchas

- `ExerciseType` cast required: `row.type as ExerciseType` in every Supabase→core mapping
- Supabase package versions are pinned — do NOT upgrade without checking SupabaseClient generic compatibility
- `apps/web/.env.local` must exist (not root `.env.local`) for Next.js to pick up Supabase vars
- Mobile uses `StyleSheet` everywhere — adding `className` will silently do nothing
- `workout/[date]` route in web uses the date as URL param; dashboard still routes via `?date=` query — inconsistency

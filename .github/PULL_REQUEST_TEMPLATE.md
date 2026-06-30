## ¿Qué cambia?

<!-- Descripción breve del cambio y por qué es necesario -->

## Checklist

- [ ] `cd apps/mobile && npx tsc --noEmit` — sin errores
- [ ] `pnpm --filter @fitnotes/core test` — 144 tests en verde
- [ ] `pnpm --filter @fitnotes/web build` — build sin errores
- [ ] `packages/core` no importa `react`, `next` ni `expo`
- [ ] Migraciones SQL en `packages/database/src/supabase/migrations/` (si aplica)

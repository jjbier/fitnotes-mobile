-- FitNotes App — Initial Schema
-- Run this migration in the Supabase SQL editor or via `supabase db push`.

-- ─── Extensions ───────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ─── Helper: updated_at trigger ───────────────────────────────────────────────

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Categories ───────────────────────────────────────────────────────────────

create table public.categories (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  color         text not null default '#6366f1',
  order_index   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_categories_user_id on public.categories(user_id);

alter table public.categories enable row level security;

create policy "Users manage own categories"
  on public.categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Exercises ────────────────────────────────────────────────────────────────

create type public.exercise_type as enum (
  'WEIGHT_REPS', 'DISTANCE_TIME', 'REPS_ONLY', 'WEIGHT_ONLY', 'TIME_ONLY'
);

create table public.exercises (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  category_id   uuid references public.categories(id) on delete set null,
  type          public.exercise_type not null default 'WEIGHT_REPS',
  weight_unit   text not null default 'kg',
  notes         text,
  is_favorite   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_exercises_user_id     on public.exercises(user_id);
create index idx_exercises_category_id on public.exercises(category_id);

alter table public.exercises enable row level security;

create policy "Users manage own exercises"
  on public.exercises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Workouts ─────────────────────────────────────────────────────────────────

create table public.workouts (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  date              date not null,
  comment           text,
  start_time        timestamptz,
  end_time          timestamptz,
  duration_minutes  integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_workouts_user_id on public.workouts(user_id);
create index idx_workouts_date    on public.workouts(date);

alter table public.workouts enable row level security;

create policy "Users manage own workouts"
  on public.workouts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Workout Exercises ────────────────────────────────────────────────────────

create table public.workout_exercises (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  workout_id   uuid not null references public.workouts(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id) on delete cascade,
  order_index  integer not null default 0,
  group_id     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_workout_exercises_workout_id  on public.workout_exercises(workout_id);
create index idx_workout_exercises_exercise_id on public.workout_exercises(exercise_id);

alter table public.workout_exercises enable row level security;

create policy "Users manage own workout_exercises"
  on public.workout_exercises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Sets ─────────────────────────────────────────────────────────────────────

create table public.sets (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  workout_exercise_id   uuid not null references public.workout_exercises(id) on delete cascade,
  weight                numeric(8,3),
  reps                  integer,
  distance              numeric(10,3),
  time_seconds          integer,
  is_complete           boolean not null default false,
  comment               text,
  order_index           integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_sets_workout_exercise_id on public.sets(workout_exercise_id);

alter table public.sets enable row level security;

create policy "Users manage own sets"
  on public.sets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Personal Records ─────────────────────────────────────────────────────────

create table public.personal_records (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id) on delete cascade,
  reps         integer not null,
  weight       numeric(8,3) not null,
  achieved_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index idx_personal_records_user_id     on public.personal_records(user_id);
create index idx_personal_records_exercise_id on public.personal_records(exercise_id);
create index idx_personal_records_exercise_reps
  on public.personal_records(exercise_id, reps);

alter table public.personal_records enable row level security;

create policy "Users manage own personal_records"
  on public.personal_records for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Auto-update personal_records on set upsert ───────────────────────────────

create or replace function public.update_personal_record()
returns trigger language plpgsql security definer as $$
declare
  v_exercise_id uuid;
  v_user_id     uuid;
  v_current_max numeric;
begin
  -- Only process completed sets with both weight and reps
  if new.is_complete = false or new.weight is null or new.reps is null then
    return new;
  end if;

  -- Resolve exercise_id and user_id via workout_exercises
  select we.exercise_id, we.user_id
    into v_exercise_id, v_user_id
    from public.workout_exercises we
   where we.id = new.workout_exercise_id;

  -- Check existing max weight for this exercise + rep count
  select max(pr.weight)
    into v_current_max
    from public.personal_records pr
   where pr.exercise_id = v_exercise_id
     and pr.user_id     = v_user_id
     and pr.reps        = new.reps;

  if v_current_max is null or new.weight > v_current_max then
    insert into public.personal_records (user_id, exercise_id, reps, weight, achieved_at)
    values (v_user_id, v_exercise_id, new.reps, new.weight, now());
  end if;

  return new;
end;
$$;

create trigger trg_update_personal_record
  after insert or update on public.sets
  for each row execute function public.update_personal_record();

-- ─── Routines ─────────────────────────────────────────────────────────────────

create table public.routines (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routines enable row level security;

create policy "Users manage own routines"
  on public.routines for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Routine Days ─────────────────────────────────────────────────────────────

create table public.routine_days (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  routine_id  uuid not null references public.routines(id) on delete cascade,
  name        text not null,
  order_index integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.routine_days enable row level security;

create policy "Users manage own routine_days"
  on public.routine_days for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Routine Day Exercises ────────────────────────────────────────────────────

create table public.routine_day_exercises (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  routine_day_id  uuid not null references public.routine_days(id) on delete cascade,
  exercise_id     uuid not null references public.exercises(id) on delete cascade,
  order_index     integer not null default 0,
  group_id        uuid,
  created_at      timestamptz not null default now()
);

alter table public.routine_day_exercises enable row level security;

create policy "Users manage own routine_day_exercises"
  on public.routine_day_exercises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Predefined Sets ─────────────────────────────────────────────────────────

create table public.predefined_sets (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  routine_day_exercise_id  uuid not null references public.routine_day_exercises(id) on delete cascade,
  weight                   numeric(8,3),
  reps                     integer,
  distance                 numeric(10,3),
  time_seconds             integer,
  order_index              integer not null default 0
);

alter table public.predefined_sets enable row level security;

create policy "Users manage own predefined_sets"
  on public.predefined_sets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Body Measurements ───────────────────────────────────────────────────────

create type public.goal_type as enum ('INCREASE', 'DECREASE', 'SPECIFIC');

create table public.body_measurements (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  unit        text not null,
  goal_type   public.goal_type not null default 'SPECIFIC',
  goal_value  numeric(10,3),
  is_enabled  boolean not null default true,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.body_measurements enable row level security;

create policy "Users manage own body_measurements"
  on public.body_measurements for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Body Measurement Entries ────────────────────────────────────────────────

create table public.body_measurement_entries (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  measurement_id  uuid not null references public.body_measurements(id) on delete cascade,
  value           numeric(10,3) not null,
  comment         text,
  recorded_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index idx_bme_measurement_id on public.body_measurement_entries(measurement_id);
create index idx_bme_recorded_at    on public.body_measurement_entries(recorded_at);

alter table public.body_measurement_entries enable row level security;

create policy "Users manage own body_measurement_entries"
  on public.body_measurement_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── updated_at triggers ─────────────────────────────────────────────────────

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.handle_updated_at();

create trigger trg_exercises_updated_at
  before update on public.exercises
  for each row execute function public.handle_updated_at();

create trigger trg_workouts_updated_at
  before update on public.workouts
  for each row execute function public.handle_updated_at();

create trigger trg_workout_exercises_updated_at
  before update on public.workout_exercises
  for each row execute function public.handle_updated_at();

create trigger trg_sets_updated_at
  before update on public.sets
  for each row execute function public.handle_updated_at();

create trigger trg_routines_updated_at
  before update on public.routines
  for each row execute function public.handle_updated_at();

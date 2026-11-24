-- QuickMemory cross-device sync
-- Apply this migration in the Supabase SQL Editor before connecting either client.
-- No secret/service key is required by the website or iOS app.

create extension if not exists pgcrypto;

create table if not exists public.sync_devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  platform text not null check (platform in ('web', 'ios')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.sync_entities (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('unit', 'word', 'study_group', 'test', 'learning_session', 'relearning_session', 'paused_session', 'preference')),
  entity_id text not null check (char_length(entity_id) between 1 and 200),
  payload jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  client_updated_at timestamptz not null,
  device_id uuid not null references public.sync_devices(id) on delete restrict,
  server_version bigint generated always as identity unique,
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.sync_devices(id) on delete restrict,
  event_type text not null check (event_type in ('answer', 'test_completed', 'session_started', 'session_paused', 'session_resumed')),
  word_id text,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists sync_entities_user_version_idx
  on public.sync_entities (user_id, server_version);
create index if not exists learning_events_user_occurred_idx
  on public.learning_events (user_id, occurred_at desc);

alter table public.sync_devices enable row level security;
alter table public.sync_entities enable row level security;
alter table public.learning_events enable row level security;

create policy "Users can manage only their devices"
  on public.sync_devices for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can manage only their sync entities"
  on public.sync_entities for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can manage only their learning events"
  on public.learning_events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.sync_devices to authenticated;
grant select, insert, update, delete on public.sync_entities to authenticated;
grant select, insert, update, delete on public.learning_events to authenticated;

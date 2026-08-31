create table if not exists public.aurora_native_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.call_users(id) on delete cascade,
  platform text not null default 'android' check (platform = 'android'),
  device_token text not null unique check (char_length(device_token) between 20 and 4096),
  installation_id text,
  app_version text,
  device_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists aurora_native_devices_user_id_idx
  on public.aurora_native_devices(user_id);

alter table public.aurora_native_devices enable row level security;

revoke all on table public.aurora_native_devices from public, anon, authenticated;
grant select, insert, update, delete on table public.aurora_native_devices to service_role;

alter table public.aurora_native_devices
  add column if not exists session_expires_at timestamptz;

update public.aurora_native_devices
set session_expires_at = now()
where session_expires_at is null;

alter table public.aurora_native_devices
  alter column session_expires_at set not null;

create index if not exists aurora_native_devices_session_expiry_idx
  on public.aurora_native_devices(user_id, session_expires_at);

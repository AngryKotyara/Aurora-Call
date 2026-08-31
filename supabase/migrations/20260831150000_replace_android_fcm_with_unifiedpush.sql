alter table public.aurora_native_devices
  add column if not exists push_provider text,
  add column if not exists push_endpoint text,
  add column if not exists p256dh text,
  add column if not exists auth text;

update public.aurora_native_devices
set push_provider = case
  when platform = 'ios_voip' then 'apns'
  when platform = 'android' then 'fcm'
  else push_provider
end
where push_provider is null;

-- Android clients now use encrypted UnifiedPush endpoints. Old FCM registrations
-- cannot be reused and must re-register through the new client.
delete from public.aurora_native_devices
where platform = 'android';

alter table public.aurora_native_devices
  drop constraint if exists aurora_native_devices_push_provider_check;

alter table public.aurora_native_devices
  add constraint aurora_native_devices_push_provider_check
  check (push_provider is null or push_provider in ('unifiedpush', 'apns', 'fcm'));

create index if not exists aurora_native_devices_unifiedpush_lookup_idx
  on public.aurora_native_devices (user_id, session_expires_at)
  where platform = 'android' and push_provider = 'unifiedpush';

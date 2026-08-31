alter table public.aurora_native_devices
  drop constraint if exists aurora_native_devices_platform_check;

alter table public.aurora_native_devices
  add constraint aurora_native_devices_platform_check
  check (platform in ('android', 'ios_voip'));

alter table public.aurora_native_devices
  add column if not exists push_environment text not null default 'production';

alter table public.aurora_native_devices
  drop constraint if exists aurora_native_devices_push_environment_check;

alter table public.aurora_native_devices
  add constraint aurora_native_devices_push_environment_check
  check (push_environment in ('development', 'production'));

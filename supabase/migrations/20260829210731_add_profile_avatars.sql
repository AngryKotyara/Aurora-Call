alter table public.call_users
  add column if not exists avatar_data_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'call_users_avatar_data_url_valid'
      and conrelid = 'public.call_users'::regclass
  ) then
    alter table public.call_users
      add constraint call_users_avatar_data_url_valid
      check (
        avatar_data_url is null
        or (
          length(avatar_data_url) <= 350000
          and avatar_data_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'
        )
      );
  end if;
end
$$;

create or replace function public.get_call_profile(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_user_id uuid;
  v_profile jsonb;
begin
  select s.user_id
  into v_user_id
  from public.call_sessions s
  where s.token = p_token
    and s.expires_at > now();

  if v_user_id is null then
    raise exception 'invalid_session';
  end if;

  select jsonb_build_object(
    'user_id', u.id,
    'username', u.username,
    'avatar', u.avatar_data_url
  )
  into v_profile
  from public.call_users u
  where u.id = v_user_id;

  return v_profile;
end;
$$;

create or replace function public.set_call_avatar(p_token uuid, p_avatar text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_user_id uuid;
  v_avatar text;
begin
  select s.user_id
  into v_user_id
  from public.call_sessions s
  where s.token = p_token
    and s.expires_at > now();

  if v_user_id is null then
    raise exception 'invalid_session';
  end if;

  v_avatar := nullif(trim(coalesce(p_avatar, '')), '');

  if v_avatar is not null and (
    length(v_avatar) > 350000
    or v_avatar !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'
  ) then
    raise exception 'invalid_avatar';
  end if;

  update public.call_users
  set avatar_data_url = v_avatar
  where id = v_user_id;

  return jsonb_build_object('avatar', v_avatar);
end;
$$;

create or replace function public.list_call_friends(p_token uuid)
returns jsonb
language sql
security definer
set search_path = 'public'
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'username', u.username,
        'avatar', u.avatar_data_url
      )
    ),
    '[]'::jsonb
  )
  from public.friendships f
  join public.call_users u
    on u.id = case
      when f.user_a = (
        select user_id
        from public.call_sessions
        where token = p_token
          and expires_at > now()
      ) then f.user_b
      else f.user_a
    end
  where f.user_a = (
      select user_id
      from public.call_sessions
      where token = p_token
        and expires_at > now()
    )
    or f.user_b = (
      select user_id
      from public.call_sessions
      where token = p_token
        and expires_at > now()
    );
$$;

revoke all on function public.get_call_profile(uuid) from public;
revoke all on function public.set_call_avatar(uuid, text) from public;
revoke all on function public.list_call_friends(uuid) from public;

grant execute on function public.get_call_profile(uuid) to anon, service_role;
grant execute on function public.set_call_avatar(uuid, text) to anon, service_role;
grant execute on function public.list_call_friends(uuid) to anon, service_role;

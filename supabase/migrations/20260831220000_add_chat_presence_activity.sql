create schema if not exists aurora_private;
revoke all on schema aurora_private from public, anon, authenticated;

create table if not exists aurora_private.presence_sessions (
  session_token uuid primary key references public.call_sessions(token) on delete cascade,
  user_id uuid not null references public.call_users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  activity text not null default 'idle' check (activity in ('idle', 'typing', 'recording', 'offline')),
  activity_peer uuid references public.call_users(id) on delete set null,
  activity_expires_at timestamptz
);

alter table aurora_private.presence_sessions enable row level security;

create index if not exists presence_sessions_user_seen_idx
  on aurora_private.presence_sessions (user_id, last_seen_at desc);

create index if not exists presence_sessions_activity_idx
  on aurora_private.presence_sessions (user_id, activity_peer, activity_expires_at desc)
  where activity in ('typing', 'recording');

create or replace function public.touch_call_presence(
  p_token uuid,
  p_friend uuid default null,
  p_activity text default 'idle'
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'aurora_private'
as $function$
declare
  v_user uuid;
  v_activity text := lower(coalesce(nullif(trim(p_activity), ''), 'idle'));
  v_expires timestamptz;
begin
  select cs.user_id
  into v_user
  from public.call_sessions cs
  where cs.token = p_token
    and cs.expires_at > now();

  if v_user is null then
    raise exception 'invalid_session';
  end if;

  if v_activity not in ('idle', 'typing', 'recording', 'offline') then
    raise exception 'invalid_presence_activity';
  end if;

  if v_activity in ('typing', 'recording') then
    if p_friend is null then
      raise exception 'presence_friend_required';
    end if;

    if not exists (
      select 1
      from public.friendships f
      where (f.user_a = v_user and f.user_b = p_friend)
         or (f.user_a = p_friend and f.user_b = v_user)
    ) then
      raise exception 'not_friends';
    end if;
  end if;

  perform public.aurora_rate_limit(
    'presence:' || v_user::text,
    120,
    interval '1 minute'
  );

  v_expires := case v_activity
    when 'typing' then now() + interval '7 seconds'
    when 'recording' then now() + interval '12 seconds'
    else null
  end;

  insert into aurora_private.presence_sessions (
    session_token,
    user_id,
    last_seen_at,
    activity,
    activity_peer,
    activity_expires_at
  )
  values (
    p_token,
    v_user,
    now(),
    v_activity,
    case when v_activity in ('typing', 'recording') then p_friend else null end,
    v_expires
  )
  on conflict (session_token) do update
  set user_id = excluded.user_id,
      last_seen_at = excluded.last_seen_at,
      activity = excluded.activity,
      activity_peer = excluded.activity_peer,
      activity_expires_at = excluded.activity_expires_at;

  delete from aurora_private.presence_sessions ps
  where ps.last_seen_at < now() - interval '7 days';

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.get_chat_peer_presence(
  p_token uuid,
  p_friend uuid
)
returns table (
  is_online boolean,
  last_seen_at timestamptz,
  activity text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'aurora_private'
as $function$
declare
  v_user uuid;
begin
  select cs.user_id
  into v_user
  from public.call_sessions cs
  where cs.token = p_token
    and cs.expires_at > now();

  if v_user is null then
    raise exception 'invalid_session';
  end if;

  if not exists (
    select 1
    from public.friendships f
    where (f.user_a = v_user and f.user_b = p_friend)
       or (f.user_a = p_friend and f.user_b = v_user)
  ) then
    raise exception 'not_friends';
  end if;

  return query
  with summary as (
    select max(ps.last_seen_at) as last_seen_at
    from aurora_private.presence_sessions ps
    where ps.user_id = p_friend
  ),
  active_activity as (
    select ps.activity
    from aurora_private.presence_sessions ps
    where ps.user_id = p_friend
      and ps.activity_peer = v_user
      and ps.last_seen_at > now() - interval '45 seconds'
      and ps.activity_expires_at > now()
      and ps.activity in ('typing', 'recording')
    order by
      case ps.activity when 'recording' then 2 else 1 end desc,
      ps.activity_expires_at desc
    limit 1
  )
  select
    exists (
      select 1
      from aurora_private.presence_sessions ps
      where ps.user_id = p_friend
        and ps.last_seen_at > now() - interval '45 seconds'
        and ps.activity <> 'offline'
    ) as is_online,
    summary.last_seen_at,
    coalesce((select aa.activity from active_activity aa), 'idle') as activity
  from summary;
end;
$function$;

revoke all on function public.touch_call_presence(uuid, uuid, text) from public, authenticated;
revoke all on function public.get_chat_peer_presence(uuid, uuid) from public, authenticated;
grant execute on function public.touch_call_presence(uuid, uuid, text) to anon;
grant execute on function public.get_chat_peer_presence(uuid, uuid) to anon;

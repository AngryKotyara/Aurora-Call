create or replace function public.send_call_signal(
  p_token uuid,
  p_call_id uuid,
  p_to uuid,
  p_kind text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid;
  linked boolean;
begin
  select user_id
  into uid
  from call_sessions
  where token = p_token
    and expires_at > now();

  if uid is null then
    raise exception 'unauthorized';
  end if;

  if p_kind not in (
    'offer',
    'answer',
    'ice',
    'hangup',
    'decline',
    'screen-share'
  ) then
    raise exception 'invalid_signal';
  end if;

  select exists(
    select 1
    from friendships
    where user_a = least(uid, p_to)
      and user_b = greatest(uid, p_to)
  )
  into linked;

  if not linked then
    raise exception 'not_friends';
  end if;

  insert into call_signals(call_id, from_user, to_user, kind, payload)
  values (p_call_id, uid, p_to, p_kind, p_payload);

  return true;
end
$function$;

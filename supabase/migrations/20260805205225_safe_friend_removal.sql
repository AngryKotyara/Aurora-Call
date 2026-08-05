create or replace function public.remove_call_friend(
  p_token uuid,
  p_friend uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  removed_count integer;
begin
  select user_id
  into current_user_id
  from public.call_sessions
  where token = p_token
    and expires_at > now();

  if current_user_id is null then
    raise exception 'unauthorized';
  end if;

  if p_friend is null or p_friend = current_user_id then
    raise exception 'invalid_friend';
  end if;

  delete from public.friendships
  where user_a = least(current_user_id, p_friend)
    and user_b = greatest(current_user_id, p_friend);

  get diagnostics removed_count = row_count;
  return removed_count > 0;
end;
$$;

revoke all on function public.remove_call_friend(uuid, uuid)
from public, authenticated;

grant execute on function public.remove_call_friend(uuid, uuid) to anon;

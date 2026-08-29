create or replace function public.upload_chat_media(
  p_token uuid,
  p_to uuid,
  p_kind text,
  p_body text,
  p_media_mime text,
  p_media_name text,
  p_media_base64 text
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid;
  v_id bigint;
  v_bytes bytea;
  v_media_mime text;
begin
  select user_id
  into v_me
  from public.call_sessions
  where token = p_token
    and expires_at > now();

  if v_me is null then
    raise exception 'invalid_session';
  end if;

  if p_kind not in ('image', 'video', 'audio') then
    raise exception 'invalid_media_kind';
  end if;

  v_media_mime := lower(trim(split_part(coalesce(p_media_mime, ''), ';', 1)));
  if v_media_mime not in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/avif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-m4v',
    'video/mpeg',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/mpeg',
    'audio/aac',
    'audio/x-m4a'
  ) then
    raise exception 'unsupported_media_type';
  end if;

  if not exists(
    select 1
    from public.friendships f
    where (f.user_a = v_me and f.user_b = p_to)
       or (f.user_a = p_to and f.user_b = v_me)
  ) then
    raise exception 'not_friends';
  end if;

  begin
    v_bytes := decode(p_media_base64, 'base64');
  exception when others then
    raise exception 'invalid_media';
  end;

  if octet_length(v_bytes) > 33554432 then
    raise exception 'media_too_large';
  end if;

  -- Only valid upload attempts consume the upload rate limit. Invalid MIME,
  -- malformed base64 and oversized payloads are rejected before this point.
  perform public.aurora_rate_limit(
    'chat-inline-media:' || v_me::text,
    20,
    interval '1 hour'
  );

  insert into public.chat_messages(
    sender_id,
    recipient_id,
    kind,
    body,
    media_data,
    media_mime,
    media_name
  )
  values (
    v_me,
    p_to,
    p_kind,
    nullif(p_body, ''),
    null,
    v_media_mime,
    left(p_media_name, 255)
  )
  returning id into v_id;

  insert into public.chat_media_blobs(message_id, data)
  values (v_id, v_bytes);

  update public.chat_messages
  set media_data = 'secure:' || v_id::text
  where id = v_id;

  return v_id;
end;
$function$;

revoke all on function public.upload_chat_media(uuid, uuid, text, text, text, text, text) from public, authenticated;
grant execute on function public.upload_chat_media(uuid, uuid, text, text, text, text, text) to anon, service_role;

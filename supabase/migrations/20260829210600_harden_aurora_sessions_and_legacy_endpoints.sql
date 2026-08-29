-- Disable the legacy call-history mutation endpoint. The current client uses
-- start_call / answer_call / finish_call instead.
REVOKE EXECUTE ON FUNCTION public.record_call_event(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Reduce the lifetime of reusable Aurora bearer sessions.
ALTER TABLE public.call_sessions
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');

-- Do not leave previously-issued sessions valid for up to seven days.
UPDATE public.call_sessions
SET expires_at = LEAST(expires_at, now() + interval '24 hours')
WHERE expires_at > now() + interval '24 hours';

-- Server-side logout: deleting the token prevents reuse after the browser
-- clears its local state.
CREATE OR REPLACE FUNCTION public.revoke_call_session(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  removed_count integer;
BEGIN
  IF p_token IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.call_sessions
  WHERE token = p_token;

  GET DIAGNOSTICS removed_count = ROW_COUNT;
  RETURN removed_count > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.revoke_call_session(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_call_session(uuid) TO anon;

-- The old bucket is no longer used and is empty; make it private so a future
-- accidental write cannot become publicly readable.
UPDATE storage.buckets
SET public = false
WHERE id = 'aurora-chat-media';

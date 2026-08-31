-- Record the connected portion of calls so history can show exact duration.
ALTER TABLE public.call_history
  ADD COLUMN IF NOT EXISTS answered_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ended_at timestamp with time zone;

-- Existing WebRTC signals let us repair prior history without guessing. Calls
-- that ended without an answer signal were never connected.
WITH signal_times AS (
  SELECT
    call_id,
    min(created_at) FILTER (WHERE kind = 'answer') AS answered_at,
    min(created_at) FILTER (WHERE kind IN ('hangup', 'decline')) AS ended_at
  FROM public.call_signals
  GROUP BY call_id
)
UPDATE public.call_history AS history
SET
  answered_at = coalesce(history.answered_at, signals.answered_at),
  ended_at = coalesce(history.ended_at, signals.ended_at)
FROM signal_times AS signals
WHERE signals.call_id = history.call_id
  AND (
    (history.answered_at IS NULL AND signals.answered_at IS NOT NULL)
    OR (history.ended_at IS NULL AND signals.ended_at IS NOT NULL)
  );

-- A delayed WebRTC answer can arrive after the caller has already hung up.
-- That attempt was never connected and must not gain a fake zero duration.
UPDATE public.call_history
SET answered_at = NULL
WHERE answered_at IS NOT NULL
  AND ended_at IS NOT NULL
  AND ended_at < answered_at;

UPDATE public.call_history
SET status = 'completed'
WHERE status = 'answered'
  AND answered_at IS NOT NULL
  AND ended_at IS NOT NULL;

UPDATE public.call_history
SET
  status = 'no_answer',
  ended_at = coalesce(ended_at, started_at + interval '90 seconds')
WHERE answered_at IS NULL
  AND (
    status IN ('completed', 'declined')
    OR (status = 'started' AND ended_at IS NOT NULL)
    OR (status = 'started' AND started_at < now() - interval '90 seconds')
  );

CREATE OR REPLACE FUNCTION public.answer_call(
  p_token uuid,
  p_call_id uuid,
  p_accept boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid;
  v_caller uuid;
BEGIN
  SELECT user_id INTO v_me
  FROM public.call_sessions
  WHERE token = p_token AND expires_at > now();
  IF v_me IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT caller_id INTO v_caller
  FROM public.call_history
  WHERE call_id = p_call_id AND callee_id = v_me AND status = 'started'
  FOR UPDATE;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'call_not_found'; END IF;

  UPDATE public.call_history
  SET
    status = CASE WHEN p_accept THEN 'answered' ELSE 'no_answer' END,
    answered_at = CASE WHEN p_accept THEN coalesce(answered_at, now()) ELSE NULL END,
    ended_at = CASE WHEN p_accept THEN NULL ELSE now() END
  WHERE call_id = p_call_id AND callee_id = v_me;

  IF NOT p_accept THEN
    INSERT INTO public.call_signals(call_id, from_user, to_user, kind, payload)
    VALUES (p_call_id, v_me, v_caller, 'decline', '{}'::jsonb);
  END IF;
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.finish_call(p_token uuid, p_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid;
BEGIN
  SELECT user_id INTO v_me
  FROM public.call_sessions
  WHERE token = p_token AND expires_at > now();
  IF v_me IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  UPDATE public.call_history
  SET
    status = CASE
      WHEN status = 'answered' OR answered_at IS NOT NULL THEN 'completed'
      WHEN status IN ('started', 'declined') THEN 'no_answer'
      ELSE status
    END,
    ended_at = coalesce(ended_at, now())
  WHERE call_id = p_call_id
    AND (caller_id = v_me OR callee_id = v_me);
  IF NOT found THEN RAISE EXCEPTION 'call_not_found'; END IF;
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.list_call_history(p_token uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT user_id
    FROM public.call_sessions
    WHERE token = p_token AND expires_at > now()
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', history.id,
    'call_id', history.call_id,
    'peer_id', CASE
      WHEN history.caller_id = (SELECT user_id FROM me) THEN history.callee_id
      ELSE history.caller_id
    END,
    'peer_name', peer.username,
    'mode', history.mode,
    'direction', CASE
      WHEN history.caller_id = (SELECT user_id FROM me) THEN 'outgoing'
      ELSE 'incoming'
    END,
    'status', CASE
      WHEN history.status = 'started'
        AND history.started_at < now() - interval '90 seconds'
      THEN 'no_answer'
      ELSE history.status
    END,
    'created_at', history.started_at,
    'answered_at', history.answered_at,
    'ended_at', history.ended_at,
    'duration_seconds', CASE
      WHEN history.status = 'completed'
        AND history.answered_at IS NOT NULL
        AND history.ended_at IS NOT NULL
      THEN greatest(
        0,
        floor(extract(epoch FROM (history.ended_at - history.answered_at)))::bigint
      )
      ELSE NULL
    END
  ) ORDER BY history.started_at DESC), '[]'::jsonb)
  FROM public.call_history AS history
  JOIN public.call_users AS peer
    ON peer.id = CASE
      WHEN history.caller_id = (SELECT user_id FROM me) THEN history.callee_id
      ELSE history.caller_id
    END
  WHERE history.caller_id = (SELECT user_id FROM me)
     OR history.callee_id = (SELECT user_id FROM me)
$function$;

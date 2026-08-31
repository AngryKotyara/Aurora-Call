-- The initial duration backfill exposed one delayed WebRTC answer that arrived
-- after hangup. Keep production history aligned with fresh installations.
UPDATE public.call_history
SET
  status = 'no_answer',
  answered_at = NULL
WHERE answered_at IS NOT NULL
  AND ended_at IS NOT NULL
  AND ended_at < answered_at;

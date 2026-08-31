-- A browser that closed without sending hangup left one old accepted call in
-- the live state. Keep it as a completed call with unknown legacy duration.
UPDATE public.call_history
SET status = 'completed'
WHERE status = 'answered'
  AND ended_at IS NULL
  AND answered_at < now() - interval '24 hours';

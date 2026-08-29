-- Remove obsolete public execution paths that are not used by the current client.
REVOKE EXECUTE ON FUNCTION public.record_call_event(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Keep logout callable only through the browser role used by Aurora.
REVOKE ALL ON FUNCTION public.revoke_call_session(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_call_session(uuid) TO anon;

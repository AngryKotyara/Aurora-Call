-- Login now goes through the server-side aurora-auth flow and an HttpOnly
-- same-origin session proxy. The browser must never be able to authenticate
-- by presenting the stored access_hash directly.
revoke execute on function public.login_call_user(text, text) from anon;

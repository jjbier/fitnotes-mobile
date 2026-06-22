-- Allows authenticated users to delete their own account.
-- All user data cascades automatically (all tables have user_id references auth.users ON DELETE CASCADE).
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;

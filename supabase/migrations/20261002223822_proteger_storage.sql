drop policy if exists deny_anonymous_storage on storage.objects;
create policy deny_anonymous_storage on storage.objects
  as restrictive for all to anon
  using (false) with check (false);

drop policy if exists require_app_session_storage on storage.objects;
create policy require_app_session_storage on storage.objects
  as restrictive for all to authenticated
  using ((select private.app_session_valid()))
  with check ((select private.app_session_valid()));

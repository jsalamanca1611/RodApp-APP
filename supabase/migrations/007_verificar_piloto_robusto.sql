-- Piloto: la verificación nunca debe quedar bloqueada. Aprueba a quien consulta (no depende de identity_docs ni de antecedent_checks).
create or replace function public.verificar_piloto() returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'error'; end if;
  begin insert into public.antecedent_checks (user_id, status) values (auth.uid(), 'clear'); exception when others then null; end;
  insert into public.profiles (id, nombre) values (auth.uid(), 'Piloto') on conflict (id) do nothing;
  update public.profiles set ver_status = 'ok' where id = auth.uid();
  return 'clear';
end $$;
revoke all on function public.verificar_piloto() from public, anon;
grant execute on function public.verificar_piloto() to authenticated;
-- Aprobar de una vez las cuentas que ya quedaron pendientes
update public.profiles set ver_status = 'ok' where ver_status in ('pending','review');
select id, nombre, ver_status from public.profiles;

-- RodApp · 009: rodada de prueba real, chat que se borra al terminar, historial/XP/calificación en el perfil y rutas propias.
-- Ejecutar en el SQL Editor (una sola vez, con la traducción de Chrome apagada).

-- ============ rutas propias (la dibuja quien crea la rodada) ============
alter table public.rides add column if not exists ruta jsonb;   -- [[lng,lat],...] simplificada (máx. ~400 puntos)

-- ============ al terminar una rodada se borra todo su chat, alertas y ubicaciones ============
create or replace function public.rides_limpiar() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'terminada' and old.estado is distinct from 'terminada' then
    delete from public.ride_messages  where ride_id = new.id;
    delete from public.ride_alerts    where ride_id = new.id;
    delete from public.ride_positions where ride_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists rides_limpiar on public.rides;
create trigger rides_limpiar after update of estado on public.rides for each row execute function public.rides_limpiar();
-- Limpieza de lo que ya quedó de pruebas anteriores en rodadas terminadas
delete from public.ride_messages  where ride_id in (select id from public.rides where estado = 'terminada');
delete from public.ride_alerts    where ride_id in (select id from public.rides where estado = 'terminada');
delete from public.ride_positions where ride_id in (select id from public.rides where estado = 'terminada');

-- ============ "RodApp prueba": rodada de demostración REAL (chat y ubicación compartidos; el recorrido es simulado en la app) ============
create or replace function public.asegurar_demo() returns bigint language plpgsql security definer set search_path = public as $$
declare r public.rides; n int; nid bigint;
begin
  select * into r from public.rides where oficial and nombre = 'RodApp prueba' and estado <> 'terminada' order by id desc limit 1;
  if found then
    select count(*) into n from public.ride_participants where ride_id = r.id;
    if n = 0 then   -- nadie adentro: se reinicia limpia
      delete from public.ride_messages  where ride_id = r.id;
      delete from public.ride_alerts    where ride_id = r.id;
      delete from public.ride_positions where ride_id = r.id;
      if r.estado <> 'abierta' then update public.rides set estado = 'abierta' where id = r.id; end if;
    end if;
    return r.id;
  end if;
  insert into public.rides (nombre, zona, cc, nivel, sale_at, punto, cupo, host, oficial, fecha, hora, km, rt, host_nombre)
  values ('RodApp prueba', 'Norte', '<200', 'Principiante', now() + interval '10 years', 'Portal del Norte · Autopista Norte', 10, null, true, 'Hoy', 'Ahora', 6, 0, 'Demostración')
  returning id into nid;
  return nid;
end $$;
revoke all on function public.asegurar_demo() from public, anon;
grant execute on function public.asegurar_demo() to authenticated;
select public.asegurar_demo();

-- ============ historial, XP y calificación ============
create table if not exists public.rodadas_hechas (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ride_id bigint, nombre text not null, km int not null default 0, xp int not null default 0, badge text,
  created_at timestamptz not null default now(),
  unique (user_id, ride_id)
);
alter table public.rodadas_hechas enable row level security;
drop policy if exists "hechas: ver propias" on public.rodadas_hechas;
create policy "hechas: ver propias" on public.rodadas_hechas for select to authenticated using (user_id = auth.uid());
grant select on public.rodadas_hechas to authenticated;

create table if not exists public.ride_ratings (
  id bigint generated always as identity primary key,
  ride_id bigint not null, from_user uuid not null references auth.users(id) on delete cascade, to_user uuid not null references auth.users(id) on delete cascade,
  c int not null check (c between 1 and 5), p int not null check (p between 1 and 5),
  created_at timestamptz not null default now(),
  unique (ride_id, from_user, to_user)
);
alter table public.ride_ratings enable row level security;
drop policy if exists "ratings: ver las que di" on public.ride_ratings;
create policy "ratings: ver las que di" on public.ride_ratings for select to authenticated using (from_user = auth.uid());
grant select on public.ride_ratings to authenticated;

create or replace function public.registrar_rodada(p_ride bigint, p_nombre text, p_km int, p_xp int, p_badge text) returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return; end if;
  insert into public.rodadas_hechas (user_id, ride_id, nombre, km, xp, badge)
  values (auth.uid(), p_ride, left(coalesce(p_nombre, 'Rodada'), 120), greatest(0, least(coalesce(p_km, 0), 1000)), greatest(0, least(coalesce(p_xp, 0), 400)), p_badge)
  on conflict (user_id, ride_id) do nothing;
  get diagnostics n = row_count;
  if n > 0 then update public.profiles set xp = xp + greatest(0, least(coalesce(p_xp, 0), 400)) where id = auth.uid(); end if;
end $$;
revoke all on function public.registrar_rodada(bigint, text, int, int, text) from public, anon;
grant execute on function public.registrar_rodada(bigint, text, int, int, text) to authenticated;

create or replace function public.calificar(p_ride bigint, p_to uuid, p_c int, p_p int) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_to = auth.uid() then return; end if;
  insert into public.ride_ratings (ride_id, from_user, to_user, c, p) values (p_ride, auth.uid(), p_to, greatest(1, least(5, p_c)), greatest(1, least(5, p_p)))
  on conflict (ride_id, from_user, to_user) do update set c = excluded.c, p = excluded.p;
end $$;
revoke all on function public.calificar(bigint, uuid, int, int) from public, anon;
grant execute on function public.calificar(bigint, uuid, int, int) to authenticated;

create or replace function public.mi_resumen() returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'xp', coalesce((select xp from public.profiles where id = auth.uid()), 0),
    'rodadas', (select count(*) from public.rodadas_hechas where user_id = auth.uid()),
    'rating', (select round(avg((c + p) / 2.0)::numeric, 1) from public.ride_ratings where to_user = auth.uid()),
    'hist', coalesce((select json_agg(h order by h.created_at desc) from (select nombre, km, xp, badge, created_at from public.rodadas_hechas where user_id = auth.uid() order by created_at desc limit 40) h), '[]'::json));
$$;
revoke all on function public.mi_resumen() from public, anon;
grant execute on function public.mi_resumen() to authenticated;

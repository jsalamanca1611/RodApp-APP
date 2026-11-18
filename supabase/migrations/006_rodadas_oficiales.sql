-- RodApp · rodadas oficiales: reemplazan a las de ejemplo. Son reales (cualquiera se une, ve a los demás, chat y mapa en vivo),
-- no tienen anfitrión: el líder es el primero que se unió y, si sale, pasa al siguiente.
-- Ejecutar en el SQL Editor (una sola vez, con la traducción de Chrome apagada).

alter table public.rides alter column host drop not null;
alter table public.rides add column if not exists oficial boolean not null default false;
alter table public.ride_participants add column if not exists joined_at timestamptz not null default now();

-- El anfitrión entra solo como participante (las oficiales no tienen anfitrión).
create or replace function public.rides_host_participa() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.host is not null then
    insert into ride_participants (ride_id, user_id, nombre, xp) values (new.id, new.host, coalesce(new.host_nombre, ''), 0);
  end if;
  return new;
end $$;

-- El nombre del anfitrión sale del perfil; en las oficiales se conserva el que se siembra.
create or replace function public.rides_nombre_host() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.host is not null then
    new.host_nombre := coalesce((select nombre from public.profiles where id = new.host), 'Rodador');
  end if;
  return new;
end $$;

-- Cupo y estado (corrige la comparación cuando no hay anfitrión).
create or replace function public.participants_cupo() returns trigger language plpgsql security definer set search_path = public as $$
declare r public.rides;
begin
  select * into r from public.rides where id = new.ride_id for update;
  if not found then raise exception 'rodada no existe' using errcode = 'P0001'; end if;
  if r.estado <> 'abierta' and new.user_id is distinct from r.host then raise exception 'rodada cerrada' using errcode = 'P0001'; end if;
  if (select count(*) from public.ride_participants where ride_id = new.ride_id) >= r.cupo then raise exception 'rodada llena' using errcode = 'P0001'; end if;
  return new;
end $$;

-- En una rodada oficial cualquier participante puede iniciarla o terminarla, pero nada más.
drop policy if exists "oficial: participantes cambian el estado" on public.rides;
create policy "oficial: participantes cambian el estado" on public.rides for update to authenticated
  using (oficial and exists (select 1 from public.ride_participants p where p.ride_id = id and p.user_id = auth.uid()))
  with check (oficial and host is null);

create or replace function public.rides_oficial_guard() returns trigger language plpgsql as $$
begin
  if old.oficial and (new.nombre, new.zona, new.cc, new.nivel, new.sale_at, new.punto, new.cupo, new.host, new.oficial, new.fecha, new.hora, new.km, new.rt, new.host_nombre)
     is distinct from (old.nombre, old.zona, old.cc, old.nivel, old.sale_at, old.punto, old.cupo, old.host, old.oficial, old.fecha, old.hora, old.km, old.rt, old.host_nombre) then
    raise exception 'en una rodada oficial solo se puede cambiar el estado' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists rides_oficial_guard on public.rides;
create trigger rides_oficial_guard before update on public.rides for each row execute function public.rides_oficial_guard();

-- Siembra las rodadas de los próximos 2 sábados y 2 domingos (hora de Bogotá). Idempotente: la app la llama al abrirse.
create or replace function public.sembrar_rodadas() returns int language plpgsql security definer set search_path = public as $$
declare
  hoy date := (now() at time zone 'America/Bogota')::date;
  sab date[] := '{}'; dom date[] := '{}'; d date; i int; n int := 0; r record; f date;
  dias text[] := array['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  meses text[] := array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
begin
  delete from rides where oficial and sale_at < now() - interval '12 hours';
  for i in 0..20 loop
    d := hoy + i;
    if extract(dow from d) = 6 and coalesce(array_length(sab,1),0) < 2 then sab := sab || d; end if;
    if extract(dow from d) = 0 and coalesce(array_length(dom,1),0) < 2 then dom := dom || d; end if;
  end loop;
  for r in
    select * from (values
      ('La Calera – Guasca','Calera','200–500','Intermedio',1,7,0,8,'Peaje Patios · Vía a La Calera',52,0),
      ('Suba – Zipaquirá','Norte','<200','Principiante',1,8,30,6,'Portal del Norte · Autopista Norte',48,1),
      ('Autopista Sur – Sibaté','Sur','>500','Avanzado',1,6,0,10,'Portal Sur · Autopista Sur',64,2),
      ('Patios – La Calera','Patios','200–500','Intermedio',2,6,30,8,'Peaje Patios · Vía a La Calera',41,3),
      ('Chía – Cajicá','Norte','<200','Principiante',0,7,30,10,'Portal del Norte · Autopista Norte',36,4),
      ('Sesquilé – Guatavita','Norte','>500','Avanzado',2,6,30,8,'Portal del Norte · Autopista Norte',96,5),
      ('Tenjo – Tabio','Occidente','200–500','Intermedio',3,7,30,8,'Portal 80 · Av. Calle 80',68,6),
      ('Mosquera – Madrid','Occidente','<200','Principiante',0,8,0,8,'Portal de las Américas · Av. Américas',44,7)
    ) as t(nombre, zona, cc, nivel, fidx, hh, mm, cupo, punto, km, rt)
  loop
    f := case r.fidx when 0 then sab[1] when 1 then dom[1] when 2 then sab[2] else dom[2] end;
    continue when f is null;
    if not exists (select 1 from rides where oficial and nombre = r.nombre and sale_at = make_timestamptz(extract(year from f)::int, extract(month from f)::int, extract(day from f)::int, r.hh, r.mm, 0, 'America/Bogota')) then
      insert into rides (nombre, zona, cc, nivel, sale_at, punto, cupo, host, oficial, fecha, hora, km, rt, host_nombre)
      values (r.nombre, r.zona, r.cc, r.nivel,
        make_timestamptz(extract(year from f)::int, extract(month from f)::int, extract(day from f)::int, r.hh, r.mm, 0, 'America/Bogota'),
        r.punto, r.cupo, null, true,
        dias[extract(dow from f)::int + 1] || ' ' || extract(day from f)::int || ' ' || meses[extract(month from f)::int],
        (case when r.hh > 12 then r.hh - 12 else r.hh end)::text || ':' || lpad(r.mm::text, 2, '0') || case when r.hh >= 12 then ' PM' else ' AM' end,
        r.km, r.rt, 'Rodada oficial RodApp');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.sembrar_rodadas() from public, anon;
grant execute on function public.sembrar_rodadas() to authenticated;
select public.sembrar_rodadas();

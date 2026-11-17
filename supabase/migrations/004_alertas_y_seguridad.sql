-- RodApp · Alerta de un toque real + anti-suplantación + límites. Ejecutar DESPUÉS de 002 y 003, una sola vez (traducción de Chrome apagada).

-- ============ alertas del grupo ============
create table if not exists public.ride_alerts (
  id bigint generated always as identity primary key,
  ride_id bigint not null references public.rides(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null default '',
  kind text not null check (kind in ('peligro','parada','gasolina','cancel')),
  lat double precision, lng double precision,
  created_at timestamptz not null default now()
);
create index if not exists ride_alerts_ride_idx on public.ride_alerts (ride_id, id);
alter table public.ride_alerts enable row level security;
drop policy if exists "alertas: leer" on public.ride_alerts;
drop policy if exists "alertas: enviar" on public.ride_alerts;
create policy "alertas: leer" on public.ride_alerts for select to authenticated using (public.is_ride_member(ride_id));
create policy "alertas: enviar" on public.ride_alerts for insert to authenticated with check (user_id = auth.uid() and public.is_ride_member(ride_id));

-- ============ anti-suplantación: nombre y XP salen del perfil, nunca del cliente ============
create or replace function public.nombre_desde_perfil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.nombre := coalesce((select nombre from public.profiles where id = auth.uid()), 'Rodador');
  return new;
end $$;
drop trigger if exists ride_messages_nombre on public.ride_messages;
create trigger ride_messages_nombre before insert on public.ride_messages for each row execute function public.nombre_desde_perfil();
drop trigger if exists ride_positions_nombre on public.ride_positions;
create trigger ride_positions_nombre before insert or update on public.ride_positions for each row execute function public.nombre_desde_perfil();
drop trigger if exists ride_alerts_nombre on public.ride_alerts;
create trigger ride_alerts_nombre before insert on public.ride_alerts for each row execute function public.nombre_desde_perfil();

create or replace function public.participante_desde_perfil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select nombre, xp into new.nombre, new.xp from public.profiles where id = new.user_id;
  new.nombre := coalesce(new.nombre, 'Rodador'); new.xp := coalesce(new.xp, 0);
  return new;
end $$;
drop trigger if exists ride_participants_perfil on public.ride_participants;
create trigger ride_participants_perfil before insert or update on public.ride_participants for each row execute function public.participante_desde_perfil();

create or replace function public.rides_nombre_host() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.host_nombre := coalesce((select nombre from public.profiles where id = new.host), 'Rodador');
  return new;
end $$;
drop trigger if exists rides_host_nombre on public.rides;
create trigger rides_host_nombre before insert on public.rides for each row execute function public.rides_nombre_host();

-- ============ límites: spam en el chat y unirse solo a rodadas abiertas con cupo (con bloqueo de fila) ============
create or replace function public.chat_limite() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.ride_messages where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'demasiados mensajes' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists ride_messages_limite on public.ride_messages;
create trigger ride_messages_limite before insert on public.ride_messages for each row execute function public.chat_limite();

create or replace function public.participants_cupo() returns trigger language plpgsql security definer set search_path = public as $$
declare r public.rides;
begin
  select * into r from public.rides where id = new.ride_id for update;
  if not found then raise exception 'rodada no existe' using errcode = 'P0001'; end if;
  if r.estado <> 'abierta' and new.user_id <> r.host then raise exception 'rodada cerrada' using errcode = 'P0001'; end if;
  if (select count(*) from public.ride_participants where ride_id = new.ride_id) >= r.cupo then raise exception 'rodada llena' using errcode = 'P0001'; end if;
  return new;
end $$;

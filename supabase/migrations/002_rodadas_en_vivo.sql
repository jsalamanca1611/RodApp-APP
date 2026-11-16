-- RodApp · rodadas, chat y ubicación en vivo. Ejecutar DESPUÉS de schema.sql (una sola vez, con la traducción de Chrome apagada).

-- ============ rodadas: columnas que usa la app ============
alter table public.rides alter column sale_at set default now();
alter table public.rides
  add column if not exists fecha text, add column if not exists hora text, add column if not exists rt int, add column if not exists km int, add column if not exists host_nombre text,
  add column if not exists estado text not null default 'abierta' check (estado in ('abierta','en_ruta','terminada'));
alter table public.ride_participants
  add column if not exists nombre text not null default '', add column if not exists xp int not null default 0,
  add column if not exists listo boolean not null default false;

create policy "host edita su rodada" on public.rides for update to authenticated using (host = auth.uid()) with check (host = auth.uid());
create policy "host borra su rodada" on public.rides for delete to authenticated using (host = auth.uid());
create policy "participante edita su fila" on public.ride_participants for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- El anfitrión entra solo como participante. Los cupos se respetan en la base, no solo en la app.
create or replace function public.rides_host_participa() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into ride_participants (ride_id, user_id, nombre, xp) values (new.id, new.host, coalesce(new.host_nombre, ''), 0);
  return new;
end $$;
create trigger rides_host_participa after insert on public.rides for each row execute function public.rides_host_participa();

create or replace function public.participants_cupo() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from ride_participants where ride_id = new.ride_id) >= (select cupo from rides where id = new.ride_id) then
    raise exception 'rodada llena' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger participants_cupo before insert on public.ride_participants for each row execute function public.participants_cupo();

-- ============ perfil automático al crear la cuenta (necesario para que verificar_piloto tenga fila que actualizar) ============
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare n text := left(trim(coalesce(new.raw_user_meta_data->>'nombre', '')), 80); e text := new.raw_user_meta_data->>'exp';
begin
  insert into public.profiles (id, nombre, exp)
  values (new.id, case when char_length(n) >= 3 then n else 'Rodador' end, case when e in ('Principiante','Intermedio','Avanzado') then e end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ============ chat de la rodada ============
create table public.ride_messages (
  id bigint generated always as identity primary key,
  ride_id bigint not null references public.rides(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null, texto text not null check (char_length(texto) between 1 and 500),
  created_at timestamptz not null default now()
);
create index ride_messages_ride_idx on public.ride_messages (ride_id, id);
alter table public.ride_messages enable row level security;
create policy "chat: leer" on public.ride_messages for select to authenticated using (public.is_ride_member(ride_id));
create policy "chat: escribir" on public.ride_messages for insert to authenticated with check (user_id = auth.uid() and public.is_ride_member(ride_id));

-- ============ ubicación en vivo: solo la última posición de cada participante ============
create table public.ride_positions (
  ride_id bigint not null references public.rides(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null, lat double precision not null, lng double precision not null,
  speed real, heading real, updated_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);
alter table public.ride_positions enable row level security;
create policy "pos: leer" on public.ride_positions for select to authenticated using (public.is_ride_member(ride_id));
create policy "pos: crear" on public.ride_positions for insert to authenticated with check (user_id = auth.uid() and public.is_ride_member(ride_id));
create policy "pos: actualizar" on public.ride_positions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_ride_member(ride_id));
create policy "pos: borrar la propia" on public.ride_positions for delete to authenticated using (user_id = auth.uid());
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger ride_positions_touch before update on public.ride_positions for each row execute function public.touch_updated_at();

-- ============ verificación del piloto (simula antecedentes sin proveedor) ============
-- Cédulas de prueba: 1000000009 = revisión, 1000000007 = error. Cualquier otra sale limpia. NO consulta a la Policía.
-- Sin selfie (alt) siempre queda en revisión. Se reemplaza por la Edge Function "antecedentes" cuando haya proveedor.
create or replace function public.verificar_piloto() returns text language plpgsql security definer set search_path = public as $$
declare r public.identity_docs; st text;
begin
  select * into r from public.identity_docs where user_id = auth.uid();
  if not found then return 'error'; end if;
  st := case r.cedula when '1000000009' then 'flag' when '1000000007' then 'error' else 'clear' end;
  insert into public.antecedent_checks (user_id, status) values (auth.uid(), st);
  if st = 'error' then return 'error'; end if;
  update public.profiles set ver_status = case when st = 'clear' and not r.alt then 'ok' else 'review' end where id = auth.uid();
  return st;
end $$;
revoke all on function public.verificar_piloto() from public, anon;
grant execute on function public.verificar_piloto() to authenticated;

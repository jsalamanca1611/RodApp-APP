-- RodApp · esquema inicial (Supabase / Postgres). Ejecutar en el SQL Editor o como migración.
-- Principios: RLS en todo, cédula nunca en claro, verificación escrita solo por el servidor, ubicación solo en canales privados.
-- Las constantes de club_discount() deben coincidir con ECON en clubs-model.js (hay una prueba de paridad pendiente).

create extension if not exists pgcrypto;

-- ============ perfiles ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 3 and 80),
  exp text check (exp in ('Principiante','Intermedio','Avanzado')),
  cc text check (cc in ('<200','200–500','>500')),
  tipo text, marca text, placa text check (placa ~ '^[A-Z]{3}[0-9]{2}[A-Z]$'),
  ver_status text not null default 'pending' check (ver_status in ('pending','ok','review','rejected')),
  cedula_hash text,                 -- HMAC(cédula, pepper). Nunca la cédula en claro.
  premium_until timestamptz,
  xp int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "perfil propio: leer" on public.profiles for select to authenticated using (id = auth.uid());
create policy "perfil propio: crear" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "perfil propio: editar" on public.profiles for update to authenticated using (id = auth.uid());
-- El cliente NO escribe ver_status, cedula_hash, premium_until ni xp: solo el servidor (service_role).
revoke insert, update on public.profiles from authenticated;
grant insert (id,nombre,exp,cc,tipo,marca,placa) on public.profiles to authenticated;
grant update (nombre,exp,cc,tipo,marca,placa) on public.profiles to authenticated;

-- ============ identidad (nombre y cédula para seguridad) ============
-- El usuario puede CREAR su fila una vez, pero no leerla ni editarla. Solo el servidor (service_role) y el equipo autorizado la consultan.
-- ocr_*: lo que leyó el OCR de la foto. editado = el usuario cambió lo leído. Si ocr_ok es false o editado es true, la cuenta pasa a revisión humana.
create table public.identity_docs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre_legal text not null, cedula text not null check (cedula ~ '^[0-9]{6,10}$'),
  ocr_nombre text, ocr_numero text, ocr_ok boolean not null default false, editado boolean not null default false, alt boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index identity_docs_cedula_uq on public.identity_docs (cedula);  -- una cédula, una cuenta
alter table public.identity_docs enable row level security;
create policy "identidad: crear la propia" on public.identity_docs for insert to authenticated with check (user_id = auth.uid());
revoke all on public.identity_docs from authenticated;
grant insert on public.identity_docs to authenticated;
-- Recomendación: cifrar la columna cedula con Supabase Vault / pgsodium antes de producción.

-- ============ consentimientos (evidencia Ley 1581) ============
create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ident','antec','ubic')),
  text_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.consents enable row level security;
create policy "consent propio" on public.consents for select to authenticated using (user_id = auth.uid());
create policy "consent crear" on public.consents for insert to authenticated with check (user_id = auth.uid());
create policy "consent revocar" on public.consents for update to authenticated using (user_id = auth.uid());

-- ============ consultas de antecedentes (límite y auditoría; sin detalle del resultado) ============
create table public.antecedent_checks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('clear','flag','error')),
  created_at timestamptz not null default now()
);
alter table public.antecedent_checks enable row level security;  -- sin políticas: solo service_role

-- ============ clubes ============
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique, zona text not null, region text not null default 'Bogotá y Sabana',
  cc text not null check (cc in ('<200','200–500','>500')),
  liga text not null default 'Rookie' check (liga in ('Rookie','Pro','Élite')),
  descripcion text, created_by uuid references auth.users(id), created_at timestamptz default now()
);
create table public.club_members (
  club_id uuid references public.clubs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin')),
  joined_at timestamptz default now(),
  primary key (club_id, user_id)
);
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
create policy "clubes visibles" on public.clubs for select to authenticated using (true);
create policy "ver miembros" on public.club_members for select to authenticated using (true);
create policy "unirse" on public.club_members for insert to authenticated with check (user_id = auth.uid() and role = 'member');
create policy "salir" on public.club_members for delete to authenticated using (user_id = auth.uid());

-- Miembros y Premium por club (agregado; no expone quién es Premium).
create or replace view public.club_stats as
select c.id as club_id,
       count(m.user_id)::int as miembros,
       count(p.id) filter (where p.premium_until > now())::int as premium
from public.clubs c
left join public.club_members m on m.club_id = c.id
left join public.profiles p on p.id = m.user_id
group by c.id;
grant select on public.club_stats to authenticated;

-- Descuento sobre la cuota del club. SUPUESTOS: cuota 89.000, Premium 14.900 con 70 % neto, mínimo 10 Premium, tope de costo 35 %.
create or replace function public.club_discount(m int, p int) returns numeric language plpgsql immutable as $$
declare ratio numeric := case when m > 0 then p::numeric / m else 0 end; pct numeric := 0;
        cuota numeric := 89000; neto numeric := p * 14900 * 0.70;
begin
  if p < 10 then return 0; end if;
  pct := case when ratio >= .80 then .40 when ratio >= .60 then .30 when ratio >= .40 then .20 when ratio >= .20 then .10 else 0 end;
  while pct > 0 and cuota * pct > neto * 0.35 + 0.000001 loop pct := round(pct - .05, 2); end loop;
  return pct;
end $$;

-- ============ rodadas (mínimo para Realtime; el resto del modelo sigue en el front mientras se migra) ============
create table public.rides (
  id bigint generated always as identity primary key,
  nombre text not null, zona text not null, cc text not null, nivel text not null,
  sale_at timestamptz not null, punto text not null, cupo int not null check (cupo between 2 and 30),
  host uuid not null references auth.users(id), club_id uuid references public.clubs(id), created_at timestamptz default now()
);
create table public.ride_participants (
  ride_id bigint references public.rides(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (ride_id, user_id)
);
alter table public.rides enable row level security;
alter table public.ride_participants enable row level security;
create or replace function public.is_verified() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and ver_status = 'ok') $$;
create or replace function public.is_ride_member(rid bigint) returns boolean language sql stable security definer set search_path = public as
$$ select public.is_verified() and (exists (select 1 from ride_participants where ride_id = rid and user_id = auth.uid())
   or exists (select 1 from rides where id = rid and host = auth.uid())) $$;
create policy "rodadas visibles" on public.rides for select to authenticated using (true);
create policy "crear rodada verificado" on public.rides for insert to authenticated with check (host = auth.uid() and public.is_verified());
create policy "ver participantes" on public.ride_participants for select to authenticated using (true);
create policy "unirse verificado" on public.ride_participants for insert to authenticated with check (user_id = auth.uid() and public.is_verified());
create policy "salir de rodada" on public.ride_participants for delete to authenticated using (user_id = auth.uid());

-- ============ Realtime: ubicación en canales privados "ride:<id>" ============
-- El cliente usa channel('ride:ID', {config:{private:true}}). Solo participantes verificados leen y escriben.
create policy "ubicacion: leer" on realtime.messages for select to authenticated
  using (realtime.topic() like 'ride:%' and public.is_ride_member(split_part(realtime.topic(), ':', 2)::bigint));
create policy "ubicacion: escribir" on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'ride:%' and public.is_ride_member(split_part(realtime.topic(), ':', 2)::bigint));
-- Las posiciones viajan por Broadcast y NO se guardan en la base de datos.

-- ============ Storage: fotos de verificación (bucket privado) ============
insert into storage.buckets (id, name, public) values ('kyc', 'kyc', false) on conflict do nothing;
create policy "kyc: subir en mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kyc: reemplazar en mi carpeta" on storage.objects for update to authenticated
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
-- Lectura: ninguna política para usuarios. Solo el servidor (revisión manual) con URLs firmadas de corta duración.
-- Retención (propuesta 30 días): programar con pg_cron un borrado de storage.objects del bucket 'kyc' más antiguo que 30 días.

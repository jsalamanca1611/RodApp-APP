-- RodApp · reciprocidad de ubicación: solo ves al grupo si tú también compartes la tuya en esa rodada.
-- Ejecutar en el SQL Editor (una sola vez, con la traducción de Chrome apagada).

create or replace function public.has_shared(rid bigint) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from ride_positions where ride_id = rid and user_id = auth.uid()) $$;

drop policy if exists "pos: leer" on public.ride_positions;
create policy "pos: leer" on public.ride_positions for select to authenticated
  using (user_id = auth.uid() or (public.is_ride_member(ride_id) and public.has_shared(ride_id)));

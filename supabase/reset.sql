-- RodApp · borra lo creado por schema.sql para poder ejecutarlo limpio. Solo para un proyecto nuevo y sin datos.
drop function if exists public.is_ride_member(bigint) cascade;
drop function if exists public.is_verified() cascade;
drop function if exists public.club_discount(int, int) cascade;
drop view if exists public.club_stats cascade;
drop table if exists public.ride_participants, public.rides, public.club_members, public.clubs,
  public.antecedent_checks, public.consents, public.identity_docs, public.profiles cascade;
drop policy if exists "ubicacion: leer" on realtime.messages;
drop policy if exists "ubicacion: escribir" on realtime.messages;
drop policy if exists "kyc: subir en mi carpeta" on storage.objects;
drop policy if exists "kyc: reemplazar en mi carpeta" on storage.objects;

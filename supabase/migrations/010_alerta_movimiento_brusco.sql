-- RodApp · 010: nuevo tipo de alerta "brusco" (movimiento brusco detectado por el sensor del teléfono).
alter table public.ride_alerts drop constraint if exists ride_alerts_kind_check;
alter table public.ride_alerts add constraint ride_alerts_kind_check check (kind in ('peligro','parada','gasolina','cancel','brusco'));

/* RodApp · configuración pública.
   Con estos dos valores vacíos la app corre en MODO DEMO (datos simulados, nada sale del teléfono).
   Para conectar el backend real, pega aquí la URL del proyecto Supabase y la clave "anon" (pública).
   NUNCA pongas aquí la service_role ni las claves del proveedor de antecedentes: viven solo en la Edge Function. */
window.RODAPP_CONFIG={
  supabaseUrl:'',
  anonKey:'',
  /* Mapa (MapLibre). 'osm' = calles de OpenStreetMap, sin llave (válido para el piloto; su política de teselas no admite tráfico alto).
     Para producción: URL de un style.json de MapTiler, Protomaps u otro. Vacío = mapa esquemático sin teselas. */
  mapStyle:'osm'
};

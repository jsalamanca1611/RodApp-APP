/* RodApp · configuración pública.
   Con estos dos valores vacíos la app corre en MODO DEMO (datos simulados, nada sale del teléfono).
   Para conectar el backend real, pega aquí la URL del proyecto Supabase y la clave "anon" (pública).
   NUNCA pongas aquí la service_role ni las claves del proveedor de antecedentes: viven solo en la Edge Function. */
window.RODAPP_CONFIG={
  supabaseUrl:'',
  anonKey:'',
  /* Estilo del mapa (MapLibre). Vacío = mapa esquemático sin teselas. Ej.: un style.json de MapTiler o Protomaps. */
  mapStyle:''
};

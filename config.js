/* RodApp · configuración pública.
   Con estos dos valores vacíos la app corre en MODO DEMO (datos simulados, nada sale del teléfono).
   Para conectar el backend real, pega aquí la URL del proyecto Supabase y la clave "anon" (pública).
   NUNCA pongas aquí la service_role ni las claves del proveedor de antecedentes: viven solo en la Edge Function. */
window.RODAPP_CONFIG=Object.assign({
  supabaseUrl:'https://jqagzxfioluerxnnmdkb.supabase.co',
  anonKey:'sb_publishable_-_fLZ3R7wvUR5m4cWRiq3w_9T3HVwm5',  /* clave PÚBLICA (publishable): segura en el navegador porque todo está protegido con RLS */
  antecedentes:'piloto',  /* 'piloto' = verificación simulada en la base (RPC verificar_piloto); 'funcion' = Edge Function con proveedor real */
  /* Mapa (MapLibre). 'dark' = mapa oscuro de CARTO sobre OpenStreetMap, sin llave; 'osm' = calles claras de OpenStreetMap. Ambos sirven para el piloto; su uso en producción con tráfico alto requiere plan o proveedor propio.
     Para producción: URL de un style.json de MapTiler, Protomaps u otro. Vacío = mapa esquemático sin teselas. */
  /* Revisión de cuentas. 'auto' (piloto): si la cédula se fotografió y se confirmaron nombre y número, la cuenta entra aunque el OCR haya fallado o la persona haya corregido datos;
     queda guardado en identity_docs (editado, ocr_ok) para auditar después. 'manual': esos casos esperan a una persona. Los antecedentes con registros y la verificación sin selfie siempre esperan a una persona. */
  revision:'auto',
  mapStyle:'dark',
  /* Rodadas de ejemplo con compañeros simulados (sim.js) junto a las reales. Ponlo en false cuando haya suficientes rodadas reales. */
  rodadasEjemplo:true
},window.RODAPP_OVERRIDE||{});

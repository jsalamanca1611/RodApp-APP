# RodApp

PWA para rodadas de motociclistas en Bogotá y la Sabana. HTML, CSS y JavaScript sin framework.

## Estado
| Módulo | Estado |
|---|---|
| Rodadas, comunidad, Modo Rodada, tour | Prototipo con datos de ejemplo |
| Clubes, copas y descuento por Premium | Pantallas + modelo (`clubs-model.js`) con prueba |
| Registro, cámara, consentimiento, antecedentes | Flujo completo en **modo demo**; modo real listo, sin probar contra un proyecto |
| Mapa y ubicación en vivo | Demo con compañeros simulados; modo real (Supabase Realtime) escrito, sin probar |

## Modo demo y modo real
`config.js` vacío = demo (nada sale del teléfono). Para conectar el backend: pega `supabaseUrl` y `anonKey`.
En demo, una cédula que termina en **9** devuelve "en revisión" y en **7** devuelve "error del servicio".

## Backend (Supabase)
1. Crea el proyecto. En *Authentication*, para el piloto desactiva "Confirm email" (o el registro pedirá confirmar y volver a entrar).
2. Ejecuta `supabase/schema.sql` en el SQL Editor.
3. En *Realtime → Settings* desactiva el acceso público: los canales `ride:<id>` son privados y se rigen por las políticas de `realtime.messages`.
4. Define secretos y despliega la función:
   ```
   supabase secrets set ANTEC_PROVIDER_TOKEN=... CEDULA_PEPPER=<cadena larga aleatoria>
   supabase functions deploy antecedentes
   ```
5. Pega URL y anon key en `config.js`. La `service_role` y el token del proveedor nunca van al navegador.

## Pruebas
`node tests/clubs.test.js` verifica el tope de costo, el mínimo de Premium y que el descuento nunca baje al subir el % Premium.

## Decisiones abiertas
- **Proveedor de antecedentes.** No existe API oficial de la Policía; la consulta pública pide captcha. `antecedentes/index.ts` usa Verifik como ejemplo. Falta cotizar, firmar contrato y revisar su tratamiento de datos.
- **Revisión legal** (Ley 1581 de 2012): selfie = dato biométrico sensible, autorización explícita, alternativa manual, retención (propuesta 30 días), política de tratamiento y responsable.
- **Precios**: `ECON` en `clubs-model.js` son supuestos (Premium $14.900, cuota de club $89.000). Validar con clubes reales.
- **Proveedor de mapa**: MapLibre con un `style.json` (MapTiler, Protomaps u otro). Sin estilo, la app dibuja un mapa esquemático. Comparar costo por carga y cobertura de Colombia.
- **Límites web**: el GPS solo reporta con pantalla encendida y app en primer plano; iOS no tiene vibración y exige instalar la PWA para notificaciones. Si el piloto choca con esto, evaluar Capacitor.

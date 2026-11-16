// Edge Function: antecedentes judiciales por cédula (Policía Nacional vía proveedor).
// Secretos solo aquí: supabase secrets set ANTEC_PROVIDER_TOKEN=... CEDULA_PEPPER=...
// Devuelve SOLO {status}. No guarda ni devuelve nombre, anotaciones ni el texto del certificado.
// Proveedor de ejemplo: Verifik (GET https://api.verifik.co/v2/co/policia/consultar, Authorization: Bearer).
// Cambiar de proveedor = cambiar consultar() y clasificar(). Verificar contrato, precio y tratamiento de datos antes de producción.
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_POR_DIA = 3;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function hmac(texto: string, clave: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto));
  return [...new Uint8Array(s)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** 'clear' = sin asuntos; 'flag' = registra asuntos (pasa a revisión humana); 'error' = no se pudo determinar. */
function clasificar(status: number, body: any): 'clear' | 'flag' | 'error' {
  if (status !== 200) return 'error';
  const d = String(body?.data?.details ?? '').toUpperCase();
  if (d.includes('REGISTRA ASUNTOS')) return 'flag';
  if (d.includes('NO TIENE ASUNTOS')) return 'clear';
  return 'error'; // incluye "El resultado de su consulta no puede ser generado…"
}

async function consultar(cedula: string) {
  // ANTEC_MODE=simulado (piloto sin proveedor): 1000000009 = revisión, 1000000007 = error, cualquier otra = limpio. NO consulta a la Policía.
  if (Deno.env.get('ANTEC_MODE') === 'simulado') { return cedula === '1000000009' ? 'flag' : cedula === '1000000007' ? 'error' : 'clear'; }
  const u = new URL('https://api.verifik.co/v2/co/policia/consultar');
  u.searchParams.set('documentType', 'CC'); u.searchParams.set('documentNumber', cedula);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${Deno.env.get('ANTEC_PROVIDER_TOKEN')}`, 'Content-Type': 'application/json' } });
  let b: unknown = null; try { b = await r.json(); } catch { /* respuesta sin JSON */ }
  return clasificar(r.status, b);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const usuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await usuario.auth.getUser();
  if (!user) return json({ error: 'auth' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // La cédula sale de la fila guardada (identity_docs), no de lo que mande el cliente en esta llamada.
  const { data: idr } = await admin.from('identity_docs').select('cedula, ocr_ok, editado, alt').eq('user_id', user.id).maybeSingle();
  if (!idr) return json({ error: 'identidad' }, 409);
  const cedula = idr.cedula;
  const auto = Deno.env.get('REVISION_MODE') === 'auto';  // piloto: la lectura dudosa o los datos corregidos no bloquean; quedan marcados para auditar
  const revisar = idr.alt || (!auto && (!idr.ocr_ok || idr.editado));  // lectura dudosa, datos cambiados o verificación manual: lo decide una persona

  // 1) Consentimiento vigente registrado en servidor (no basta con lo que diga el cliente).
  const { data: cons } = await admin.from('consents').select('id').eq('user_id', user.id).eq('kind', 'antec').is('revoked_at', null).limit(1);
  if (!cons?.length) return json({ error: 'consent' }, 403);

  // 2) Límite diario para no gastar consultas del proveedor.
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from('antecedent_checks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', desde);
  if ((count ?? 0) >= MAX_POR_DIA) return json({ status: 'error', reason: 'limit' }, 429);

  // 3) Consulta y registro del estado.
  const status = await consultar(String(cedula));
  await admin.from('antecedent_checks').insert({ user_id: user.id, status });
  if (status !== 'error') {
    await admin.from('profiles').update({
      ver_status: status === 'clear' && !revisar ? 'ok' : 'review',
      cedula_hash: await hmac(String(cedula), Deno.env.get('CEDULA_PEPPER')!), // detecta cédulas repetidas sin guardarlas
    }).eq('id', user.id);
  }
  return json({ status });
});

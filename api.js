'use strict';
/* RodApp · adaptador de backend.
   mode 'demo': simula respuestas (útil para diseñar). mode 'live': habla con Supabase por REST (sin SDK).
   Regla: el navegador nunca llama al proveedor de antecedentes; lo hace la Edge Function "antecedentes". */
const RodAPI=(()=>{
  const C=window.RODAPP_CONFIG||{},live=!!(C.supabaseUrl&&C.anonKey);
  let ses=null;try{ses=JSON.parse(sessionStorage.getItem('rodapp.ses')||'null')}catch(e){}
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const hdr=(auth,extra)=>Object.assign({apikey:C.anonKey,'Content-Type':'application/json'},auth&&ses?{Authorization:'Bearer '+ses.access_token}:{},extra||{});
  async function call(path,opt){const r=await fetch(C.supabaseUrl+path,opt),t=await r.text();let b;try{b=JSON.parse(t)}catch(e){b=t}
    if(!r.ok)throw Object.assign(new Error((b&&(b.msg||b.message||b.error_description))||r.statusText),{status:r.status});return b}
  const keep=s=>{ses=s;try{sessionStorage.setItem('rodapp.ses',JSON.stringify(s))}catch(e){}};
  let skew=0,refreshing=null;
  /* Renueva el access_token (dura ~1 h) con el refresh_token. Una sola renovación a la vez. */
  async function refresh(){if(!ses||!ses.refresh_token)throw new Error('sin sesión');
    refreshing=refreshing||call('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:hdr(),body:JSON.stringify({refresh_token:ses.refresh_token})}).then(b=>{keep(b);return b}).finally(()=>{refreshing=null});return refreshing}
  /* REST con sesión: si el token venció (401) lo renueva y reintenta una vez. Guarda el desfase del reloj del servidor. */
  async function rest(path,method,body,prefer){
    const go=()=>fetch(C.supabaseUrl+'/rest/v1'+path,{method:method||'GET',headers:hdr(true,prefer?{Prefer:prefer}:{}),body:body==null?undefined:JSON.stringify(body)});
    let r=await go();if(r.status===401&&ses&&ses.refresh_token){await refresh();r=await go()}
    const d=r.headers.get('Date');if(d){const t=Date.parse(d);if(t)skew=t-Date.now()}
    const t=await r.text();let b;try{b=t?JSON.parse(t):null}catch(e){b=t}
    if(!r.ok)throw Object.assign(new Error((b&&(b.message||b.msg))||r.statusText),{status:r.status,code:b&&b.code});return b}
  const rest0=(path,body)=>rest(path,'POST',body);
  return{
    live,cfg:C,session:()=>ses,rest,serverNow:()=>Date.now()+skew,
    uid:()=>ses&&ses.user&&ses.user.id,
    async signUp(email,pass,meta){if(!live){await wait(500);return{id:'demo'}}
      const b=await call('/auth/v1/signup',{method:'POST',headers:hdr(),body:JSON.stringify({email,password:pass,data:meta})});
      if(b.access_token)keep(b);return b},
    async signIn(email,pass){if(!live){await wait(300);return{id:'demo'}}
      const b=await call('/auth/v1/token?grant_type=password',{method:'POST',headers:hdr(),body:JSON.stringify({email,password:pass})});keep(b);return b},
    /* Foto de cédula/selfie a un bucket PRIVADO (kyc). La política RLS solo deja escribir en la carpeta del propio usuario. */
    async uploadKyc(kind,blob){if(!live){await wait(300);return{path:'demo/'+kind}}
      const uid=ses&&ses.user&&ses.user.id;const p=`${uid}/${kind}.jpg`;
      const r=await fetch(`${C.supabaseUrl}/storage/v1/object/kyc/${p}`,{method:'POST',headers:{apikey:C.anonKey,Authorization:'Bearer '+ses.access_token,'Content-Type':'image/jpeg','x-upsert':'true'},body:blob});
      if(!r.ok)throw new Error('upload');return{path:p}},
    /* Devuelve {status:'clear'|'flag'|'error'}. Solo estado: el detalle no se guarda. */
    async antecedentes({cedula,consent}){
      if(!live){await wait(1600);const c=String(cedula);return{status:c==='1000000009'?'flag':c==='1000000007'?'error':'clear',demo:true}}
      if(C.antecedentes==='piloto'){try{const s=await rest0('/rpc/verificar_piloto',{});return{status:String(s).replace(/"/g,'')}}catch(e){return{status:'error'}}}
      try{return await call('/functions/v1/antecedentes',{method:'POST',headers:hdr(true),body:JSON.stringify({cedula,consent})})}catch(e){return{status:'error'}}},
    async saveConsent(kinds,ver){if(!live)return;
      await call('/rest/v1/consents',{method:'POST',headers:hdr(true),body:JSON.stringify(kinds.map(k=>({user_id:ses.user.id,kind:k,text_version:ver})))})},
    /* Nombre y cédula leídos/confirmados. La tabla identity_docs solo la lee el servidor; el usuario no puede ver ni editar su fila después. */
    async saveIdentity(d){if(!live)return;
      await call('/rest/v1/identity_docs',{method:'POST',headers:hdr(true,{Prefer:'resolution=ignore-duplicates'}),body:JSON.stringify(Object.assign({user_id:ses.user.id},d))})},
    async profile(){if(!live||!ses)return null;
      const r=await call('/rest/v1/profiles?id=eq.'+ses.user.id+'&select=nombre,exp,cc,placa,marca,ver_status,xp',{headers:hdr(true)});return r[0]||null},
    async saveProfile(p){if(!live)return;await call('/rest/v1/profiles?on_conflict=id',{method:'POST',headers:hdr(true,{Prefer:'resolution=merge-duplicates'}),body:JSON.stringify(p)})}
  }})();

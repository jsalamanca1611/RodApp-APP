'use strict';
/* RodApp · adaptador de backend.
   mode 'demo': simula respuestas (útil para diseñar). mode 'live': habla con Supabase por REST (sin SDK).
   Regla: el navegador nunca llama al proveedor de antecedentes; lo hace la Edge Function "antecedentes". */
const RodAPI=(()=>{
  const C=window.RODAPP_CONFIG||{},live=!!(C.supabaseUrl&&C.anonKey);
  let ses=null;try{ses=JSON.parse(localStorage.getItem('rodapp.ses')||sessionStorage.getItem('rodapp.ses')||'null')}catch(e){}
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const hdr=(auth,extra)=>Object.assign({apikey:C.anonKey,'Content-Type':'application/json'},auth&&ses?{Authorization:'Bearer '+ses.access_token}:{},extra||{});
  async function call(path,opt){const r=await fetch(C.supabaseUrl+path,opt),t=await r.text();let b;try{b=JSON.parse(t)}catch(e){b=t}
    if(!r.ok)throw Object.assign(new Error((b&&(b.msg||b.message||b.error_description))||r.statusText),{status:r.status});return b}
  /* La sesión se guarda en el dispositivo para no pedir el ingreso cada vez (importante en el APK). Se borra al cerrar sesión. */
  const keep=s=>{ses=s;try{localStorage.setItem('rodapp.ses',JSON.stringify(s))}catch(e){}};
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
      const uid=ses&&ses.user&&ses.user.id;if(!uid)throw new Error('sin sesión');
      /* Nombre único por foto y sin upsert: así solo hace falta el permiso INSERT en la carpeta propia (el upsert exige además SELECT, que no se da a los usuarios). */
      const p=`${uid}/${kind}-${Date.now()}.jpg`;
      const send=()=>fetch(`${C.supabaseUrl}/storage/v1/object/kyc/${p}`,{method:'POST',headers:{apikey:C.anonKey,Authorization:'Bearer '+ses.access_token,'Content-Type':'image/jpeg'},body:blob});
      let r=await send();if(r.status===401&&ses.refresh_token){await refresh();r=await send()}
      if(!r.ok){let m='';try{const j=await r.json();m=j.message||j.error||''}catch(e){}throw new Error((m||'error')+' ('+r.status+')')}
      return{path:p}},
    /* Devuelve {status:'clear'|'flag'|'error'}. Solo estado: el detalle no se guarda. */
    async antecedentes({cedula,consent}){
      if(!live){await wait(1600);const c=String(cedula);return{status:'clear',demo:true}}
      if(C.antecedentes==='piloto'){try{const s=await rest0('/rpc/verificar_piloto',{});return{status:String(s).replace(/"/g,'')}}catch(e){return{status:'error'}}}
      try{return await call('/functions/v1/antecedentes',{method:'POST',headers:hdr(true),body:JSON.stringify({cedula,consent})})}catch(e){return{status:'error'}}},
    async saveConsent(kinds,ver){if(!live)return;
      await call('/rest/v1/consents',{method:'POST',headers:hdr(true),body:JSON.stringify(kinds.map(k=>({user_id:ses.user.id,kind:k,text_version:ver})))})},
    /* Nombre y cédula leídos/confirmados. La tabla identity_docs solo la lee el servidor; el usuario no puede ver ni editar su fila después. */
    async saveIdentity(d){if(!live)return;
      await call('/rest/v1/identity_docs',{method:'POST',headers:hdr(true,{Prefer:'resolution=ignore-duplicates'}),body:JSON.stringify(Object.assign({user_id:ses.user.id},d))})},
    async profile(){if(!live||!ses)return null;
      const r=await rest('/profiles?id=eq.'+ses.user.id+'&select=nombre,exp,cc,placa,marca,ver_status,xp');return r[0]||null},
    async signOut(){const t=ses&&ses.access_token;ses=null;try{localStorage.removeItem('rodapp.ses');sessionStorage.removeItem('rodapp.ses')}catch(e){}
      if(live&&t)fetch(C.supabaseUrl+'/auth/v1/logout',{method:'POST',headers:{apikey:C.anonKey,Authorization:'Bearer '+t}}).catch(()=>{})},
    /* Actualiza la fila que crea el trigger al registrarse (PATCH, solo columnas permitidas); si no existe, la crea. */
    async saveProfile(p){if(!live)return;const id=p.id||(ses&&ses.user&&ses.user.id),d={};['nombre','exp','cc','tipo','marca','placa'].forEach(k=>{if(p[k]!=null&&p[k]!=='')d[k]=p[k]});
      const r=await call('/rest/v1/profiles?id=eq.'+id,{method:'PATCH',headers:hdr(true,{Prefer:'return=representation'}),body:JSON.stringify(d)});
      if(Array.isArray(r)&&r.length)return;
      await call('/rest/v1/profiles',{method:'POST',headers:hdr(true,{Prefer:'return=minimal'}),body:JSON.stringify(Object.assign({id},d))})}
  }})();

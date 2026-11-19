'use strict';
/* RodApp · registro real: consentimiento (Ley 1581), cámara del teléfono y antecedentes por cédula.
   Depende de app.js (S, SCR, ACT, go, render, openLayer, closeLayer, toast, I, hdr, prog, esc) y api.js (RodAPI).
   Decisiones de privacidad:
   - Las fotos viven solo en memoria hasta subirlas a un bucket privado; no se guardan en el navegador.
   - Del antecedente solo se guarda el estado (limpio / revisión / pendiente), nunca el detalle.
   - La verificación biométrica no es la única vía: existe la alternativa manual (art. 6 Ley 1581 y criterio de la SIC).
   Este flujo requiere revisión de un abogado antes del lanzamiento. */

Object.assign(S,{consent:{ident:false,antec:false,ubic:false},verStatus:null});
const _fresh=fresh;fresh=function(){_fresh();Object.assign(S,{consent:{ident:false,antec:false,ubic:false},verStatus:null});
  S.kyc=Object.assign(S.kyc,{cedula:'',nombre:'',ocr:null,ocrOk:false,ocrFails:0,manual:false,edited:false,alt:false,antec:'idle'})};
S.kyc=Object.assign(S.kyc,{cedula:'',nombre:'',ocr:null,ocrOk:false,ocrFails:0,manual:false,edited:false,alt:false,antec:'idle'});

/* ---------- cámara ---------- */
const Cam=(()=>{
  let stream=null,kind=null,busy=false;
  const stop=()=>{if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}};
  /* Luz y nitidez sobre la foto ya recortada (640 px de ancho). Umbrales calibrados con una foto borrosa real (≈70) y una sintética nítida (≈860);
     recalibrar con más cédulas reales. El valor se imprime en consola: window.__camq. */
  function quality(cv){const w=640,h=Math.round(cv.height*w/cv.width),c=document.createElement('canvas');c.width=w;c.height=h;
    const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(cv,0,0,w,h);const d=x.getImageData(0,0,w,h).data;
    const g=new Float32Array(w*h);let sum=0;for(let i=0;i<w*h;i++){g[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];sum+=g[i]}
    const mean=sum/(w*h);let s=0,s2=0,n=0;
    for(let y=1;y<h-1;y++)for(let i=1;i<w-1;i++){const k=y*w+i,l=4*g[k]-g[k-1]-g[k+1]-g[k-w]-g[k+w];s+=l;s2+=l*l;n++}
    const v=s2/n-(s/n)*(s/n);window.__camq={mean,sharp:v};return{mean,sharp:v}}
  const MIN_SHARP=()=>kind==='selfie'?30:80;
  function verdict(q){if(q.mean<45)return'Muy oscura. Busca más luz.';if(q.mean>225)return'Demasiada luz o reflejo. Cambia el ángulo.';if(q.sharp<MIN_SHARP())return kind==='selfie'?'Salió borrosa. Sostén firme el teléfono.':'Salió borrosa. Acerca la cédula, espera a que enfoque y sostén firme.';return null}
  async function open(k){kind=k;const selfie=k==='selfie';
    const body=`<div class="camwrap"><video id="camv" playsinline muted autoplay></video><span class="camguide ${selfie?'oval':''}"></span>
      <p class="camhint">${selfie?'Centra tu cara. Sin casco, gorra ni gafas oscuras.':'Llena el recuadro con la cédula, con buena luz y sin reflejos. Espera a que enfoque.'}</p></div>
      <div class="camfoot"><button class="btn ghost sm" data-act="camCancel">Cancelar</button>${selfie?'':'<button class="btn ghost sm" data-act="gal" data-k="'+k+'">Galería</button>'}<button class="btn" data-act="camShot" id="camshot">Tomar foto</button></div>`;
    openLayer(`<div class="camfull" role="dialog" aria-label="${selfie?'Tomar selfie':'Tomar foto de la cédula'}">${body}</div>`);
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return fallback('Tu navegador no deja usar la cámara aquí. Sube una foto.');
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:selfie?'user':{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
      const v=$('#camv');if(!v){stop();return}v.srcObject=stream;await v.play().catch(()=>{});
      /* Enfoque continuo y exposición automática donde el navegador lo permita (Chrome Android). */
      try{const t=stream.getVideoTracks()[0],c=t.getCapabilities?t.getCapabilities():{};const adv=[];
        if(c.focusMode&&c.focusMode.includes('continuous'))adv.push({focusMode:'continuous'});
        if(c.exposureMode&&c.exposureMode.includes('continuous'))adv.push({exposureMode:'continuous'});
        if(adv.length)await t.applyConstraints({advanced:adv})}catch(e){}}
    catch(e){fallback(e&&e.name==='NotAllowedError'?'No diste permiso a la cámara. Actívalo en el candado del navegador o sube una foto.':'No encontramos una cámara disponible. Sube una foto.')}}
  function fallback(msg){const h=$('.camwrap');if(!h)return;h.innerHTML=`<div class="camerr">${I('cam',34)}<p>${esc(msg)}</p></div>`;
    const f=$('.camfoot');f.innerHTML=`<button class="btn ghost sm" data-act="camCancel">Cancelar</button><label class="btn upl">${kind==='selfie'?'Tomar foto':'Cámara'}<input type="file" accept="image/*" ${kind==='selfie'?'capture="user"':'capture="environment"'} id="camfile" hidden></label>${kind==='selfie'?'':'<label class="btn ghost upl">Galería<input type="file" accept="image/*" id="galfile" hidden></label>'}`;
    $('#camfile').addEventListener('change',e=>{const file=e.target.files[0];if(file)fromFile(file)});
    const g=$('#galfile');if(g)g.addEventListener('change',e=>{const file=e.target.files[0];if(file)fromFile(file)})}
  async function fromFile(file){const bmp=await createImageBitmap(file).catch(()=>null);if(!bmp)return done(null,'No pudimos abrir esa imagen. Usa una foto JPG o PNG.');
    const cv=document.createElement('canvas');const r=Math.min(1,1600/Math.max(bmp.width,bmp.height));cv.width=Math.round(bmp.width*r);cv.height=Math.round(bmp.height*r);cv.getContext('2d').drawImage(bmp,0,0,cv.width,cv.height);finish(cv)}
  /* Galería: solo para la cédula. La selfie siempre se toma en el momento para confirmar que eres tú. */
  function pick(k){if(k==='selfie')return;kind=k;const i=document.createElement('input');i.type='file';i.accept='image/*';i.style.display='none';document.body.appendChild(i);
    i.addEventListener('change',()=>{const f=i.files&&i.files[0];i.remove();if(f)fromFile(f)});i.addEventListener('cancel',()=>i.remove());i.click()}
  /* Recorta el fotograma al recuadro guía (la cédula ocupa más píxeles útiles) y deja 5 % de margen. */
  function frame(v){const vw=v.videoWidth,vh=v.videoHeight,wrap=$('.camwrap').getBoundingClientRect(),g=$('.camguide').getBoundingClientRect();
    let sx=0,sy=0,sw=vw,sh=vh;
    if(kind!=='selfie'&&wrap.width&&g.width){const sc=Math.max(wrap.width/vw,wrap.height/vh),ox=(vw*sc-wrap.width)/2,oy=(vh*sc-wrap.height)/2,pad=.05;
      const gx=(g.left-wrap.left+ox)/sc,gy=(g.top-wrap.top+oy)/sc,gw=g.width/sc,gh=g.height/sc;
      sx=Math.max(0,gx-gw*pad);sy=Math.max(0,gy-gh*pad);sw=Math.min(vw-sx,gw*(1+2*pad));sh=Math.min(vh-sy,gh*(1+2*pad))}
    const cv=document.createElement('canvas');cv.width=Math.round(sw);cv.height=Math.round(sh);const x=cv.getContext('2d');
    if(kind==='selfie'){x.translate(cv.width,0);x.scale(-1,1)}x.drawImage(v,sx,sy,sw,sh,0,0,cv.width,cv.height);return cv}
  /* Ráfaga: 5 fotogramas separados 130 ms; se queda con el más nítido. Así la mano temblando o el enfoque tardío pesan menos. */
  async function shot(){const v=$('#camv');if(!v||!v.videoWidth||busy)return;busy=true;const bt=$('#camshot');if(bt){bt.disabled=true;bt.textContent='Sostén firme…'}
    let best=null,bq=-1;for(let i=0;i<5;i++){const cv=frame(v),q=quality(cv);if(q.sharp>bq){bq=q.sharp;best=cv}await new Promise(r=>setTimeout(r,130))}
    busy=false;finish(best)}
  function finish(cv){const q=quality(cv),bad=window.__CAM_NOQ?null:verdict(q);if(bad)return done(null,bad);
    cv.toBlob(b=>done(b,null),'image/jpeg',.92)}
  function done(blob,err){const k=kind;stop();closeLayer();const K=S.kyc;
    if(err){K[k]='error';K.msg=err;return render()}
    K[k]='loading';render();
    RodAPI.uploadKyc(k,blob).then(async()=>{
      if(k==='front'){const o=await Ocr.read(blob);
        if(o&&o.numero){K.ocr=o;K.ocrOk=!!o.ok;K.cedula=o.numero;K.nombre=o.nombre||K.nombre||'';K.edited=false;K.front='ok'}
        else{K.ocrFails=(K.ocrFails||0)+1;K.front='error';K.msg=K.ocrFails>=2?'No pudimos leerla. Puedes escribir tus datos; una persona los revisará.':'No pudimos leer tu cédula. Busca más luz, sin reflejos, y encaja todo el documento.';if(K.ocrFails>=2){K.manual=true;K.ocrOk=false}}
        return render()}
      later(()=>{K[k]='ok';render()},500)}).catch(e=>{console.error('uploadKyc',e);K[k]='error';K.msg=e&&/\(\d{3}\)/.test(e.message||'')?'No pudimos guardar la foto: '+String(e.message).slice(0,80):'No pudimos subir la foto. Revisa tu conexión.';render()})}
  return{open,stop,shot,pick,cancel:()=>{stop();closeLayer()}}})();
const _closeLayer=closeLayer;closeLayer=function(){Cam.stop();_closeLayer()};

/* ---------- pantallas ---------- */
SCR.consent=()=>{const c=S.consent,e=S.errs;
  const row=(k,t,d,req)=>`<button class="opt ${e[k]?'err':''}" role="switch" aria-checked="${c[k]}" data-act="consentTgl" data-k="${k}"><span><b>${t}${req?'':' <span class="small">(opcional)</span>'}</b><span class="d">${d}</span></span><span class="rad" style="border-radius:8px">${c[k]?I('check',13,3.5):''}</span></button>`;
  return `<div class="scr light">${hdr('','reg')}<div class="body">${prog(2,'Permisos')}<h1 class="t">Tus datos, tus reglas</h1>
  <p class="lead">RodApp trata datos sensibles. Cada permiso se acepta por separado y puedes retirarlo cuando quieras.</p>
  <div class="cards" style="gap:10px">
  ${row('ident','Foto de cédula y selfie','Para confirmar que eres tú. Leemos tu nombre y número y guardamos esos datos y las fotos mientras tengas cuenta, para atender incidentes de seguridad (plazo por validar con abogado). La selfie es un dato biométrico: si prefieres no darla, elige la verificación manual.',1)}
  ${row('antec','Consulta de antecedentes judiciales','Revisamos tu cédula con la Policía Nacional para cuidar al grupo. Guardamos solo el resultado, no el detalle.',1)}
  ${row('ubic','Ubicación durante rodadas','Solo mientras la rodada está activa y solo con tu grupo. Se apaga al terminar.',0)}</div>
  <span class="msg" style="display:${e.consent?'block':'none'};color:var(--err)">Acepta los dos permisos obligatorios para continuar, con selfie o con verificación manual.</span>
  <div class="banner info">${I('shield',20)}<span>Responsable: RodApp (razón social y NIT por definir). Tienes derecho a conocer, corregir y suprimir tus datos. Política de tratamiento: pendiente de publicar.</span></div>
  <button class="btn link" style="min-height:44px;justify-content:flex-start;padding:0" data-act="kycAlt">No quiero dar la selfie: verificación manual</button></div>
  <div class="foot"><button class="btn" data-act="consentNext">Aceptar y continuar</button></div></div>`};

const galBtn=k=>{const st=S.kyc[k];return st==='loading'||st==='ok'?'':`<button class="btn link" style="min-height:40px;justify-content:center;margin-top:-4px" data-act="gal" data-k="${k}">${I('img',16)} O súbela desde la galería</button>`};
SCR.kyc=()=>{const k=S.kyc,e=S.errs;
  if(k.step===0){const ok=k.front==='ok'&&k.back==='ok';
    return `<div class="scr light">${hdr('','consent')}<div class="body">${prog(3,'Identidad')}<h1 class="t">Verifica tu cédula</h1><p class="lead">Validamos que eres tú para cuidar al grupo. No mostramos tu cédula a nadie.</p>
    ${tile('front')}${galBtn('front')}${tile('back')}${galBtn('back')}
    ${(ok||k.manual&&k.back==='ok')?`<div class="gcard" role="group" aria-label="Revisa tus datos"><b>${k.ocrOk&&!k.manual?'Leímos esto de tu cédula. Revísalo.':'Escribe tus datos como aparecen en la cédula.'}</b>
     <div class="field ${e.nombre?'err':''}"><label for="k_n">Nombre completo</label><input id="k_n" autocomplete="off" data-bind="kyc.nombre" data-k="nombre" value="${esc(k.nombre)}" ${e.nombre?'aria-invalid="true" aria-describedby="m_n"':''}><span class="msg" id="m_n">Escribe nombres y apellidos.</span></div>
     <div class="field ${e.cedula?'err':''}"><label for="k_c">Número de cédula</label><input id="k_c" inputmode="numeric" autocomplete="off" maxlength="10" data-bind="kyc.cedula" data-k="cedula" data-num="1" value="${esc(k.cedula)}" ${e.cedula?'aria-invalid="true" aria-describedby="m_c"':''}><span class="msg" id="m_c">Escribe entre 6 y 10 números, sin puntos.</span></div>
     <span class="small">Si cambias algo de lo que leímos, una persona del equipo revisa tu cuenta antes de aprobarla.</span></div>`:''}
    <div class="banner info">${I('shield',20)}<span>Guardamos tu nombre, tu cédula y las fotos para atender incidentes de seguridad. Solo el equipo autorizado puede verlos.</span></div></div>
    <div class="foot"><button class="btn" data-act="kycNext" ${(ok||k.manual&&k.back==='ok')?'':'disabled'}>Continuar</button></div></div>`}
  if(k.alt)return SCR.antec();
  const st=k.selfie,col=st==='ok'?'#2FD98D':'#9DB0A6';
  return `<div class="scr light">${hdr('','@kycBack')}<div class="body">${prog(3,'Identidad')}<h1 class="t">Ahora, una selfie</h1><p class="lead">Centra tu cara en el óvalo. Sin casco, gorra ni gafas oscuras.</p>
  <button class="selfie" data-act="cap" data-k="selfie" ${st==='loading'?'disabled':''} aria-label="Tomar selfie">
   <svg width="236" height="300" viewBox="0 0 236 300" fill="none"><ellipse cx="118" cy="150" rx="80" ry="108" stroke="${col}" stroke-width="4" ${st==='ok'?'':'stroke-dasharray="10 9"'}/><circle cx="118" cy="125" r="30" fill="#1D2B24"/><path d="M62 232c8-34 30-46 56-46s48 12 56 46" fill="#1D2B24"/></svg>
   ${st==='loading'?'<span class="scan"></span>':''}${st==='ok'?`<span class="okc pop" style="position:absolute;bottom:20px">${I('check',22,3)}</span>`:''}
   ${st==='idle'||st==='error'?`<span style="position:absolute;bottom:14px;color:#CFE0D6;font-size:14px;padding:0 12px;text-align:center">${st==='error'?esc(k.msg):'Toca para abrir la cámara'}</span>`:''}</button>
  <p class="small" style="text-align:center;margin:0">${st==='loading'?'Validando tu rostro…':st==='ok'?'Rostro validado':'Busca buena luz y mira de frente.'}</p></div>
  <div class="foot"><button class="btn" data-act="kycNext" ${st==='ok'?'':'disabled'}>Continuar</button></div></div>`};

SCR.antec=()=>{const k=S.kyc,st=k.antec;
  const alt=k.alt;
  const body=st==='idle'?`<div class="banner info">${I('shield',20)}<span>${alt?'Sin selfie, una persona del equipo revisa tu cédula. Tarda hasta 48 horas y mientras tanto puedes ver rodadas y comunidad.':'Consultamos a la Policía Nacional con tu cédula. Tarda unos segundos.'}</span></div>`
  :st==='loading'?`<div class="empty" style="padding:30px 10px"><svg class="spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#12B76A" stroke-width="3" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg><p class="lead" role="status">Consultando antecedentes…</p></div>`
  :st==='manual'?`<div class="banner ok" role="status">${I('check',20,3)}<span><b>Recibimos tu solicitud.</b> Una persona revisa tu cédula en máximo 48 horas. Mientras tanto puedes ver rodadas y comunidad.</span></div>`
  :st==='clear'?(S.verStatus==='review'?`<div class="banner ok" role="status">${I('check',20,3)}<span><b>Sin asuntos pendientes con las autoridades judiciales.</b> Una persona confirma tus datos de la cédula antes de aprobar tu cuenta, en máximo 48 horas. Mientras tanto puedes ver rodadas y comunidad.</span></div>`:`<div class="banner ok" role="status">${I('check',20,3)}<span><b>Sin asuntos pendientes con las autoridades judiciales.</b> Tu cuenta queda verificada.</span></div>`)
  :st==='flag'?`<div class="banner" style="background:rgba(255,149,0,.16);color:#FFC76B" role="status">${I('warn',20)}<span><b>Tu verificación necesita revisión de una persona.</b> Mientras tanto puedes ver rodadas y comunidad, pero no unirte ni crear. Respondemos en máximo 48 horas. Si crees que hay un error, tienes derecho a pedir que se corrija ante la Policía Nacional y a escribirnos.</span></div>`
  :`<div class="banner err" role="alert">${I('warn',20)}<span><b>No pudimos consultar ahora.</b> Reintenta o continúa: quedarás pendiente de verificación hasta que se complete.</span></div>`;
  const foot=st==='idle'?`<button class="btn" data-act="antecRun">${alt?'Enviar a revisión':'Consultar antecedentes'}</button>`
   :st==='loading'?`<button class="btn" disabled>Consultando…</button>`
   :st==='error'?`<button class="btn" data-act="antecRun">Reintentar</button><button class="btn ghost" data-act="antecSkip">Continuar pendiente</button>`
   :`<button class="btn" data-act="antecNext">Continuar</button>`;
  return `<div class="scr light">${hdr('',alt?'@kycBack':'@kycBack')}<div class="body">${prog(3,'Antecedentes')}<h1 class="t">Antecedentes judiciales</h1><p class="lead">Es el mismo certificado gratuito que expide la Policía Nacional.</p>${body}</div><div class="foot">${foot}</div></div>`};

/* ---------- acciones ---------- */
Object.assign(ACT,{
  consentTgl:d=>{S.consent[d.k]=!S.consent[d.k];delete S.errs.consent;render()},
  consentNext:()=>{const c=S.consent;if(!c.ident||!c.antec){S.errs={consent:1};return render()}S.errs={};S.kyc.alt=false;S.kyc.step=0;go('kyc')},
  kycAlt:()=>{const c=S.consent;if(!c.ident||!c.antec){S.errs={consent:1};return render()}S.errs={};S.kyc.alt=true;S.kyc.step=0;toast('Verificación manual elegida');go('kyc')},
  cap:d=>{const K=S.kyc;if(K[d.k]==='loading'||K[d.k]==='ok')return;Cam.open(d.k)},
  gal:d=>{const K=S.kyc;if(K[d.k]==='loading'||K[d.k]==='ok')return;Cam.pick(d.k)},
  camShot:()=>Cam.shot(),camCancel:()=>Cam.cancel(),
  kycBack:()=>{if(S.kyc.alt||S.kyc.step===0){S.kyc.step=0;go('kyc')}else{S.kyc.step=0;render()}},
  kycNext:()=>{const K=S.kyc;if(K.step===0){const e={};if(String(K.nombre||'').trim().split(/\s+/).length<2)e.nombre=1;if(!/^\d{6,10}$/.test(K.cedula))e.cedula=1;if(Object.keys(e).length){S.errs=e;return render()}S.errs={};
      const n=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
      K.edited=!!(K.ocr&&(K.ocr.numero!==K.cedula||(K.ocr.nombre&&n(K.ocr.nombre)!==n(K.nombre))));
      S.user.legal=K.nombre.trim();
      if(K.alt){K.step=1;return render()}K.step=1;render()}
    else{K.antec='idle';go('antec')}},
  antecRun:async()=>{const K=S.kyc;if(K.alt){K.antec='manual';S.verStatus='review';return render()}K.antec='loading';render();
    try{await RodAPI.saveIdentity({nombre_legal:K.nombre.trim(),cedula:K.cedula,ocr_nombre:K.ocr?K.ocr.nombre:null,ocr_numero:K.ocr?K.ocr.numero:null,ocr_ok:!!K.ocrOk,editado:!!K.edited,alt:!!K.alt})}catch(e){K.antec='error';return render()}
    const r=await RodAPI.antecedentes({cedula:K.cedula,consent:{antec:true,at:new Date().toISOString()}});
    K.antec=r.status;
    S.verStatus=r.status==='clear'?((RodAPI.cfg.revision==='auto'||(K.ocrOk&&!K.edited&&!K.manual))?'ok':'review'):r.status==='flag'?'review':'pending';
    if(r.status==='error'&&r.msg)console.warn('antecedentes:',r.msg),toast('No se pudo verificar: '+r.msg.slice(0,90));
    try{const p=await RodAPI.profile();if(p&&p.ver_status){S.verStatus=p.ver_status;S.verified=p.ver_status==='ok'}}catch(e){}
    render()},
  antecSkip:()=>{S.verStatus='pending';go('veh')},
  antecNext:()=>go('veh'),
  vehBack:()=>{S.kyc.step=S.kyc.alt?0:1;go('kyc')}
});
/* El paso 'antec' como pantalla propia (se llega desde la selfie) y desde la ruta manual. */
const _kycNext=ACT.kycNext;
ACT.kycNext=()=>{const K=S.kyc;if(K.step===1&&K.alt){K.antec='idle';return go('antec')}_kycNext()};

/* Cuenta nueva = todo en cero: sin XP, rodadas, insignias, club, Premium ni calificación. La cuenta de demostración
   (camilo@rodapp.co) conserva datos de ejemplo para enseñar la app llena. */
function newAccount(){Object.assign(S,{xp:0,rodadas:0,badges:[],award:null,rating:null,premium:false,club:null});
  S.clubs=Object.assign(S.clubs,{sel:null,sim:null});S.com=Object.assign(S.com,{grupos:[],conf:{},liked:{},gusta:{}});
  S.rides.forEach(r=>{r.part=r.part.filter(n=>n!=='Tú')})}

/* Registro real: la cuenta se crea al validar el perfil (paso 1), porque las fotos y la consulta necesitan un usuario autenticado.
   Si el proyecto exige confirmar el correo, no hay sesión: se pide confirmar y volver a iniciar sesión. */
const _regNext=ACT.regNext;
ACT.regNext=async()=>{const r=S.reg,e={};if(r.nombre.trim().length<3)e.nombre=1;if(!/^\S+@\S+\.\S+$/.test(r.correo))e.correo=1;if(r.pass.length<6)e.pass=1;if(!r.exp)e.exp=1;
  if(Object.keys(e).length)return _regNext();
  try{await RodAPI.signUp(r.correo.trim(),r.pass,{nombre:r.nombre.trim(),exp:r.exp});
    if(RodAPI.live&&!RodAPI.session()){toast('Revisa tu correo para confirmar la cuenta y luego inicia sesión');return}}
  catch(err){console.error('signUp',err);const m=err&&err.message?String(err.message).slice(0,90):'';toast(err&&err.status===422?'Ese correo ya tiene cuenta. Inicia sesión.':'No pudimos crear tu cuenta'+(m?': '+m:'. Intenta de nuevo.')+(err&&err.status?' ('+err.status+')':''));return}
  newAccount();_regNext()};
const _consentNext=ACT.consentNext;
ACT.consentNext=async()=>{const c=S.consent;if(!c.ident||!c.antec)return _consentNext();
  try{await RodAPI.saveConsent(['ident','antec'].concat(c.ubic?['ubic']:[]),'2026-11-v0')}catch(e){toast('No pudimos guardar tu autorización. Intenta de nuevo.');return}
  _consentNext()};
const _login=ACT.login;
ACT.login=async()=>{if(!RodAPI.live)return _login();
  try{await RodAPI.signIn(S.login.email.trim(),S.login.pass);const p=await RodAPI.profile();
    newAccount();S.xp=p&&p.xp?p.xp:0;S.user={nombre:p?p.nombre:'Rodador',exp:p?p.exp:null};S.veh=Object.assign(S.veh,p?{cc:p.cc,marca:p.marca,placa:p.placa}:{});
    S.verStatus=p?p.ver_status:'pending';S.verified=S.verStatus==='ok';S.errs={};S.tourOffer=true;go('home')}
  catch(e){S.errs={login:1};render()}};
const _veh=ACT.vehNext;
ACT.vehNext=async()=>{const v=S.veh,e={};if(!v.cc)e.cc=1;if(!v.marca)e.marca=1;if(!/^[A-Z]{3}\d{2}[A-Z]$/.test(v.placa))e.placa=1;S.errs=e;if(Object.keys(e).length)return render();
  try{await RodAPI.saveProfile({id:RodAPI.session()&&RodAPI.session().user&&RodAPI.session().user.id,nombre:S.user.nombre,exp:S.user.exp,cc:v.cc,tipo:v.tipo,marca:v.marca,placa:v.placa})}
  catch(err){console.error('saveProfile',err);const m=err&&err.message?String(err.message).slice(0,80):'';toast('No pudimos guardar tu perfil'+(m?': '+m:'. Intenta de nuevo.')+(err&&err.status?' ('+err.status+')':''));return}
  S.verified=S.verStatus==='ok';go('done')};

/* Puerta de seguridad: sin verificación completa no se crea ni se une a rodadas. */
const gated=()=>S.verStatus==='review'||(S.verStatus==='pending'&&RodAPI.cfg.revision!=='auto');
const _go=ACT.go;ACT.go=d=>{if(d.to==='crear'&&gated())return toast('Tu verificación sigue en revisión');_go(d)};
const _join=ACT.join;ACT.join=()=>{if(gated())return toast('Tu verificación sigue en revisión');_join()};
const _joinAsk=ACT.joinAsk;ACT.joinAsk=()=>{if(gated()){return toast('Tu verificación sigue en revisión')}_joinAsk()};
document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.num)t.value=t.value.replace(/\D/g,'')},true);

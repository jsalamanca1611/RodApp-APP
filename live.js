'use strict';
/* RodApp · capa en vivo (Supabase). Solo actúa cuando hay backend configurado; en modo demo no hace nada.
   Qué vuelve real: rodadas publicadas, quién se une, "listo", inicio de la rodada, chat y ubicación entre teléfonos.
   Cómo: consultas REST cada pocos segundos (sondeo). Es más simple y tolerante a mala señal que un canal en vivo,
   y las reglas RLS de la base (supabase/migrations/002) hacen que solo los participantes verificados lean chat y posiciones.
   Costo del sondeo: ~1 consulta liviana cada 2–5 s por persona con la pantalla abierta. */
(()=>{
if(!RodAPI.live)return;
const uid=()=>RodAPI.uid(),rest=RodAPI.rest;
const SEL='/rides?select=*,ride_participants(user_id,nombre,xp,listo)';

/* ---------- estado inicial: sin rodadas ni personas de ejemplo ---------- */
/* Rodadas de ejemplo (sim:true, id negativo para no chocar con las de la base). Son locales: nadie más las ve. */
const EJ=RodAPI.cfg.rodadasEjemplo!==false;
const SIMS=EJ?seed().map(r=>Object.assign(r,{id:-r.id})):[];
if(EJ)S.com.posts.forEach(p=>{if(p.ride>0)p.ride=-p.ride});
const setRides=real=>{S.rides=real.concat(SIMS)};
setRides([]);S.login={email:'',pass:''};
const _fresh2=fresh;fresh=function(){_fresh2();S.login={email:'',pass:''};if(EJ){SIMS.forEach(r=>{SimBots.reset(r);r.part=r.part.filter(n=>n!=='Tú')});S.com.posts.forEach(p=>{if(p.ride>0)p.ride=-p.ride})}setRides([])};

/* ---------- conversión fila de base → rodada de la interfaz ---------- */
function toRide(row){const me=uid(),pp=(row.ride_participants||[]).slice().sort((a,b)=>(b.user_id===row.host)-(a.user_id===row.host));
  S.xpMap=S.xpMap||{};pp.forEach(p=>{if(p.user_id!==me)S.xpMap[p.nombre]=p.xp||0});
  const nm=p=>p.user_id===me?'Tú':p.nombre,mine=row.host===me;
  return{id:row.id,name:row.nombre,zona:row.zona,cc:row.cc,nivel:row.nivel,fecha:row.fecha||'',hora:row.hora||'',cupo:row.cupo,part:pp.map(nm),pp,
    punto:row.punto,km:row.km||0,rt:row.rt||0,host:mine?'Tú':(row.host_nombre||'Anfitrión'),hostId:row.host,club:mine?'Tu rodada':'Comunidad RodApp',ver:true,estado:row.estado}}
const pplOf=r=>r.pp.map(p=>({n:p.user_id===uid()?'Tú':p.nombre,st:(p.listo||p.user_id===r.hostId)?'ready':'conf',uid:p.user_id}));
const visible=r=>r.estado==='abierta'||r.part.includes('Tú');
const sigOf=rs=>rs.map(r=>r.id+':'+r.estado+':'+r.pp.map(p=>p.user_id).join(',')).join('|');

let sig='',busyR=false;
async function refreshRides(force){if(busyR&&!force)return;busyR=true;
  try{const rows=await rest(SEL+'&estado=neq.terminada&order=created_at.desc&limit=60');
    const list=rows.map(toRide).filter(visible),s=sigOf(list);
    const selId=S.sel&&S.sel.id;setRides(list);if(selId&&!S.sel.sim){const n=list.find(r=>r.id===selId);if(n)S.sel=n}
    if(s!==sig){sig=s;if(!force&&$('#layer').hidden&&(S.screen==='home'||S.screen==='detalle'||S.screen==='perfil'))render()}
    return true}
  catch(e){return false}finally{busyR=false}}

/* ---------- listas y detalle ---------- */
const _ah=AFTER.home;AFTER.home=()=>{_ah&&_ah();refreshRides();every(refreshRides,5000)};
const _ap=AFTER.perfil;AFTER.perfil=()=>{_ap&&_ap();refreshRides();every(refreshRides,8000)};
const _ad=AFTER.detalle;AFTER.detalle=()=>{_ad&&_ad();every(async()=>{const id=S.sel&&S.sel.id;await refreshRides();if(S.screen==='detalle'&&!S.rides.find(r=>r.id===id)){toast('Esa rodada ya no está disponible');go('home')}},4000)};

/* ---------- publicar, unirse, listo, iniciar, salir ---------- */
const msgErr=e=>e&&(e.status===403||e.code==='42501')?'Tu verificación aún no está aprobada':'No pudimos completar la acción. Intenta de nuevo.';
const _publish=ACT.publish;
ACT.publish=async()=>{const c=S.cr,e={};['nombre','cc','zona','fecha','hora','punto'].forEach(k=>{if(!c[k]||(k==='nombre'&&!c.nombre.trim()))e[k]=1});
  if(Object.keys(e).length)return _publish();
  const i=c.ruta==null?0:c.ruta;
  try{const row=await rest('/rides','POST',{nombre:c.nombre.trim(),zona:c.zona,cc:c.cc,nivel:c.nivel,fecha:c.fecha,hora:c.hora,cupo:c.cupo,punto:c.punto,km:RKM[i],rt:i,host:uid(),host_nombre:S.user.nombre},'return=representation');
    await refreshRides(true);S.sel=S.rides.find(r=>r.id===row[0].id)||toRide(Object.assign(row[0],{ride_participants:[]}));
    S.cr={nombre:'',ruta:null,cc:null,zona:null,nivel:'Intermedio',fecha:null,hora:null,cupo:8,punto:null};S.errs={};
    initLobby(true);toast('Rodada publicada');go('lobby')}
  catch(err){toast(msgErr(err))}};

const _joinSim=ACT.join;
ACT.join=async()=>{if(S.sel.sim)return _joinSim();if(gated())return toast('Tu verificación sigue en revisión');const r=S.sel;
  try{await rest('/ride_participants','POST',{ride_id:r.id,user_id:uid(),nombre:S.user.nombre,xp:S.xp},'return=minimal')}
  catch(err){if(err.code!=='23505'){closeLayer();if(/llena/.test(err.message||'')){toast('La rodada se llenó');await refreshRides(true);return render()}return toast(msgErr(err))}}
  closeLayer();await refreshRides(true);S.sel=S.rides.find(x=>x.id===r.id)||r;toast('Estás dentro de la rodada');initLobby(false);go('lobby')};

const _initSim=initLobby;
initLobby=function(host){if(S.sel.sim)return _initSim(host);const r=S.sel,mine=r.pp.find(p=>p.user_id===uid());
  S.lobby={host,ready:!!(mine&&mine.listo),started:r.estado==='en_ruta',ppl:pplOf(r),msgs:[],lastMsg:0,seen:new Set(),rid:r.id}};

const _readySim=ACT.ready;
ACT.ready=async()=>{if(S.sel.sim)return _readySim();const Lb=S.lobby;Lb.ready=!Lb.ready;const me=Lb.ppl.find(p=>p.n==='Tú');if(me)me.st=Lb.ready?'ready':'conf';
  refreshLobby();const b=$('#rbtn');if(b)b.textContent=Lb.ready?'Listo para salir · toca para cancelar':'Estoy listo para salir';
  try{await rest('/ride_participants?ride_id=eq.'+S.sel.id+'&user_id=eq.'+uid(),'PATCH',{listo:Lb.ready},'return=minimal')}catch(e){toast('No pudimos guardar tu estado')}};

ACT.hostStart=async()=>{if(S.sel.sim)return;try{await rest('/rides?id=eq.'+S.sel.id,'PATCH',{estado:'en_ruta'},'return=minimal')}catch(e){return toast('No pudimos iniciar la rodada')}
  S.lobby.started=true;go('enroute')};

const _leaveSim=ACT.leave;
ACT.leave=async()=>{const r=S.sel;if(r.sim){Live.stop();return _leaveSim()}
  try{if(r.host==='Tú')await rest('/rides?id=eq.'+r.id,'DELETE',null,'return=minimal');
    else{await rest('/ride_positions?ride_id=eq.'+r.id+'&user_id=eq.'+uid(),'DELETE',null,'return=minimal').catch(()=>{});await rest('/ride_participants?ride_id=eq.'+r.id+'&user_id=eq.'+uid(),'DELETE',null,'return=minimal')}}
  catch(e){return toast('No pudimos completar la acción. Intenta de nuevo.')}
  S.lobby=null;Live.stop();toast(r.host==='Tú'?'Rodada cancelada':'Saliste de la rodada');await refreshRides(true);go('home')};

const _end=ACT.end;ACT.end=()=>{const r=S.sel;if(r&&!r.sim&&r.host==='Tú')rest('/rides?id=eq.'+r.id,'PATCH',{estado:'terminada'},'return=minimal').catch(()=>{});_end()};
const _sendRate=ACT.sendRate;ACT.sendRate=()=>{const r=S.sel;_sendRate();if(r&&!r.sim&&r.host!=='Tú')rest('/ride_participants?ride_id=eq.'+r.id+'&user_id=eq.'+uid(),'DELETE',null,'return=minimal').catch(()=>{})};

/* ---------- sala de espera: personas, "listo", inicio y chat ---------- */
let busyL=false;
async function pollLobby(){const Lb=S.lobby;if(!Lb||S.screen!=='lobby'||busyL)return;busyL=true;
  try{const id=S.sel.id;
    const [rows,msgs]=await Promise.all([rest(SEL+'&id=eq.'+id),rest('/ride_messages?ride_id=eq.'+id+'&id=gt.'+Lb.lastMsg+'&order=id.asc&limit=100')]);
    if(S.screen!=='lobby'||S.lobby!==Lb)return;
    if(!rows.length){S.lobby=null;toast('El anfitrión canceló la rodada');await refreshRides(true);return go('home')}
    const r=toRide(rows[0]),mine=r.pp.find(p=>p.user_id===uid());
    if(!mine){S.lobby=null;toast('Ya no estás en esta rodada');await refreshRides(true);return go('home')}
    S.sel=r;S.rides=S.rides.map(x=>x.id===r.id?r:x);Lb.ppl=pplOf(r);Lb.ready=!!mine.listo;
    let fresh=false;msgs.forEach(m=>{Lb.lastMsg=Math.max(Lb.lastMsg,m.id);if(Lb.seen.has(m.id))return;Lb.seen.add(m.id);
      Lb.msgs.push(m.user_id===uid()?{me:1,t:m.texto}:{n:m.nombre,t:m.texto});fresh=true});
    if(r.estado==='en_ruta'&&!Lb.started){Lb.started=true;Lb.msgs.push({n:r.host,t:'Arrancamos. Todos al punto de encuentro.'});beep(740,.2);return render()}
    refreshLobby();if(fresh)refreshChat()}
  catch(e){}finally{busyL=false}}
const _afterSim=AFTER.lobby;
AFTER.lobby=()=>{if(S.sel.sim)return _afterSim();const Lb=S.lobby;
  $('#cform').addEventListener('submit',async e=>{e.preventDefault();const i=$('#cin'),t=i.value.trim().slice(0,500);if(!t)return;i.value='';
    const m={me:1,t};Lb.msgs.push(m);refreshChat();
    try{const row=await rest('/ride_messages','POST',{ride_id:S.sel.id,nombre:S.user.nombre,texto:t},'return=representation');Lb.seen.add(row[0].id)}
    catch(err){Lb.msgs.splice(Lb.msgs.indexOf(m),1);refreshChat();toast('No se envió el mensaje')}});
  pollLobby();every(pollLobby,2000)};

/* ---------- ubicación en vivo: la última posición de cada participante ---------- */
let busyP=false,busyF=false,warned=false;
async function sendPos(){const m=Live.me;if(!m||Live.simMe||busyP)return;busyP=true;
  try{await rest('/ride_positions?on_conflict=ride_id,user_id','POST',{ride_id:Live.rideId(),user_id:uid(),nombre:S.user.nombre,lat:m[0],lng:m[1],
      speed:m[4]==null?null:m[4],heading:m[3]==null||isNaN(m[3])?null:m[3]},'resolution=merge-duplicates,return=minimal')}
  catch(e){if(!warned){warned=true;toast('No pudimos compartir tu ubicación')}}finally{busyP=false}}
async function fetchPeers(){if(busyF)return;busyF=true;
  try{const rows=await rest('/ride_positions?ride_id=eq.'+Live.rideId()+'&select=user_id,nombre,lat,lng,speed,updated_at');
    const sk=RodAPI.serverNow()-Date.now(),peers={};
    rows.filter(x=>x.user_id!==uid()).forEach(x=>{peers[x.user_id]={n:x.nombre,ll:[x.lat,x.lng],t:Date.parse(x.updated_at)-sk,v:x.speed}});
    Live.peers=peers;MapKit.draw()}
  catch(e){}finally{busyF=false}}
Live.join=async function(){};                /* sin canal Realtime: se usa sondeo (solo rodadas reales) */
Live.push=function(){};                      /* el envío ocurre en tick, cada 2 s */
const _tickSim=Live.tick;
Live.tick=function(){if(S.sel&&S.sel.sim)return _tickSim.call(this);if(!this.sharing)return;sendPos();fetchPeers()};   /* rodadas reales: nunca compañeros simulados */
const _stop=Live.stop;Live.stop=function(){const was=this.sharing,id=this.rideId(),sim=S.sel&&S.sel.sim;_stop.call(this);warned=false;
  if(was&&id&&!sim)rest('/ride_positions?ride_id=eq.'+id+'&user_id=eq.'+uid(),'DELETE',null,'return=minimal').catch(()=>{})};

/* ---------- Modo Rodada real: alertas del grupo, rastreo vivo y fin de rodada ---------- */
const real=()=>S.sel&&!S.sel.sim;
window.__realAlert=()=>RodAPI.live&&real();
async function sendAlert(kind){const m=Live.me;
  try{await rest('/ride_alerts','POST',{ride_id:S.sel.id,nombre:S.user.nombre,kind,lat:m?m[0]:null,lng:m?m[1]:null},'return=minimal');
    if(kind!=='cancel'){const h=$('#alh'),p=$('#alp'),n=Math.max(0,S.sel.part.length-1);if(h)h.textContent='Alerta entregada';if(p)p.textContent='Llegó a '+n+(n===1?' compañero':' compañeros')+'. Se cierra sola en unos segundos.'}}
  catch(e){const h=$('#alh'),p=$('#alp');if(h)h.textContent='No se pudo enviar';if(p)p.textContent='Revisa tu conexión y vuelve a tocar.'}}
const _alert=ACT.alert;ACT.alert=d=>{_alert(d);if(real())sendAlert(d.k)};
const _cancelAlert=ACT.cancelAlert;ACT.cancelAlert=()=>{_cancelAlert();if(real())sendAlert('cancel')};
ACT.hudOk=()=>hideOv();

const _voice=voiceHTML;
voiceHTML=function(){if(!real())return _voice();const R=S.run;
  return R.mic?`<span class="mi">${I('mic',24)}</span><span><b>Avisos por voz activos</b><small>Escucharás las alertas de tu grupo</small></span><span class="bars"><i></i><i></i><i></i><i></i></span>`
    :`<span class="mi">${I('micoff',24)}</span><span><b>Avisos por voz en silencio</b><small>Toca para volver a escucharlos</small></span>`};

const _hudSim=SCR.hud,_hudAfterSim=AFTER.hud;
SCR.hud=()=>{if(!real())return _hudSim();const R=S.run;
  return `<div class="scr dark">
 <div class="hudtop"><span class="live"><i></i>EN VIVO · <span id="hclock">00:00:00</span></span><span class="small" id="hspd" style="font-weight:700;color:#fff">0 km/h</span></div>
 <div class="hudmap"><div id="hchip"></div><div id="hgrp" style="position:absolute;inset:0;overflow:auto;padding:62px 12px 12px;display:flex;flex-direction:column;gap:8px"></div></div>
 <button class="voice ${R.mic?'':'off'}" data-act="mute" id="hvoice" aria-pressed="${R.mic}"></button>
 <div class="alerts">
  <button class="ab red" data-act="alert" data-k="peligro">${I('warn',48,2.2)}<span>PELIGRO / CAÍDA<small>Avisa y comparte tu ubicación</small></span></button>
  <button class="ab org" data-act="alert" data-k="parada">${I('wrench',38,2.2)}<span>PARADA TÉCNICA</span></button>
  <button class="ab blu" data-act="alert" data-k="gasolina">${I('fuel',38,2.2)}<span>GASOLINA / DESCANSO</span></button>
 </div>
 <div class="endrow"><button data-act="endAsk">${S.sel.host==='Tú'?'Finalizar rodada':'Salir de la rodada'}</button></div></div>`};

function groupHTML(){const me=Live.me,now=Date.now();
  if(!Live.sharing)return `<div class="fact" style="background:rgba(255,255,255,.06);color:#fff"><b>Activa tu ubicación</b><span style="color:#BFD0C7">Así tu grupo te ve y tú ves si alguien se queda atrás.</span></div><button class="btn sm" data-act="locAllow">Compartir mi ubicación</button>`;
  return (S.sel.pp||[]).filter(p=>p.user_id!==uid()).map(p=>{const q=Live.peers[p.user_id],a=q?now-q.t:null,d=q&&me?hav(me,q.ll):null;
    const st=!q?'Sin ubicación':a>LOST_MS?'Sin señal':a>STALE_MS?'Señal débil':'En vivo',cl=!q||a>LOST_MS?'#FF9500':'#2FD98D';
    return `<div style="display:flex;align-items:center;gap:12px;color:#fff">${av(p.nombre)}<span style="flex:1;min-width:0"><b style="display:block;font-size:16px">${esc(p.nombre)}</b><span style="color:#BFD0C7;font-size:13px">${d==null?'—':'a '+fmtD(d)}</span></span><b style="color:${cl};font-size:13px">${st}</b></div>`}).join('')||'<p class="small" style="color:#BFD0C7">Vas solo en esta rodada.</p>'}
function lagChip(){if(!Live.sharing||!Live.me)return null;const now=Date.now();
  const out=(S.sel.pp||[]).filter(p=>p.user_id!==uid()).map(p=>{const q=Live.peers[p.user_id];return q?{n:p.nombre,d:hav(Live.me,q.ll),a:now-q.t}:null}).filter(x=>x&&(x.a>LOST_MS||x.d>LAG_M));
  return out.length?{t:first(out[0].n)+' se quedó atrás'+(out[0].a>LOST_MS?': perdimos su señal.':'. Está a '+fmtD(out[0].d)+'.'),ic:'warn'}:null}

function incoming(a){const R=S.run,A=ALERTS[a.kind];if(!R)return;
  if(a.kind==='cancel'){R.banner={t:first(a.nombre)+' canceló su alerta: falsa alarma.',g:1,color:'#2FD98D',ic:'check',until:Date.now()+5000};hideOv();beep(520,.12);return}
  if(!A)return;const d=a.lat!=null&&Live.me?hav(Live.me,[a.lat,a.lng]):null;
  R.alerts.push({k:a.kind,t:Date.now(),from:a.nombre});
  R.banner={t:first(a.nombre)+' · '+A.t+(d!=null?' · a '+fmtD(d):''),ic:A.ic,color:A.k,dk:A.kt,until:Date.now()+9000};
  beep(a.kind==='peligro'?1000:760,.3);buzz();if(R.mic)say(first(a.nombre)+': '+A.say);
  const o=$('#ov');o.hidden=false;o.innerHTML=`<div class="ovl" style="--k:${A.k};--kt:${A.kt}" role="alertdialog" aria-live="assertive"><div class="big"><span style="display:grid;place-items:center">${I(A.ic,110,2.2)}</span></div>
    <h2>${A.t}</h2><p><b>${esc(a.nombre)}</b> avisa al grupo${d!=null?' · a '+fmtD(d)+' de ti':''}</p><button class="cancel" data-act="hudOk">Entendido</button></div>`;
  clearTimeout(incoming.t);incoming.t=setTimeout(hideOv,5000)}
async function pollAlerts(){const R=S.run;if(!R||S.screen!=='hud'||R._pa)return;R._pa=1;
  try{const id=S.sel.id;
    if(R.lastAlert==null){const r=await rest('/ride_alerts?ride_id=eq.'+id+'&select=id&order=id.desc&limit=1');R.lastAlert=r.length?r[0].id:0;return}
    const rows=await rest('/ride_alerts?ride_id=eq.'+id+'&id=gt.'+R.lastAlert+'&order=id.asc&limit=20');
    rows.forEach(a=>{R.lastAlert=Math.max(R.lastAlert,a.id);if(a.user_id!==uid())incoming(a)})}
  catch(e){}finally{R._pa=0}}
async function pollEnd(){if(S.screen!=='hud')return;
  try{const r=await rest('/rides?id=eq.'+S.sel.id+'&select=estado');if(r[0]&&r[0].estado==='terminada'&&S.screen==='hud'){closeLayer();hideOv();toast('La rodada terminó');awardRide();go('resumen')}}catch(e){}}

AFTER.hud=()=>{if(!real())return _hudAfterSim();clearST();
  if(!S.run)startRun();const R=S.run;R.incomingDone=true;R._v=0;const v=$('#hvoice');v.innerHTML=voiceHTML();
  if(!Live.sharing&&S.consent.ubic)Live.start();
  const tick=()=>{if(S.screen!=='hud'||!S.run)return;const el=Math.floor((Date.now()-R.t0)/1000),c=$('#hclock');if(!c)return;c.textContent=fmtT(el);
    $('#hspd').textContent=(Live.me&&Live.me[4]!=null?Math.round(Live.me[4]):0)+' km/h';
    const g=$('#hgrp'),h=groupHTML();if(g&&g.dataset.h!==h){g.innerHTML=h;g.dataset.h=h}
    const chip=R.banner&&Date.now()<R.banner.until?R.banner:lagChip(),ch=$('#hchip');
    if(ch){const html=chip?`<div class="chipf ${chip.g?'g':''}" style="${chip.color?'background:'+chip.color+';color:'+(chip.dk||'#10151A'):''}">${I(chip.ic||'warn',20)}<span>${esc(chip.t)}</span></div>`:'';if(ch.dataset.h!==html){ch.innerHTML=html;ch.dataset.h=html}}};
  every(tick,500);every(()=>Live.tick(),2000);every(pollAlerts,1000);every(pollEnd,3000);pollAlerts();tick()};

/* ---------- camino al punto: distancia real desde el GPS ---------- */
const _enSim=AFTER.enroute;
AFTER.enroute=()=>{if(!real())return _enSim();
  const p0=SPOT_LL[SPOTS.indexOf(S.sel.punto)]||SPOT_LL[0],ed=$('#edist'),et=$('#eeta');ed.textContent='—';et.textContent='Buscando tu ubicación…';
  if(!navigator.geolocation){et.textContent='Tu dispositivo no permite ubicación';return}
  const w=navigator.geolocation.watchPosition(p=>{if(S.screen!=='enroute'){navigator.geolocation.clearWatch(w);return}
      const d=hav([p.coords.latitude,p.coords.longitude],p0),e=$('#edist'),t=$('#eeta');if(!e)return;
      if(d<80){e.textContent='Llegaste';t.textContent='Estás en el punto de encuentro'}else{e.textContent=fmtD(d);t.textContent=Math.max(1,Math.round(d/1000/25*60))+' min a tu destino'}},
    err=>{const t=$('#eeta');if(t)t.textContent='Activa el permiso de ubicación para ver la distancia'},{enableHighAccuracy:true,maximumAge:3000,timeout:15000})};
})();

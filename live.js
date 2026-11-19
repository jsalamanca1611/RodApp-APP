'use strict';
/* RodApp · capa en vivo (Supabase). Solo actúa cuando hay backend configurado; en modo demo no hace nada.
   Qué vuelve real: rodadas publicadas, quién se une, "listo", inicio de la rodada, chat y ubicación entre teléfonos.
   Cómo: consultas REST cada pocos segundos (sondeo). Es más simple y tolerante a mala señal que un canal en vivo,
   y las reglas RLS de la base (supabase/migrations/002) hacen que solo los participantes verificados lean chat y posiciones.
   Costo del sondeo: ~1 consulta liviana cada 2–5 s por persona con la pantalla abierta. */
(()=>{
if(!RodAPI.live)return;
const uid=()=>RodAPI.uid(),rest=RodAPI.rest;
let SEL='/rides?select=*,ride_participants(user_id,nombre,xp,listo,joined_at)';
const SEL0='/rides?select=*,ride_participants(user_id,nombre,xp,listo)';

/* ---------- estado inicial: sin rodadas ni personas de ejemplo ---------- */
/* Rodadas de ejemplo (sim:true, id negativo para no chocar con las de la base). Son locales: nadie más las ve. */
const EJ=RodAPI.cfg.rodadasEjemplo!==false;
/* Una sola rodada de demostración (compañeros simulados) para enseñar la app; el resto son reales. */
const SIMS=(EJ?seed():seed().slice(0,1)).map(r=>Object.assign(r,{id:-r.id}));
SIMS[0].name='RodApp prueba';SIMS[0].club='Demostración';SIMS[0].cupo=10;
S.com.posts.forEach(p=>{if(!EJ)p.ride=0;else if(p.ride>0)p.ride=-p.ride});   /* sin ejemplos, las publicaciones no enlazan rodadas (sus ids ya no existen) */
const setRides=real=>{const d=real.filter(r=>r.demo),o=real.filter(r=>!r.demo);S.rides=(d.length?d:SIMS.slice(0,1)).concat(o,SIMS.slice(1))};   /* la prueba real va primero; si la base aún no la tiene, la local */
setRides([]);S.login={email:'',pass:''};
const _fresh2=fresh;fresh=function(){_fresh2();S.login={email:'',pass:''};{SIMS.forEach(r=>{SimBots.reset(r);r.part=r.part.filter(n=>n!=='Tú')});if(EJ)S.com.posts.forEach(p=>{if(p.ride>0)p.ride=-p.ride})}S.com.posts.forEach(p=>{if(!EJ)p.ride=0});setRides([])};

/* ---------- conversión fila de base → rodada de la interfaz ---------- */
function toRide(row){const me=uid();
  /* Rodada oficial: sin anfitrión. El líder es quien se unió primero; si sale, pasa al siguiente. */
  const byJoin=(a,b)=>String(a.joined_at||'').localeCompare(String(b.joined_at||''))||String(a.user_id).localeCompare(String(b.user_id));
  const sorted=(row.ride_participants||[]).slice().sort(byJoin);
  const leader=row.oficial?(sorted[0]||null):null,hostId=row.oficial?(leader?leader.user_id:null):row.host;
  const pp=sorted.slice().sort((a,b)=>(b.user_id===hostId)-(a.user_id===hostId));
  S.xpMap=S.xpMap||{};pp.forEach(p=>{if(p.user_id!==me)S.xpMap[p.nombre]=p.xp||0});
  const nm=p=>p.user_id===me?'Tú':p.nombre,mine=hostId===me&&hostId!=null;
  return{id:row.id,name:row.nombre,zona:row.zona,cc:row.cc,nivel:row.nivel,fecha:row.fecha||'',hora:row.hora||'',cupo:row.cupo,part:pp.map(nm),pp,
    punto:row.punto,km:row.km||0,rt:row.rt||0,host:mine?'Tú':(row.oficial?(leader?leader.nombre:'Equipo RodApp'):(row.host_nombre||'Anfitrión')),hostId,oficial:!!row.oficial,
    club:row.oficial?'Rodada oficial RodApp':(mine?'Tu rodada':'Comunidad RodApp'),ver:true,estado:row.estado,
    demo:!!row.oficial&&row.nombre==='RodApp prueba',cr:Array.isArray(row.ruta)&&row.ruta.length>1?row.ruta:null}}
const pplOf=r=>r.pp.map(p=>({n:p.user_id===uid()?'Tú':p.nombre,st:(p.listo||p.user_id===r.hostId)?'ready':'conf',uid:p.user_id}));
const visible=r=>r.estado==='abierta'||r.part.includes('Tú');
const sigOf=rs=>rs.map(r=>r.id+':'+r.estado+':'+r.pp.map(p=>p.user_id).join(',')).join('|');

/* Las rodadas oficiales se siembran desde la base (función sembrar_rodadas, migración 006). Idempotente; se intenta al abrir y cada hora. */
let seeded=0,demoAt=0;async function sembrar(){if(Date.now()-demoAt>6e4){demoAt=Date.now();try{await rest('/rpc/asegurar_demo','POST',{})}catch(e){}}
  if(Date.now()-seeded<36e5)return;seeded=Date.now();try{await rest('/rpc/sembrar_rodadas','POST',{})}catch(e){}}
let sig='',busyR=false;
async function refreshRides(force){if(busyR&&!force)return;busyR=true;
  try{await sembrar();let rows;try{rows=await rest(SEL+'&estado=neq.terminada&order=created_at.desc&limit=60')}catch(e){if(e&&e.status===400&&SEL!==SEL0){SEL=SEL0;rows=await rest(SEL+'&estado=neq.terminada&order=created_at.desc&limit=60')}else throw e}
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
/* Si la base rechaza por verificación (403), se reintenta la verificación del piloto una vez: sirve a cuentas que quedaron "pendientes" por un fallo de red al registrarse. */
async function reverify(){try{await RodAPI.antecedentes({cedula:''})}catch(e){}
  try{const p=await RodAPI.profile();if(p){S.verStatus=p.ver_status;S.verified=p.ver_status==='ok'}}catch(e){}
  return S.verStatus==='ok'}
const is403=e=>e&&(e.status===403||e.code==='42501');
const msgErr=e=>is403(e)?(S.verStatus==='review'?'Tu verificación está en revisión':S.verStatus==='pending'?'Falta completar tu verificación de identidad':'No pudimos confirmar tu verificación'):'No pudimos completar la acción. Intenta de nuevo.';
let _vr=0;
const _publish=ACT.publish;
ACT.publish=async()=>{const c=S.cr,e={};['nombre','cc','zona','fecha','hora','punto'].forEach(k=>{if(!c[k]||(k==='nombre'&&!c.nombre.trim()))e[k]=1});
  if(Object.keys(e).length)return _publish();
  const cu=c.custom,i=cu?0:(c.ruta==null?0:c.ruta);
  try{const row=await rest('/rides','POST',Object.assign({nombre:c.nombre.trim(),zona:c.zona,cc:c.cc,nivel:c.nivel,fecha:c.fecha,hora:c.hora,cupo:c.cupo,punto:c.punto,km:cu?cu.km:RKM[i],rt:i,host:uid(),host_nombre:S.user.nombre},cu?{ruta:cu.coords}:{}),'return=representation');
    await refreshRides(true);S.sel=S.rides.find(r=>r.id===row[0].id)||toRide(Object.assign(row[0],{ride_participants:[]}));
    S.cr={custom:null,nombre:'',ruta:null,cc:null,zona:null,nivel:'Intermedio',fecha:null,hora:null,cupo:8,punto:null};S.errs={};
    initLobby(true);toast('Rodada publicada');go('lobby')}
  catch(err){if(is403(err)&&!_vr){_vr=1;const okv=await reverify();_vr=0;if(okv)return ACT.publish()}toast(msgErr(err))}};

const _joinSim=ACT.join;
ACT.join=async()=>{if(S.sel.sim)return _joinSim();if(gated())return toast('Tu verificación sigue en revisión');const r=S.sel;
  try{await rest('/ride_participants','POST',{ride_id:r.id,user_id:uid(),nombre:S.user.nombre,xp:S.xp},'return=minimal')}
  catch(err){if(err.code!=='23505'){closeLayer();if(/llena/.test(err.message||'')){toast('La rodada se llenó');await refreshRides(true);return render()}if(is403(err)&&!_vr){_vr=1;const okv=await reverify();_vr=0;if(okv)return ACT.join()}return toast(msgErr(err))}}
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
  try{if(r.host==='Tú'&&!r.oficial)await rest('/rides?id=eq.'+r.id,'DELETE',null,'return=minimal');
    else{await rest('/ride_positions?ride_id=eq.'+r.id+'&user_id=eq.'+uid(),'DELETE',null,'return=minimal').catch(()=>{});await rest('/ride_participants?ride_id=eq.'+r.id+'&user_id=eq.'+uid(),'DELETE',null,'return=minimal')}}
  catch(e){return toast('No pudimos completar la acción. Intenta de nuevo.')}
  S.lobby=null;Live.stop();if(r.demo)rest('/rpc/asegurar_demo','POST',{}).catch(()=>{});toast(r.host==='Tú'&&!r.oficial?'Rodada cancelada':'Saliste de la rodada');await refreshRides(true);go('home')};

const _end=ACT.end;ACT.end=()=>{const r=S.sel;if(r&&!r.sim&&r.host==='Tú')rest('/rides?id=eq.'+r.id,'PATCH',{estado:'terminada'},'return=minimal').catch(()=>{});_end()};
const _sendRate=ACT.sendRate;ACT.sendRate=()=>{const r=S.sel;_sendRate();if(r&&!r.sim&&(r.host!=='Tú'||r.oficial))rest('/ride_participants?ride_id=eq.'+r.id+'&user_id=eq.'+uid(),'DELETE',null,'return=minimal').catch(()=>{})};

/* ---------- sala de espera: personas, "listo", inicio y chat ---------- */
let busyL=false;
async function pollLobby(){const Lb=S.lobby;if(!Lb||S.screen!=='lobby'||busyL)return;busyL=true;
  try{const id=S.sel.id;
    const [rows,msgs]=await Promise.all([rest(SEL+'&id=eq.'+id),rest('/ride_messages?ride_id=eq.'+id+'&id=gt.'+Lb.lastMsg+'&order=id.asc&limit=100')]);
    if(S.screen!=='lobby'||S.lobby!==Lb)return;
    if(!rows.length){S.lobby=null;toast('El anfitrión canceló la rodada');await refreshRides(true);return go('home')}
    const r=toRide(rows[0]),mine=r.pp.find(p=>p.user_id===uid());
    if(!mine){S.lobby=null;toast('Ya no estás en esta rodada');await refreshRides(true);return go('home')}
    Lb.fail=0;Lb.okAt=Date.now();const wasH=Lb.host;Lb.host=r.host==='Tú';S.sel=r;S.rides=S.rides.map(x=>x.id===r.id?r:x);Lb.ppl=pplOf(r);Lb.ready=!!mine.listo;
    let fresh=false;msgs.forEach(m=>{Lb.lastMsg=Math.max(Lb.lastMsg,m.id);if(Lb.seen.has(m.id))return;Lb.seen.add(m.id);
      Lb.msgs.push(m.user_id===uid()?{me:1,t:m.texto}:{n:m.nombre,t:m.texto});fresh=true});
    if(r.estado==='en_ruta'&&!Lb.started){Lb.started=true;Lb.msgs.push({n:r.host,t:'Arrancamos. Todos al punto de encuentro.'});beep(740,.2);return render()}
    if(wasH!==Lb.host&&!Lb.started)return render();
    refreshLobby();if(fresh)refreshChat()}
  catch(e){Lb.fail=(Lb.fail||0)+1;Lb.errc=e&&e.status?e.status:'sin red'}finally{busyL=false;const s=$('#lsync');if(s&&S.lobby===Lb)s.innerHTML=window.syncTxt?window.syncTxt():""}}
window.syncTxt=()=>{const Lb=S.lobby,r=S.sel;if(!Lb||!r)return '';
  if(r.sim)return '<span style="color:#B26A00">Rodada de demostración: los compañeros son simulados. Para probar con personas reales, únete a otra rodada.</span>';
  if(Lb.fail>=2)return '<span style="color:#C0392B">Sin conexión con la rodada ('+Lb.errc+'). Reintentando…</span>';
  return 'Rodada n.º '+r.id+' · '+(Lb.ppl||[]).length+' en la sala · conectada'};
const _afterSim=AFTER.lobby;
AFTER.lobby=()=>{if(S.sel.sim)return _afterSim();clearST();const Lb=S.lobby;
  $('#cform').addEventListener('submit',async e=>{e.preventDefault();const i=$('#cin'),t=i.value.trim().slice(0,500);if(!t)return;i.value='';
    const m={me:1,t};Lb.msgs.push(m);refreshChat();
    try{const row=await rest('/ride_messages','POST',{ride_id:S.sel.id,nombre:S.user.nombre,texto:t},'return=representation');Lb.seen.add(row[0].id)}
    catch(err){Lb.msgs.splice(Lb.msgs.indexOf(m),1);refreshChat();toast('No se envió el mensaje')}});
  pollLobby();every(pollLobby,2000);lobbyMapInit()};

/* ---------- ubicación en vivo: la última posición de cada participante ---------- */
let busyP=false,busyF=false,warned=false;
async function sendPos(){const m=Live.me;if(!m||(Live.simMe&&!(S.sel&&S.sel.demo))||busyP)return;busyP=true;
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
Live.tick=function(){if(S.sel&&S.sel.sim)return _tickSim.call(this);if(!this.sharing)return;if(S.sel&&S.sel.demo&&this.simO)this.simStep();sendPos();if(this.me)fetchPeers()};   /* rodadas reales: nunca compañeros simulados */
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
function groupStrip(){const me=Live.me,now=Date.now();
  if(!Live.sharing)return `<button class="gchip" data-act="locAllow" style="background:#2FD98D;color:#04130B">${I('pin',16)}Compartir mi ubicación</button>`;
  const ps=(S.sel.pp||[]).filter(p=>p.user_id!==uid());if(!ps.length)return `<span class="gchip">Eres el único en la rodada</span>`;
  return ps.map(p=>{const q=Live.peers[p.user_id],a=q?now-q.t:null,d=q&&me?hav(me,q.ll):null,cl=!q||a>LOST_MS?'#FF9500':a>STALE_MS?'#FFC76B':'#2FD98D';
    return `<span class="gchip"><i style="background:${cl}"></i><b>${esc(first(p.nombre))}</b>${d==null?'sin ubicación':fmtD(d)}</span>`}).join('')}
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
  NavMap.init('hud');
  const tick=()=>{if(S.screen!=='hud'||!S.run)return;NavMap.update();const el=Math.floor((Date.now()-R.t0)/1000),c=$('#hclock');if(!c)return;c.textContent=fmtT(el);
    $('#hspd').textContent=(Live.me&&Live.me[4]!=null?Math.round(Live.me[4]):0)+' km/h';
    const g=$('#hgrp'),h=NavMap.ok?groupStrip():groupHTML();if(g&&g.dataset.h!==h){g.innerHTML=h;g.dataset.h=h}
    const chip=R.banner&&Date.now()<R.banner.until?R.banner:lagChip(),ch=$('#hchip');
    if(ch){const html=chip?`<div class="chipf ${chip.g?'g':''}" style="${chip.color?'background:'+chip.color+';color:'+(chip.dk||'#10151A'):''}">${I(chip.ic||'warn',20)}<span>${esc(chip.t)}</span></div>`:'';if(ch.dataset.h!==html){ch.innerHTML=html;ch.dataset.h=html}}};
  every(tick,500);every(()=>Live.tick(),2000);every(pollAlerts,1000);every(pollEnd,3000);pollAlerts();tick()};

/* ---------- camino al punto: distancia real desde el GPS ---------- */
const _enSim=AFTER.enroute;
AFTER.enroute=()=>{if(!real())return _enSim();clearST();
  const p0=spotOf(S.sel),ed=$('#edist'),et=$('#eeta');ed.textContent='—';et.textContent='Buscando tu ubicación…';
  if(S.consent.ubic){
    if(!Live.sharing)Live.start();NavMap.init('enroute');
    const upd=()=>{if(S.screen!=='enroute')return;Live.tick();NavMap.update();const m=Live.me,e=$('#edist'),t=$('#eeta');if(!e||!m)return;
      const d=hav(m,p0);if(d<80){e.textContent='Llegaste';t.textContent='Estás en el punto de encuentro'}else{e.textContent=fmtD(d);t.textContent=Math.max(1,Math.round(d/1000/25*60))+' min a tu destino'}};
    every(upd,1000);upd();return}
  if(!navigator.geolocation){et.textContent='Tu dispositivo no permite ubicación';return}
  const w=navigator.geolocation.watchPosition(p=>{if(S.screen!=='enroute'){navigator.geolocation.clearWatch(w);return}
      const d=hav([p.coords.latitude,p.coords.longitude],p0),e=$('#edist'),t=$('#eeta');if(!e)return;
      if(d<80){e.textContent='Llegaste';t.textContent='Estás en el punto de encuentro'}else{e.textContent=fmtD(d);t.textContent=Math.max(1,Math.round(d/1000/25*60))+' min a tu destino'}},
    err=>{const t=$('#eeta');if(t)t.textContent='Activa el permiso de ubicación para ver la distancia'},{enableHighAccuracy:true,maximumAge:3000,timeout:15000})};

/* ---------- sesión: entrar directo si ya hay una guardada; cerrar sesión de verdad ---------- */
const _goOut=ACT.go;
ACT.go=d=>{if(d.to==='splash'&&S.screen==='perfil'){Live.stop();RodAPI.signOut();fresh()}_goOut(d)};
if(RodAPI.session()){(async()=>{try{const p=await RodAPI.profile();if(!p||S.screen!=='splash')return;
  newAccount();S.xp=p.xp||0;S.user={nombre:p.nombre,exp:p.exp};S.veh=Object.assign(S.veh,{cc:p.cc,marca:p.marca,placa:p.placa});
  S.verStatus=p.ver_status;S.verified=p.ver_status==='ok';loadResumen();go('home')}catch(e){}})()}
/* ---------- tu perfil refleja tus rodadas: XP, calificación e historial viven en la base ---------- */
S.done=S.done||{};S.hist=S.hist||[];
async function loadResumen(){try{const j=await rest('/rpc/mi_resumen','POST',{});if(!j||typeof j!=='object')return;
  S.xp=j.xp||0;S.rodadas=j.rodadas||0;S.rating=j.rating!=null?+j.rating:null;S.hist=j.hist||[];S.badges=[...new Set(S.hist.map(h=>h.badge).filter(Boolean))];
  if(S.screen==='perfil'&&$('#layer').hidden)render()}catch(e){}}
window.loadResumen=loadResumen;
const _aw=awardRide;awardRide=function(){const had=S.award;_aw();const r=S.sel;
  if(!had&&S.award&&r&&!r.sim){S.done[r.id]=true;rest('/rpc/registrar_rodada','POST',{p_ride:r.id,p_nombre:r.name,p_km:r.km||0,p_xp:S.award.xp,p_badge:S.award.b?S.award.b.k:null}).catch(()=>{})}};
const _sr2=ACT.sendRate;ACT.sendRate=()=>{const r=S.sel,R=Object.assign({},S.rate);
  if(r&&!r.sim&&r.pp)r.pp.filter(p=>p.user_id!==uid()).forEach(p=>{const c=R[p.nombre+'c'],q=R[p.nombre+'p'];if(c||q)rest('/rpc/calificar','POST',{p_ride:r.id,p_to:p.user_id,p_c:c||q,p_p:q||c}).catch(()=>{})});
  _sr2()};
const _skr=ACT.skipRate;ACT.skipRate=()=>{if(S.sel)S.done[S.sel.id]=true;_skr()};
const _lg=ACT.login;ACT.login=async function(){const r=await _lg.apply(this,arguments);if(RodAPI.uid())loadResumen();return r};
const _ap2=AFTER.perfil;AFTER.perfil=()=>{_ap2&&_ap2();loadResumen()};

/* ---------- Inicio = tu rodada en curso: si ya estás en una, "Inicio" te lleva directo a su sala ---------- */
const activeRide=()=>S.rides.find(r=>!r.sim&&r.part.includes('Tú')&&r.estado!=='terminada'&&!S.done[r.id]);
const _goH=go;go=function(id){if(id==='home'){const r=activeRide();
  if(r){S.sel=r;if(!S.lobby||S.lobby.rid!==r.id){initLobby(r.host==='Tú');S.lobby.rid=r.id}return _goH(S.run&&S.run.t0&&S.screen==='hud'?'hud':'lobby')}}
  _goH(id)};
const _rr=refreshRides;refreshRides=async function(){const ok=await _rr.apply(this,arguments);if(S.screen==='home'&&$('#layer').hidden&&activeRide())go('home');return ok};
const _joinG=ACT.join;ACT.join=async function(){const a=activeRide();if(a&&S.sel&&a.id!==S.sel.id)return toast('Ya estás en "'+a.name+'". Sal de esa rodada para unirte a otra.');return _joinG.apply(this,arguments)};
/* ---------- Comunidad real: las publicaciones y comentarios viven en Supabase y los ven todos ---------- */
{const OFF=1e9,ago=t=>{const s=Math.max(0,(Date.now()-new Date(t).getTime())/1000);return s<60?'Ahora':s<3600?'Hace '+Math.floor(s/60)+' min':s<86400?'Hace '+Math.floor(s/3600)+' h':'Hace '+Math.floor(s/86400)+' d'};
 let sig='',busyC=false;
 const mine=n=>n===(S.user&&S.user.nombre);
 async function syncPosts(force){if(!RodAPI.live||!RodAPI.uid()||busyC)return;busyC=true;
  try{const ps=await rest('/posts?select=id,user_id,nombre,zona,tema,texto,video,created_at&order=created_at.desc&limit=60');
   const ids=ps.map(p=>p.id);let cs=[];
   if(ids.length)cs=await rest('/post_comments?select=id,post_id,user_id,nombre,texto,created_at&post_id=in.('+ids.join(',')+')&order=created_at.asc&limit=400');
   const s=JSON.stringify([ps.map(p=>p.id),cs.map(c=>c.id)]);
   const old=new Map(S.com.posts.map(p=>[p.id,p]));
   const list=ps.map(p=>{const o=old.get(OFF+p.id);return Object.assign({id:OFF+p.id,real:1,n:p.user_id===RodAPI.uid()?'Tú':p.nombre,zona:p.zona||'Bogotá',tema:p.tema,ago:ago(p.created_at),t:p.texto,likes:o?o.likes:0,conf:0,
     c:cs.filter(c=>c.post_id===p.id).map(c=>({n:c.user_id===RodAPI.uid()?'Tú':c.nombre,t:c.texto}))},p.video?{rt:1,dur:'0:42'}:{})});
   S.com.posts=EJ?list.concat(S.com.posts.filter(p=>!p.real&&!p._loc)):list;
   if(force||s!==sig){sig=s;const typing=document.activeElement&&/INPUT|TEXTAREA/.test(document.activeElement.tagName);
     if(S.screen==='comunidad'&&!typing&&document.getElementById('layer').hidden!==false)render()}
  }catch(e){}finally{busyC=false}}
 const _ac=AFTER.comunidad;AFTER.comunidad=()=>{_ac&&_ac();clearST();syncPosts(true);every(syncPosts,4000)};
 const _cpub=ACT.cpub;
 ACT.cpub=async function(){const C=S.com,D=C.draft,t=$('#ctxt');if(t)D.txt=t.value;const tx=D.txt.trim(),tema=D.tema,vid=!!D.video;
  if(!RodAPI.live){return _cpub.apply(this,arguments)}
  if(!tema||tx.length<8){C.err=true;composeSheet();return}
  try{await rest('/posts','POST',{nombre:S.user.nombre,zona:S.zonaMia,tema,texto:tx.slice(0,600),video:tema==='video'&&vid},'return=minimal')}
  catch(e){toast('No se pudo publicar: '+String(e.message||e).slice(0,80));return}
  C.draft={tema:null,txt:'',video:false};C.err=false;C.tema=null;closeLayer();toast('Publicación enviada a la comunidad');await syncPosts(true);render()};
 document.addEventListener('submit',async e=>{const f=e.target.closest('[data-cform]');if(!f||!RodAPI.live)return;
  const p=S.com.posts.find(x=>x.id==f.dataset.cform);if(!p||!p.real)return;const c=p.c[p.c.length-1];if(!c||c.n!=='Tú')return;
  try{await rest('/post_comments','POST',{post_id:p.id-OFF,nombre:S.user.nombre,texto:c.t.slice(0,400)},'return=minimal')}catch(err){toast('No se pudo comentar');p.c.pop();render()}});
 const _fr=fresh;fresh=function(){_fr();sig='';S.done={};S.hist=[];if(!EJ)S.com.posts=[]};
 if(!EJ)S.com.posts=[];}
})();

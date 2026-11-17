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
})();

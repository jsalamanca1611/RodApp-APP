'use strict';
/* RodApp · mapa del grupo y ubicación en vivo.
   Principios:
   - El Modo Rodada (HUD) NO muestra mapa: es Zero-Screen. El mapa sirve en la sala de espera, para llegar al punto
     de encuentro y para el organizador o quien se atrasa. En ruta, el grupo se entera por voz.
   - Ubicación solo con consentimiento (S.consent.ubic), solo durante la rodada y solo entre participantes.
   - Limitación web: el GPS del navegador solo reporta con la pantalla encendida (Wake Lock) y la app en primer plano.
   Modo demo: los compañeros se simulan. Modo real: Supabase Realtime Broadcast en un canal privado por rodada.
   Coordenadas de ejemplo APROXIMADAS (±1 km): validar con trazados reales antes de usarlas. */

const SPOT_LL=[[4.7536,-74.0458],[4.7447,-73.9967],[4.7116,-74.1146],[4.5936,-74.1883],[4.5733,-74.1306],[4.6296,-74.1448],[4.6762,-74.0505]];
const DEST_LL={Norte:[5.0221,-74.0053],Calera:[4.7207,-73.9686],Patios:[4.7207,-73.9686],Sur:[4.4930,-74.2600],Occidente:[4.9167,-74.0969]};
const hav=(a,b)=>{const R=6371000,r=x=>x*Math.PI/180,dl=r(b[0]-a[0]),dn=r(b[1]-a[1]),h=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const fmtD=m=>m<950?Math.round(m/10)*10+' m':(m/1000).toFixed(1).replace('.',',')+' km';
const ago=t=>{const s=Math.max(0,Math.round((Date.now()-t)/1000));return s<5?'ahora':s<60?'hace '+s+' s':'hace '+Math.round(s/60)+' min'};
/* Enlaces para llegar al punto de encuentro con la app de navegación del usuario. Las coordenadas de SPOT_LL son aproximadas:
   en producción el organizador fija el punto en un selector de mapa y se guarda lat/lng en la rodada. */
const navLink=k=>{const p=SPOT_LL[SPOTS.indexOf(S.sel.punto)]||SPOT_LL[0],ll=p[0]+','+p[1];
  return k==='waze'?`https://waze.com/ul?ll=${ll}&navigate=yes&utm_source=rodapp`:`https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`};
const STALE_MS=20000,LOST_MS=60000,LAG_M=1500;

/* ---------- estado en vivo ---------- */
const Live={sharing:false,me:null,peers:{},err:null,watch:null,wake:null,ch:null,sim:null,
  rideId:()=>S.sel?S.sel.id:0,
  async start(){if(this.sharing)return;this.err=null;
    if(!S.consent.ubic){return openLocPrompt()}
    this.sharing=true;
    if('wakeLock' in navigator){try{this.wake=await navigator.wakeLock.request('screen')}catch(e){}}
    if(navigator.geolocation){this.watch=navigator.geolocation.watchPosition(p=>{this.me=[p.coords.latitude,p.coords.longitude,Date.now()];this.err=null;this.push(p.coords);MapKit.draw()},
      e=>{this.err=e.code===1?'denegado':e.code===2?'sin señal GPS':'tarda demasiado';this.useSim();MapKit.draw()},{enableHighAccuracy:true,maximumAge:3000,timeout:15000})}
    else{this.err='sin GPS';this.useSim()}
    if(RodAPI.live)this.join();else this.seedPeers()},
  stop(){this.sharing=false;if(this.watch!=null){navigator.geolocation.clearWatch(this.watch);this.watch=null}
    if(this.wake){try{this.wake.release()}catch(e){}this.wake=null}
    if(this.ch){try{this.ch.unsubscribe()}catch(e){}this.ch=null}
    this.me=null;this.peers={};this.sim=null},
  useSim(){if(!this.me){const p=SPOT_LL[SPOTS.indexOf(S.sel&&S.sel.punto)]||SPOT_LL[0];this.me=[p[0]+.0009,p[1]-.0007,Date.now()];this.simMe=true}},
  push(c){if(!this.ch)return;const now=Date.now();if(now-(this._t||0)<2000)return;this._t=now;
    this.ch.send({type:'broadcast',event:'pos',payload:{uid:RodAPI.session().user.id,name:S.user.nombre,lat:c.latitude,lng:c.longitude,spd:c.speed,hdg:c.heading,t:now}})},
  /* Real: canal privado por rodada. Requiere las políticas de realtime.messages de supabase/schema.sql. */
  async join(){try{if(!window.supabase){await new Promise((ok,ko)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';s.onload=ok;s.onerror=ko;document.head.appendChild(s)})}
      const C=RodAPI.cfg,cl=window.supabase.createClient(C.supabaseUrl,C.anonKey);cl.realtime.setAuth(RodAPI.session().access_token);
      this.ch=cl.channel('ride:'+this.rideId(),{config:{private:true,broadcast:{self:false}}});
      this.ch.on('broadcast',{event:'pos'},({payload:p})=>{this.peers[p.uid]={n:p.name,ll:[p.lat,p.lng],t:p.t,v:p.spd};MapKit.draw()}).subscribe()}
    catch(e){this.err='sin conexión en vivo';MapKit.draw()}},
  /* Demo: compañeros que avanzan por la ruta con ruido. Solo corre mientras se ve el mapa. */
  seedPeers(){const r=S.sel,p0=SPOT_LL[SPOTS.indexOf(r.punto)]||SPOT_LL[0],d=DEST_LL[r.zona]||DEST_LL.Norte;
    this.sim={p0,d};this.peers={};r.part.filter(n=>n!=='Tú').slice(0,5).forEach((n,i)=>{this.peers[n]={n,ll:[p0[0]+(Math.random()-.5)*.004,p0[1]+(Math.random()-.5)*.004],t:Date.now(),f:Math.random()*.02+.01*i,v:8+Math.random()*3}})},
  tick(){if(!this.sim)return;const{p0,d}=this.sim,names=Object.keys(this.peers);names.forEach((n,i)=>{const q=this.peers[n];
      if(i===names.length-1&&q.f>.5)return;           /* el último se atrasa y deja de reportar: prueba de "rezagado" */
      q.f=Math.min(1,q.f+.004+Math.random()*.003-(i===names.length-1?.003:0));
      q.ll=[p0[0]+(d[0]-p0[0])*q.f+Math.sin(q.f*9+i)*.004,p0[1]+(d[1]-p0[1])*q.f+Math.cos(q.f*7+i)*.004];q.t=Date.now()});
    if(this.simMe&&this.me){this.me=[this.me[0]+(Math.random()-.4)*.0004,this.me[1]+(Math.random()-.4)*.0004,Date.now()]}}};

/* ---------- mapa: MapLibre si hay estilo configurado; si no, esquema SVG ---------- */
const MapKit={map:null,mk:{},
  bounds(){const pts=[];if(Live.me)pts.push(Live.me);Object.values(Live.peers).forEach(p=>pts.push(p.ll));const r=S.sel,p0=SPOT_LL[SPOTS.indexOf(r.punto)]||SPOT_LL[0];pts.push(p0,DEST_LL[r.zona]||DEST_LL.Norte);
    const la=pts.map(p=>p[0]),lo=pts.map(p=>p[1]),pad=.01;return{n:Math.max(...la)+pad,s:Math.min(...la)-pad,e:Math.max(...lo)+pad,w:Math.min(...lo)-pad}},
  svg(){const B=this.bounds(),W=360,H=300,r=S.sel,p0=SPOT_LL[SPOTS.indexOf(r.punto)]||SPOT_LL[0],d=DEST_LL[r.zona]||DEST_LL.Norte;
    const k=Math.cos(((B.n+B.s)/2)*Math.PI/180),sx=W/((B.e-B.w)*k),sy=H/(B.n-B.s),s=Math.min(sx,sy)*.9,ox=(W-(B.e-B.w)*k*s)/2,oy=(H-(B.n-B.s)*s)/2;
    const X=p=>ox+(p[1]-B.w)*k*s,Y=p=>oy+(B.n-p[0])*s,now=Date.now();
    const mid=[(p0[0]+d[0])/2+.01,(p0[1]+d[1])/2-.01];
    const dot=(p,c,l,o=1)=>`<g opacity="${o}"><circle cx="${X(p)}" cy="${Y(p)}" r="9" fill="${c}" stroke="#04130B" stroke-width="2.5"/><text x="${X(p)}" y="${Y(p)-14}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${esc(l)}</text></g>`;
    const peers=Object.values(Live.peers).map(q=>{const a=now-q.t,o=a>LOST_MS?.3:a>STALE_MS?.55:1;return dot(q.ll,'#2FD98D',first(q.n),o)}).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa esquemático del grupo" style="width:100%;height:100%;display:block;background:#0B120F"><path d="M${X(p0)} ${Y(p0)} Q${X(mid)} ${Y(mid)} ${X(d)} ${Y(d)}" fill="none" stroke="#2A3A32" stroke-width="6" stroke-linecap="round"/><path d="M${X(p0)} ${Y(p0)} Q${X(mid)} ${Y(mid)} ${X(d)} ${Y(d)}" fill="none" stroke="#12B76A" stroke-width="2" stroke-dasharray="3 7" stroke-linecap="round"/>
    <rect x="${X(p0)-7}" y="${Y(p0)-7}" width="14" height="14" rx="4" fill="#F5C451" stroke="#000" stroke-width="2"/><text x="${X(p0)}" y="${Y(p0)+24}" text-anchor="middle" font-size="11" fill="#F5C451" stroke="#000" stroke-width="3" paint-order="stroke">Encuentro</text>
    <path d="M${X(d)} ${Y(d)-4} l8 14 h-16z" fill="#fff"/>${peers}${Live.me?dot(Live.me,'#007AFF','Tú'):''}</svg>`},
  OSM:{version:8,sources:{o:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap'}},layers:[{id:'o',type:'raster',source:'o'}]},
  async maplibre(el){let st=RodAPI.cfg.mapStyle;if(!st)return false;if(st==='osm')st=this.OSM;
    try{if(!window.maplibregl){await new Promise((ok,ko)=>{const l=document.createElement('link');l.rel='stylesheet';l.href='https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.css';document.head.appendChild(l);const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.js';s.onload=ok;s.onerror=ko;document.head.appendChild(s)})}
      const B=this.bounds();this.map=new maplibregl.Map({container:el,style:st,bounds:[[B.w,B.s],[B.e,B.n]],fitBoundsOptions:{padding:40}});
      this.map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
      const r=S.sel,p0=SPOT_LL[SPOTS.indexOf(r.punto)]||SPOT_LL[0];
      const e=document.createElement('div');e.className='mkr meet';e.textContent='★';new maplibregl.Marker({element:e}).setLngLat([p0[1],p0[0]]).addTo(this.map);return true}catch(e){return false}},
  draw(){const el=$('#mapbox');if(!el)return;
    if(this.map){const upd=(id,ll,c,l)=>{let m=this.mk[id];if(!m){const d=document.createElement('div');d.className='mkr';d.style.background=c;d.textContent=l;m=this.mk[id]=new maplibregl.Marker({element:d}).setLngLat([ll[1],ll[0]]).addTo(this.map)}else{m.setLngLat([ll[1],ll[0]])}};
      if(Live.me){upd('me',Live.me,'#007AFF','Tú');if(!this._fit){this._fit=1;const B=this.bounds();this.map.fitBounds([[B.w,B.s],[B.e,B.n]],{padding:40,duration:0})}}Object.entries(Live.peers).forEach(([id,q])=>{upd(id,q.ll,'#2FD98D',ini(q.n));const a=Date.now()-q.t;this.mk[id].getElement().style.opacity=a>LOST_MS?.3:a>STALE_MS?.55:1})}
    else el.innerHTML=this.svg();
    const l=$('#peers');if(l)l.innerHTML=peersHTML();const b=$('#lagban');if(b)b.innerHTML=lagHTML()},
  leave(){if(this.map){try{this.map.remove()}catch(e){}this.map=null;this.mk={};this._fit=0}}};

function peerRows(){const me=Live.me,now=Date.now();
  return Object.values(Live.peers).map(q=>({n:q.n,d:me?hav(me,q.ll):null,a:now-q.t})).sort((a,b)=>(a.d==null)-(b.d==null)||a.d-b.d)}
function peersHTML(){const rows=peerRows();if(!rows.length)return `<p class="small">${Live.sharing?'Esperando a que tus compañeros compartan ubicación.':'Activa tu ubicación para ver al grupo.'}</p>`;
  return rows.map(q=>{const st=q.a>LOST_MS?'Sin señal':q.a>STALE_MS?'Señal débil':'En vivo';const cl=q.a>LOST_MS?'lost':q.a>STALE_MS?'weak':'';
    return `<div class="prow ${cl}">${av(q.n)}<span class="pn"><b>${esc(q.n)}</b><span class="small">${q.d==null?'—':'a '+fmtD(q.d)} · ${ago(Date.now()-q.a)}</span></span><span class="pst">${st}</span></div>`}).join('')}
function lagHTML(){const out=peerRows().filter(q=>q.a>LOST_MS||(q.d!=null&&q.d>LAG_M));if(!out.length)return '';
  return `<div class="banner" style="background:rgba(255,149,0,.16);color:#FFC76B" role="status">${I('warn',20)}<span><b>${esc(first(out[0].n))} se quedó atrás.</b> ${out[0].a>LOST_MS?'Perdimos su señal hace más de 1 minuto.':'Está a '+fmtD(out[0].d)+'.'}</span></div>`}

SCR.mapa=()=>{const r=S.sel;
  return `<div class="scr light">${hdr('Mapa del grupo','lobby')}<div class="body" style="gap:12px;padding-top:0">
  <div id="mapbox" class="mapbox">${Live.sharing?'':`<div class="empty" style="padding:50px 20px"><span class="ill">${I('pin',34)}</span><p class="lead">Activa tu ubicación para ver al grupo y el punto de encuentro.</p></div>`}</div>
  <div id="lagban">${lagHTML()}</div>
  <div class="small" style="margin:0">${esc(r.name)} · salida ${esc(r.punto)}</div>
  <div class="grow2" style="gap:10px"><a class="btn sm ghost" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="${navLink('waze')}">Ir con Waze</a><a class="btn sm ghost" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="${navLink('gmaps')}">Ir con Google Maps</a></div>
  ${Live.err?`<div class="banner info">${I('warn',20)}<span>GPS ${Live.err}. Mostramos una posición de ejemplo.</span></div>`:''}
  <div id="peers">${peersHTML()}</div>
  <div class="banner info">${I('shield',20)}<span>Solo tu grupo ve tu ubicación, solo mientras comparte, y se apaga al terminar la rodada. En ruta, el aviso a los compañeros llega por voz.</span></div>
  </div><div class="foot">${Live.sharing?`<button class="btn ghost" data-act="locStop">Dejar de compartir</button>`:`<button class="btn" data-act="locStart">Compartir mi ubicación</button>`}</div></div>`};
AFTER.mapa=async()=>{if(Live.sharing){const el=$('#mapbox');const ml=await MapKit.maplibre(el);MapKit.draw();every(()=>{Live.tick();MapKit.draw()},2000)}};

function openLocPrompt(){openLayer(`<div class="scrim" data-act="closeLayer"></div><div class="sheetp sheet" role="dialog" aria-label="Ubicación"><div class="grab"></div><h2 class="t">Comparte tu ubicación con el grupo</h2>
 <p class="lead">Solo ven tu posición los participantes de esta rodada, mientras está activa. Puedes dejar de compartir cuando quieras. El navegador te pedirá permiso.</p>
 <button class="btn" data-act="locAllow">Entendido, compartir</button><button class="btn ghost" data-act="closeLayer">Ahora no</button></div>`)}

Object.assign(ACT,{
  mapa:()=>go('mapa'),
  locAllow:()=>{S.consent.ubic=true;closeLayer();ACT.locStart()},
  locStart:async()=>{await Live.start();render()},
  locStop:()=>{Live.stop();render()}
});
/* El permiso de ubicación se corta al terminar la rodada o cerrar sesión. */
const _goMap=go;go=function(id){if(S.screen==='mapa'&&id!=='mapa')MapKit.leave();if(['resumen','splash','login'].includes(id))Live.stop();_goMap(id)};

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
  /* Reciprocidad: solo ves al grupo si tú también compartes una ubicación real (en la base de datos también se exige). */
  canSee(){return this.sharing&&(!!this.me||!RodAPI.live)},
  async start(){if(this.sharing)return;this.err=null;
    if(!S.consent.ubic){return openLocPrompt()}
    this.sharing=true;
    if(S.sel&&S.sel.demo){this.simUser();return}   /* rodada de prueba real: ubicación simulada, pero la ven los demás participantes */
    if(S.sel&&S.sel.sim){this.simUser();this.seedPeers();return}   /* demostración: tu recorrido es simulado, no se usa el GPS */
    if('wakeLock' in navigator){try{this.wake=await navigator.wakeLock.request('screen')}catch(e){}}
    if(navigator.geolocation){
      const ok=p=>{const c=p.coords;this.simMe=false;this.me=[c.latitude,c.longitude,Date.now(),c.heading,c.speed==null?null:c.speed*3.6,c.accuracy];this.err=null;this.push(c);MapKit.draw()};
      const watch=hi=>{this._hi=hi;this.watch=navigator.geolocation.watchPosition(ok,e=>{
        if(e.code===1){this.err='denegado'}
        else{this.err=e.code===2?'sin señal GPS':'tarda demasiado';
          if(hi&&this.sharing){navigator.geolocation.clearWatch(this.watch);watch(false)}}   /* reintenta con ubicación por red/wifi */
        if(!RodAPI.live)this.useSim();MapKit.draw()},{enableHighAccuracy:hi,maximumAge:hi?3000:10000,timeout:hi?20000:40000})};
      navigator.geolocation.getCurrentPosition(ok,()=>{},{enableHighAccuracy:false,timeout:8000,maximumAge:60000});   /* primer dato rápido */
      watch(true)}
    else{this.err='sin GPS';if(!RodAPI.live)this.useSim()}
    if(RodAPI.live&&!(S.sel&&S.sel.sim))this.join();else this.seedPeers()},
  stop(){this.sharing=false;if(this.watch!=null){navigator.geolocation.clearWatch(this.watch);this.watch=null}
    if(this.wake){try{this.wake.release()}catch(e){}this.wake=null}
    if(this.ch){try{this.ch.unsubscribe()}catch(e){}this.ch=null}
    this.me=null;this.simMe=false;this.peers={};this.sim=null},
  useSim(){if(!this.me){const p=SPOT_LL[SPOTS.indexOf(S.sel&&S.sel.punto)]||SPOT_LL[0];this.me=[p[0]+.0009,p[1]-.0007,Date.now()];this.simMe=true}},
  push(c){if(!this.ch)return;const now=Date.now();if(now-(this._t||0)<2000)return;this._t=now;
    this.ch.send({type:'broadcast',event:'pos',payload:{uid:RodAPI.session().user.id,name:S.user.nombre,lat:c.latitude,lng:c.longitude,spd:c.speed,hdg:c.heading,t:now}})},
  /* Real: canal privado por rodada. Requiere las políticas de realtime.messages de supabase/schema.sql. */
  async join(){try{if(!window.supabase){await new Promise((ok,ko)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';s.onload=ok;s.onerror=ko;document.head.appendChild(s)})}
      const C=RodAPI.cfg,cl=window.supabase.createClient(C.supabaseUrl,C.anonKey);cl.realtime.setAuth(RodAPI.session().access_token);
      this.ch=cl.channel('ride:'+this.rideId(),{config:{private:true,broadcast:{self:false}}});
      this.ch.on('broadcast',{event:'pos'},({payload:p})=>{this.peers[p.uid]={n:p.name,ll:[p.lat,p.lng],t:p.t,v:p.spd};MapKit.draw()}).subscribe()}
    catch(e){this.err='sin conexión en vivo';MapKit.draw()}},
  /* Compañeros simulados (rodadas de ejemplo): salen de distintos barrios y avanzan despacio hacia el punto de encuentro. Ver sim.js. */
  seedPeers(){SimBots.init(S.sel);this.peers=SimBots.peers(S.sel)},
  /* Demostración: sales de un barrio de Bogotá y avanzas hacia el punto de encuentro en ~3 min desde que arranca la rodada. */
  simUser(){this.simMe=true;this.simT=0;
    const p=SPOT_LL[SPOTS.indexOf(S.sel&&S.sel.punto)]||SPOT_LL[0],c=[4.65,-74.08],dy=c[0]-p[0],dx=(c[1]-p[1])*Math.cos(p[0]*Math.PI/180),L=Math.hypot(dx,dy)||1;
    this.simO=[p[0]+dy/L*1000/111320,p[1]+dx/L*1000/(111320*Math.cos(p[0]*Math.PI/180))];
    if(S.sel&&S.sel.demo){const h=hash(String(RodAPI.uid()||'x'));this.simO[0]+=((h%7)-3)*.0006;this.simO[1]+=(((h>>3)%7)-3)*.0006}   /* cada persona sale de un punto distinto */   /* a 1 km del punto, hacia el centro de Bogotá */
    this.simStep()},
  simStep(){const p=SPOT_LL[SPOTS.indexOf(S.sel&&S.sel.punto)]||SPOT_LL[0],o=this.simO,DUR=90000;
    if(!this.simT&&S.lobby&&S.lobby.started)this.simT=Date.now();
    const f=this.simT?Math.min(1,(Date.now()-this.simT)/DUR):0,la=o[0]+(p[0]-o[0])*f,ln=o[1]+(p[1]-o[1])*f;
    const dy=(p[0]-o[0]),dx=(p[1]-o[1])*Math.cos(o[0]*Math.PI/180),hd=(Math.atan2(dx,dy)*180/Math.PI+360)%360;
    const km=hav(o,p)/1000;this.me=[la,ln,Date.now(),hd,this.simT&&f<1?Math.round(km/(DUR/3600000)):0,8]},
  tick(){if(!this.sharing)return;if(S.sel)this.peers=SimBots.peers(S.sel);
    if(this.simMe&&S.sel&&S.sel.sim&&this.simO)return this.simStep();
    if(this.simMe&&this.me){this.me=[this.me[0]+(Math.random()-.4)*.0004,this.me[1]+(Math.random()-.4)*.0004,Date.now(),null,28+Math.random()*10]}}};

/* ---------- mapa: MapLibre si hay estilo configurado; si no, esquema SVG ---------- */
const MapKit={map:null,mk:{},embed:false,pad(){return this.embed?{top:30,bottom:30,left:30,right:30}:{top:90,bottom:330,left:50,right:50}},
  bounds(){const pts=[];if(Live.me)pts.push(Live.me);Object.values(Live.peers).forEach(p=>pts.push(p.ll));const r=S.sel,p0=SPOT_LL[SPOTS.indexOf(r.punto)]||SPOT_LL[0];pts.push(p0);if(pts.length<2)pts.push(DEST_LL[r.zona]||DEST_LL.Norte);
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
  styleOf(){let st=RodAPI.cfg.mapStyle;if(!st)return null;if(st==='osm')return this.OSM;if(/^(liberty|bright|positron)$/.test(st))return 'https://tiles.openfreemap.org/styles/'+st;return st},
  async lib(){if(window.maplibregl)return;await new Promise((ok,ko)=>{const l=document.createElement('link');l.rel='stylesheet';l.href='assets/vendor/maplibre-gl.css';document.head.appendChild(l);const s=document.createElement('script');s.src='assets/vendor/maplibre-gl.js';s.onload=ok;s.onerror=ko;document.head.appendChild(s)})},
  async maplibre(el){const st=this.styleOf();if(!st)return false;
    try{await this.lib();
      if(this.map){try{this.map.remove()}catch(e){}}this.mk={};this._sig=null;clearTimeout(this._bad);const B=this.bounds();this.map=new maplibregl.Map({container:el,style:st,bounds:[[B.w,B.s],[B.e,B.n]],fitBoundsOptions:{padding:this.pad(),maxZoom:14},pitch:0,attributionControl:{compact:true},cooperativeGestures:!!this.embed,locale:{'CooperativeGesturesHandler.MobileHelpText':'Usa dos dedos para mover el mapa','CooperativeGesturesHandler.WindowsHelpText':'Usa Ctrl + rueda para acercar','CooperativeGesturesHandler.MacHelpText':'Usa ⌘ + rueda para acercar'}});
      this.follow=true;this.map.on('dragstart',()=>{this.follow=false});
      this._ok=false;const mp=this.map;
      mp.on('data',e=>{if(e.dataType==='source'&&e.tile&&e.sourceDataType!=='metadata'&&e.sourceId!=='ruta'&&e.sourceId!=='acc')this._ok=true});   /* llegó al menos un mosaico */
      this._bad=setTimeout(()=>{if(this._ok||!this.map)return;try{this.map.setStyle(this.OSM)}catch(e){}this._bad=setTimeout(()=>{if(!this._ok)this.fallback()},6000)},5000);   /* si Carto no responde, prueba OpenStreetMap; si tampoco, esquema SVG */
      const r=S.sel,p0=SPOT_LL[SPOTS.indexOf(r.punto)]||SPOT_LL[0];
      const e=document.createElement('div');e.className='mkr meet';e.textContent='★';new maplibregl.Marker({element:e}).setLngLat([p0[1],p0[0]]).addTo(this.map);return true}catch(e){return false}},
  draw(){const el=$('#mapbox');if(!el)return;
    if(this.map){
      const mk=(id,ll,html,cls,rot)=>{let k=this.mk[id];if(!k){const d=document.createElement('div');d.className=cls;d.innerHTML=html;k=this.mk[id]=new maplibregl.Marker({element:d,rotationAlignment:'map',pitchAlignment:'viewport'}).setLngLat([ll[1],ll[0]]).addTo(this.map)}else k.setLngLat([ll[1],ll[0]]);if(rot!=null)k.setRotation(rot);return k};
      if(Live.me){const hd=Live.me[3]!=null&&!isNaN(Live.me[3])?Live.me[3]:(this._hd||0);this._hd=hd;
        mk('me',Live.me,'<svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="rgba(0,122,255,.22)"/><path d="M22 6l11 28-11-6-11 6z" fill="#2FA8FF" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>','mkme',hd);
        if(this.follow&&!this._busy&&!(S.lobby&&!S.lobby.started))this.map.easeTo({center:[Live.me[1],Live.me[0]],bearing:hd,pitch:55,zoom:16.3,duration:900,padding:this.embed?{top:0,bottom:0,left:0,right:0}:{top:0,bottom:240,left:0,right:0}})}
      this.accCircle();RouteMap.attach(this.map,S.sel&&S.sel.rt);
      if(S.lobby&&!S.lobby.started&&this.follow){const sig=Object.keys(Live.peers).length+(Live.me?'m':'');if(sig!==this._sig){this._sig=sig;const B=this.bounds();try{this.map.fitBounds([[B.w,B.s],[B.e,B.n]],{padding:this.pad(),maxZoom:14,duration:700})}catch(e){}}}
      Object.entries(Live.peers).forEach(([id,q])=>{const k=mk(id,q.ll,`<span>${esc(ini(q.n))}</span><em>${esc(first(q.n))}</em>`,'mkp');const a=Date.now()-q.t;k.getElement().style.opacity=a>LOST_MS?.3:a>STALE_MS?.55:1})}
    else el.innerHTML=this.svg();
    const sp=$('#spdv');if(sp)sp.textContent=Live.me&&Live.me[4]!=null?Math.round(Live.me[4]):'—';
    const l=$('#peers');if(l)l.innerHTML=peersHTML();const b=$('#lagban');if(b)b.innerHTML=lagHTML();const ac=$('#acc');if(ac)ac.innerHTML=accHTML()},
  /* Círculo de precisión: muestra cuánto puede equivocarse la ubicación (en un PC, hasta kilómetros) */
  accCircle(){const mp=this.map;if(!mp||!Live.me||!Live.me[5]||Live.simMe)return;const la=Live.me[0],ln=Live.me[1],r=Math.min(Live.me[5],8000),pts=[];
    for(let i=0;i<=48;i++){const t=i/48*2*Math.PI;pts.push([ln+r/(111320*Math.cos(la*Math.PI/180))*Math.cos(t),la+r/110540*Math.sin(t)])}
    const data={type:'Feature',geometry:{type:'Polygon',coordinates:[pts]}};
    try{if(!mp.isStyleLoaded())return;const s=mp.getSource('acc');if(s)s.setData(data);else{mp.addSource('acc',{type:'geojson',data});
      mp.addLayer({id:'acc-f',type:'fill',source:'acc',paint:{'fill-color':'#2F80ED','fill-opacity':.13}});mp.addLayer({id:'acc-l',type:'line',source:'acc',paint:{'line-color':'#2F80ED','line-width':1.2,'line-opacity':.6}})}}catch(e){}},
  fallback(){if(!this.map||this._ok)return;try{this.map.remove()}catch(e){}this.map=null;this.mk={};const el=$('#mapbox');if(el){const keep=el.querySelector('.empty');el.innerHTML=this.svg()}},
  leave(){this.embed=false;clearTimeout(this._bad);this._bad=null;if(this.map){try{this.map.remove()}catch(e){}this.map=null;this.mk={};this._fit=0;this.follow=true}}};

function peerRows(){const me=Live.me,now=Date.now();
  return Object.values(Live.peers).map(q=>({n:q.n,d:me?hav(me,q.ll):null,a:now-q.t})).sort((a,b)=>(a.d==null)-(b.d==null)||a.d-b.d)}
function peersHTML(){const rows=peerRows();if(!rows.length)return `<p class="small">${Live.sharing?'Esperando a que tus compañeros compartan ubicación.':'Activa tu ubicación para ver al grupo.'}</p>`;
  return rows.map(q=>{const st=q.a>LOST_MS?'Sin señal':q.a>STALE_MS?'Señal débil':'En vivo';const cl=q.a>LOST_MS?'lost':q.a>STALE_MS?'weak':'';
    return `<div class="prow ${cl}">${av(q.n)}<span class="pn"><b>${esc(q.n)}</b><span class="small">${q.d==null?'—':'a '+fmtD(q.d)} · ${ago(Date.now()-q.a)}</span></span><span class="pst">${st}</span></div>`}).join('')}
function accHTML(){if(!Live.sharing)return '';
  if(Live.err&&!Live.me)return `<div class="banner info">${I('warn',20)}<span>GPS ${Live.err}.${Live.err==='denegado'?' Activa el permiso de ubicación de RodApp en los ajustes del celular.':' Buscando de nuevo; sal a cielo abierto si estás bajo techo.'}</span></div>`;
  if(!Live.me)return '<p class="small" style="margin:0">Buscando tu ubicación…</p>';
  if(Live.simMe)return `<div class="banner info">${I('warn',20)}<span>${S.sel&&(S.sel.sim||S.sel.demo)?'Demostración: tu recorrido es simulado y avanza solo cuando arranca la rodada.'+(S.sel.demo?' Los demás participantes sí te ven.':''):'Mostramos una posición de ejemplo.'}</span></div>`;
  const a=Math.round(Live.me[5]||0);
  return a>150?`<div class="banner info">${I('warn',20)}<span>Ubicación aproximada (±${a} m): el círculo azul es el área real posible. Un computador no tiene GPS; en el celular será precisa.</span></div>`:`<p class="small" style="margin:0;color:#8FF0C0">Tu ubicación en vivo${a?' · ±'+a+' m':''}</p>`}
function lagHTML(){if(S.lobby&&!S.lobby.started)return '';const out=peerRows().filter(q=>q.a>LOST_MS||(q.d!=null&&q.d>LAG_M));if(!out.length)return '';
  return `<div class="banner" style="background:rgba(255,149,0,.16);color:#FFC76B" role="status">${I('warn',20)}<span><b>${esc(first(out[0].n))} se quedó atrás.</b> ${out[0].a>LOST_MS?'Perdimos su señal hace más de 1 minuto.':'Está a '+fmtD(out[0].d)+'.'}</span></div>`}

/* ---------- rutas reales por carretera ----------
   Puntos de paso reales de cada ruta (lat,lng). El trazado por calles lo calcula OSRM (servicio público, sin clave) la primera vez
   y se guarda en el dispositivo. Si no hay respuesta, se dibuja la línea entre los puntos de paso. */
const RWP=[
 [[4.7447,-73.9967],[4.8660,-73.8770]],
 [[4.7536,-74.0458],[5.0221,-74.0053]],
 [[4.5936,-74.1883],[4.4930,-74.2600]],
 [[4.7447,-73.9967],[4.7207,-73.9686]],
 [[4.7536,-74.0458],[4.9180,-74.0280]],
 [[4.7536,-74.0458],[5.0450,-73.7970],[4.9340,-73.8330]],
 [[4.7116,-74.1146],[4.9160,-74.0970]],
 [[4.6296,-74.1448],[4.7330,-74.2640]]];
const RouteMap={mem:{},
  wp(rt){return RWP[(rt==null||rt<0?0:rt)%RWP.length]},
  async coords(rt){rt=(rt==null||rt<0)?0:rt%RWP.length;if(this.mem[rt])return this.mem[rt];
    try{const c=JSON.parse(localStorage.getItem('rodapp.route.v2.'+rt)||'null');if(c&&c.length>5)return this.mem[rt]=c}catch(e){}
    const w=this.wp(rt),fb=w.map(p=>[p[1],p[0]]);
    try{const ac=new AbortController(),t=setTimeout(()=>ac.abort(),9000);
      const r=await fetch('https://router.project-osrm.org/route/v1/driving/'+w.map(p=>p[1]+','+p[0]).join(';')+'?overview=full&geometries=geojson',{signal:ac.signal});clearTimeout(t);
      const j=await r.json();const c=j&&j.routes&&j.routes[0]&&j.routes[0].geometry&&j.routes[0].geometry.coordinates;
      if(c&&c.length>5){try{localStorage.setItem('rodapp.route.v2.'+rt,JSON.stringify(c))}catch(e){}return this.mem[rt]=c}}catch(e){}
    return fb},   /* sin guardar: se reintenta la próxima vez */
  /* Añade la línea de la ruta al mapa (se vuelve a añadir si el estilo cambia). */
  put(map,c){const add=()=>{try{
      if(!map.hasImage('flecha')){const cv=document.createElement('canvas');cv.width=cv.height=40;const x=cv.getContext('2d');
        x.lineWidth=7;x.lineCap='round';x.lineJoin='round';x.strokeStyle='#04130B';x.beginPath();x.moveTo(11,8);x.lineTo(27,20);x.lineTo(11,32);x.stroke();
        x.lineWidth=4;x.strokeStyle='#fff';x.beginPath();x.moveTo(11,8);x.lineTo(27,20);x.lineTo(11,32);x.stroke();
        map.addImage('flecha',x.getImageData(0,0,40,40))}
      if(!map.getSource('ruta')){map.addSource('ruta',{type:'geojson',lineMetrics:true,data:{type:'Feature',geometry:{type:'LineString',coordinates:c}}});
        map.addLayer({id:'ruta-c',type:'line',source:'ruta',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#04130B','line-width':5.5,'line-opacity':.85}});
        map.addLayer({id:'ruta-l',type:'line',source:'ruta',layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':3,'line-gradient':['interpolate',['linear'],['line-progress'],0,'#2FD98D',.5,'#7BE0FF',1,'#4C8DFF']}});
        map.addLayer({id:'ruta-f',type:'symbol',source:'ruta',layout:{'symbol-placement':'line','symbol-spacing':64,'icon-image':'flecha','icon-size':.55,'icon-allow-overlap':true,'icon-ignore-placement':true,'icon-rotation-alignment':'map'}})}}catch(e){}};
    if(map.isStyleLoaded())add();else map.once('load',add)},
  async attach(map,rt){if(!map||map._rt===rt+'')return;map._rt=rt+'';const c=await this.coords(rt);if(this._dead(map))return;this.put(map,c);
    map.on('style.load',()=>this.put(map,c))},
  _dead(map){return !map||!map.getCanvas||!map.getCanvas().isConnected},
  gmaps(rt){const w=this.wp(rt),o=w[0],d=w[w.length-1],v=w.slice(1,-1);return 'https://www.google.com/maps/dir/?api=1&origin='+o[0]+','+o[1]+'&destination='+d[0]+','+d[1]+(v.length?'&waypoints='+v.map(p=>p[0]+','+p[1]).join('|'):'')+'&travelmode=driving'},
  /* Mapa de la ficha de la rodada: ruta real sobre calles. Si no cargan los mosaicos, queda el esquema. */
  async hero(r){const el=$('#rhero');const st=MapKit.styleOf();if(!el||!st||!r)return;
    try{await MapKit.lib();const c=await this.coords(r.rt);if(!$('#rhero')||S.screen!=='detalle')return;
      const lo=Math.min(...c.map(p=>p[0])),hi=Math.max(...c.map(p=>p[0])),la=Math.min(...c.map(p=>p[1])),ha=Math.max(...c.map(p=>p[1]));
      const map=new maplibregl.Map({container:el,style:st,bounds:[[lo,la],[hi,ha]],fitBoundsOptions:{padding:{top:50,bottom:34,left:34,right:34},maxZoom:13},interactive:false,attributionControl:{compact:true}});
      let ok=false;map.on('data',e=>{if(e.dataType==='source'&&e.tile&&e.sourceDataType!=='metadata'&&e.sourceId!=='ruta')ok=true});
      const mk=(ll,html,cls)=>{const d=document.createElement('div');d.className=cls;d.innerHTML=html;new maplibregl.Marker({element:d}).setLngLat(ll).addTo(map)};
      mk(c[0],'★','mkr meet');mk(c[c.length-1],'⚑','mkr meet fin');
      const lg=document.createElement('div');lg.className='rleg';lg.innerHTML='<b>Ida</b> · ★ Salida → ⚑ Destino';el.appendChild(lg);
      this.put(map,c);
      setTimeout(()=>{if(!ok){try{map.remove()}catch(e){}const x=$('#rhero');if(x)x.style.display='none'}},9000)}catch(e){}}};
const _ad0=AFTER.detalle;AFTER.detalle=()=>{_ad0&&_ad0();RouteMap.hero(S.sel)};

/* ---------- Modo Rodada (demostración): mapa real que te sigue, con la ruta y tu grupo ---------- */
const HudMap={map:null,mk:{},c:null,cum:null,ok:false,
  async init(){this.stop();const el=document.querySelector('.hudmap'),st=MapKit.styleOf();if(!el||!st)return;
    try{await MapKit.lib();const c=await RouteMap.coords(S.sel.rt);if(S.screen!=='hud'||!document.querySelector('.hudmap'))return;
      this.c=c;this.cum=[0];for(let i=1;i<c.length;i++)this.cum.push(this.cum[i-1]+hav([c[i-1][1],c[i-1][0]],[c[i][1],c[i][0]]));
      const box=document.createElement('div');box.id='hmap';box.style.cssText='position:absolute;inset:0;z-index:0';el.prepend(box);
      const sv=el.querySelector('svg');if(sv)sv.style.visibility='hidden';
      const me=this.at(300);this.ok=false;
      this.map=new maplibregl.Map({container:box,style:st,center:[me[0],me[1]],zoom:16.2,pitch:55,bearing:me[2],interactive:false,attributionControl:false});
      this.map.on('data',e=>{if(e.dataType==='source'&&e.tile&&e.sourceDataType!=='metadata'&&e.sourceId!=='ruta')this.ok=true});
      RouteMap.put(this.map,c);this.update();
      this._t=setTimeout(()=>{if(!this.ok)this.stop()},9000)}catch(e){this.stop()}},
  at(d){const L=this.cum[this.cum.length-1];d=Math.max(0,Math.min(L,d));let i=1;while(i<this.cum.length-1&&this.cum[i]<d)i++;
    const a=this.c[i-1],b=this.c[i],f=(d-this.cum[i-1])/((this.cum[i]-this.cum[i-1])||1);
    return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,(Math.atan2((b[0]-a[0])*Math.cos(a[1]*Math.PI/180),b[1]-a[1])*180/Math.PI+360)%360]},
  update(){const R=S.run;if(!this.map||!R||!this.c)return;
    const d=300+(R.p-.05)/.95*3000,me=this.at(d);
    RIDERS.forEach(r=>{const off=r.n==='Tú'?0:(r.lag?r.off-R.drift:r.off)*8000,p=this.at(d+off),far=Math.abs(off)>500;
      let k=this.mk[r.n];
      if(!k){const e=document.createElement('div');
        if(r.n==='Tú'){e.className='mkr';e.innerHTML='<svg width="48" height="48" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="rgba(47,217,141,.25)"/><path d="M22 6l11 28-11-6-11 6z" fill="#2FD98D" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>'}
        else{e.className='mkp';e.innerHTML=`<span>${esc(ini(r.n))}</span><em>${esc(first(r.n))}</em>`}
        k=this.mk[r.n]=new maplibregl.Marker({element:e,rotationAlignment:'viewport',pitchAlignment:'viewport'}).setLngLat([p[0],p[1]]).addTo(this.map)}
      k.setLngLat([p[0],p[1]]);if(r.n!=='Tú')k.getElement().firstChild.style.background=far?'#FF9500':'';});
    try{this.map.easeTo({center:[me[0],me[1]],bearing:me[2],duration:260,easing:t=>t})}catch(e){}},
  stop(){clearTimeout(this._t);if(this.map){try{this.map.remove()}catch(e){}}this.map=null;this.mk={};const b=document.getElementById('hmap');if(b)b.remove();const sv=document.querySelector('.hudmap svg');if(sv)sv.style.visibility=''}};
const _hudA=AFTER.hud;AFTER.hud=()=>{_hudA&&_hudA();if(S.sel&&(S.sel.sim||!RodAPI.live))HudMap.init()};
const _hudT=hudTick;hudTick=function(){_hudT();if(HudMap.map)HudMap.update()};

SCR.mapaGate=()=>{const r=S.sel,w=Live.sharing;
  return `<div class="scr dark mapscr"><div class="gate">
  <button class="mbtn mback" style="position:absolute;top:16px;left:16px" data-act="go" data-to="lobby" aria-label="Volver">${I('back',24)}</button>
  <span class="ill" style="color:#2FD98D">${I('pin',44)}</span>
  <h1 class="t" style="color:#fff">Comparte tu ubicación para ver al grupo</h1>
  <p class="lead" style="color:#BFD0C7">En RodApp todos se ven entre todos: para ver dónde va cada compañero, tú también compartes la tuya. Solo tu grupo la ve, solo durante la rodada.</p>
  ${w?`<div id="gateacc">${accHTML()||'<p class="small">Buscando tu ubicación…</p>'}</div>`:`<button class="btn" data-act="locStart">Compartir mi ubicación</button>`}
  <div class="grow2" style="gap:10px;width:100%"><a class="btn sm ghost" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="${navLink('waze')}">Ir con Waze</a><a class="btn sm ghost" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="${navLink('gmaps')}">Google Maps</a></div>
  <p class="small" style="margin:0;color:#9DB0A6">Salida · ${esc(r.punto)}</p>
  </div></div>`};
SCR.mapa=()=>{const r=S.sel,sh=Live.sharing;if(!Live.canSee())return SCR.mapaGate();
  return `<div class="scr dark mapscr"><div id="mapbox" class="mapfull"></div>
  <button class="mbtn mback" data-act="go" data-to="lobby" aria-label="Volver">${I('back',24)}</button>
  <div class="spd" aria-live="off"><b id="spdv">—</b><span>km/h</span></div><button class="mbtn mrec" data-act="mapRec" aria-label="Centrar en mí">${I('pin',24)}</button>
  <div class="msheet"><div class="grab"></div><div id="lagban">${lagHTML()}</div>
   <div class="mhead"><div><b>${esc(r.name)}</b><span class="small" style="display:block">Salida · ${esc(r.punto)}</span></div></div>
   <div class="grow2" style="gap:10px"><a class="btn sm ghost" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="${navLink('waze')}">Ir con Waze</a><a class="btn sm ghost" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="${navLink('gmaps')}">Google Maps</a></div>
   <div id="acc">${accHTML()}</div>
   <div id="peers">${peersHTML()}</div>
   <p class="small" style="margin:0">Solo tu grupo ve tu ubicación, solo mientras compartes. Se apaga al terminar la rodada.</p>
   <button class="btn ghost" data-act="locStop">Dejar de compartir</button></div></div>`};
/* En la demostración la rodada también arranca si estás viendo el mapa (el reloj de la sala se detiene al salir de ella). */
function simStartCheck(){const L=S.lobby,r=S.sel;if(!L||!r||!r.sim||L.started||!L.ready)return;SimBots.init(r);
  if(SimBots.readyFrac(r)>=.6){L.started=true;const m={n:r.host==='Tú'?r.part[0]:r.host,t:'Arrancamos. Todos al punto de encuentro.'};L.msgs.push(m);SimBots.log(r).push(m);beep(740,.2);toast('¡Arrancó la rodada! Ve al punto de encuentro.')}}
AFTER.mapa=async()=>{clearST();
  if(!Live.canSee()){every(()=>{simStartCheck();if(Live.canSee())return render();const g=$('#gateacc');if(g&&Live.sharing)g.innerHTML=accHTML()||'<p class="small">Buscando tu ubicación…</p>'},1000);return}
  Live.tick();const el=$('#mapbox');const ok=await MapKit.maplibre(el);if(!ok)el.innerHTML=MapKit.svg();MapKit.draw();
  every(()=>{simStartCheck();if(!Live.canSee())return render();Live.tick();MapKit.draw()},1000)};

function openLocPrompt(){openLayer(`<div class="scrim" data-act="closeLayer"></div><div class="sheetp sheet" role="dialog" aria-label="Ubicación"><div class="grab"></div><h2 class="t">Comparte tu ubicación con el grupo</h2>
 <p class="lead">Solo ven tu posición los participantes de esta rodada, mientras está activa. Puedes dejar de compartir cuando quieras. El navegador te pedirá permiso.</p>
 <button class="btn" data-act="locAllow">Entendido, compartir</button><button class="btn ghost" data-act="closeLayer">Ahora no</button></div>`)}

Object.assign(ACT,{
  mapa:()=>go('mapa'),
  mapRec:()=>{MapKit.follow=true;MapKit.draw()},
  lsec:d=>{const L=S.lobby;if(!L)return;L.open=L.open||{};const k=d.k,on=L.open[k]===false;L.open[k]=on;const b=$('#sec_'+k);if(b)b.hidden=!on;const h=document.querySelector('[data-k="'+k+'"].lsech');if(h)h.setAttribute('aria-expanded',on)},
  lmap:()=>{const L=S.lobby;if(!L)return;L.mapOn=true;if(!Live.sharing&&!S.consent.ubic){return openLocPrompt()}if(!Live.sharing)return Live.start().then(render);render()},
  lmapOff:()=>{const L=S.lobby;if(L)L.mapOn=false;MapKit.leave();render()},
  locAllow:()=>{S.consent.ubic=true;closeLayer();ACT.locStart()},
  locStart:async()=>{await Live.start();render()},
  locStop:()=>{Live.stop();render()}
});
/* El permiso de ubicación se corta al terminar la rodada o cerrar sesión. */
const _goMap=go;go=function(id){if((S.screen==='mapa'&&id!=='mapa')||(S.screen==='lobby'&&id!=='lobby'))MapKit.leave();if(S.screen==='hud'&&id!=='hud')HudMap.stop();if(['resumen','splash','login'].includes(id))Live.stop();_goMap(id)};

/* Mapa integrado en la sala de espera: se carga al pulsar "Ver mapa del grupo", después de compartir la ubicación. */
window.lobbyMapInit=async function(){const L=S.lobby;if(!L||S.screen!=='lobby'||!L.mapOn)return;
  if(!Live.sharing){return}   /* sin compartir no hay mapa: vuelve al botón */
  MapKit.embed=true;Live.tick();const el=$('#mapbox');if(!el)return;
  const ok=await MapKit.maplibre(el);if(!ok){el.innerHTML=MapKit.svg()}MapKit.draw();
  every(()=>{if(S.screen!=='lobby'||!S.lobby||!S.lobby.mapOn)return;Live.tick();MapKit.draw()},1000)};
const _alm=AFTER.lobby;AFTER.lobby=function(){const r=_alm&&_alm.apply(this,arguments);lobbyMapInit();return r};

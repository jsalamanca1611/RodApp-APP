'use strict';
/* RodApp · editor de ruta propia.
   1) Toca el mapa para poner el INICIO y el DESTINO: la ruta se traza sola por calles (OSRM).
   2) Toca y arrastra la línea: la ruta se dobla mientras arrastras (los puntos cercanos te siguen según qué tanto la alejes)
      y al soltar se ajusta a las calles pasando por el punto donde la soltaste. Toca un punto blanco para quitarlo. */
const RE={map:null,a:null,b:null,vias:[],c:null,km:0,busy:false,mk:{},drag:null,note:'',ok:false,
  fresh(){Object.assign(this,{a:null,b:null,vias:[],c:null,km:0,busy:false,drag:null,note:''})},
  len(c){let s=0;for(let i=1;i<c.length;i++)s+=hav([c[i-1][1],c[i-1][0]],[c[i][1],c[i][0]]);return s},
  nearest(c,ll){let bi=0,bd=1e18;for(let i=0;i<c.length;i++){const d=(c[i][0]-ll[0])**2+(c[i][1]-ll[1])**2;if(d<bd){bd=d;bi=i}}return bi},
  /* OSRM: ruta por calles pasando por los puntos, en orden. Si no responde, línea directa (se avisa). */
  async route(pts){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),9000);
    try{const r=await fetch('https://router.project-osrm.org/route/v1/driving/'+pts.map(p=>p[0]+','+p[1]).join(';')+'?overview=full&geometries=geojson',{signal:ac.signal});clearTimeout(t);
      const j=await r.json(),c=j&&j.routes&&j.routes[0]&&j.routes[0].geometry&&j.routes[0].geometry.coordinates;if(c&&c.length>1)return{c,ok:true}}catch(e){}
    clearTimeout(t);return{c:pts.slice(),ok:false}},
  async redo(){if(!this.a||!this.b)return;this.busy=true;this.ui();
    const r=await this.route([this.a].concat(this.vias,[this.b]));this.c=r.c;this.km=Math.round(this.len(r.c)/100)/10;this.note=r.ok?'':'No pudimos trazar por calles ahora: se muestra una línea directa. Intenta de nuevo.';
    this.busy=false;this.show();this.markers();this.ui()},
  show(c){const mp=this.map;if(!mp)return;const data={type:'Feature',geometry:{type:'LineString',coordinates:c||this.c||[]}};
    const put=()=>{try{const s=mp.getSource('re');if(s)s.setData(data);else{mp.addSource('re',{type:'geojson',data});
      mp.addLayer({id:'re-c',type:'line',source:'re',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#04130B','line-width':7,'line-opacity':.85}});
      mp.addLayer({id:'re-l',type:'line',source:'re',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#2FD98D','line-width':4}})}}catch(e){}};
    if(mp.isStyleLoaded())put();else mp.once('load',put)},
  markers(){const mp=this.map;if(!mp)return;Object.values(this.mk).forEach(k=>k.remove());this.mk={};
    const mk=(id,ll,html,cls,drag,fn)=>{const d=document.createElement('div');d.className=cls;d.innerHTML=html;const k=new maplibregl.Marker({element:d,draggable:!!drag}).setLngLat(ll).addTo(mp);
      if(drag)k.on('dragend',()=>{const p=k.getLngLat();fn(p)});this.mk[id]=k;return d};
    if(this.a)mk('a',this.a,'A','mkr meet re-a',true,p=>{this.a=[p.lng,p.lat];this.redo()});
    if(this.b)mk('b',this.b,'B','mkr meet re-b',true,p=>{this.b=[p.lng,p.lat];this.redo()});
    this.vias.forEach((v,i)=>{const d=mk('v'+i,v,'','re-via',false);d.title='Quitar este punto';d.addEventListener('click',e=>{e.stopPropagation();this.vias.splice(i,1);this.redo()})})},
  ui(){const e=document.getElementById('re-info');if(!e)return;
    const t=!this.a?'1. Toca el mapa para poner el <b>inicio</b> de la ruta.':!this.b?'2. Ahora toca el <b>destino</b>.':this.busy?'Trazando la ruta por calles…':'Arrastra la línea para moverla entre las calles. Toca un punto blanco para quitarlo.';
    e.innerHTML=`<p class="small" style="margin:0;color:#fff">${t}</p>${this.c&&this.b?`<b style="font:400 26px var(--display);color:#fff">${this.km} km</b>`:''}${this.note?`<p class="small" style="margin:0;color:#FFC76B">${this.note}</p>`:''}`;
    const ok=document.getElementById('re-ok');if(ok)ok.disabled=!(this.a&&this.b&&this.c&&!this.busy)},
  /* arrastre de la línea: vista previa local con caída gaussiana a lo largo de la ruta; al soltar se ajusta a calles */
  down(e){if(!this.c||this.busy||!this.map)return;const mp=this.map,pt=e.point;let bi=0,bd=1e9;
    this.c.forEach((p,i)=>{const q=mp.project(p),d=Math.hypot(q.x-pt.x,q.y-pt.y);if(d<bd){bd=d;bi=i}});
    if(bd>32)return;e.preventDefault();mp.dragPan.disable();
    const c0=this.c.map(p=>p.slice()),cum=[0];for(let i=1;i<c0.length;i++)cum.push(cum[i-1]+hav([c0[i-1][1],c0[i-1][0]],[c0[i][1],c0[i][0]]));
    const L=cum[cum.length-1],sig=Math.max(400,Math.min(4000,L*.12));
    this.drag={i0:bi,c0,cum,sig,start:[e.lngLat.lng,e.lngLat.lat]}},
  move(e){const D=this.drag;if(!D)return;e.preventDefault();const dx=e.lngLat.lng-D.start[0],dy=e.lngLat.lat-D.start[1],n=D.c0.length;
    const out=D.c0.map((p,i)=>{if(i===0||i===n-1)return p;const s=Math.abs(D.cum[i]-D.cum[D.i0]),w=Math.exp(-((s/D.sig)**2));return[p[0]+dx*w,p[1]+dy*w]});this.show(out)},
  async up(e){const D=this.drag;if(!D)return;this.drag=null;this.map.dragPan.enable();
    const dx=e.lngLat.lng-D.start[0],dy=e.lngLat.lat-D.start[1];if(Math.hypot(dx,dy)<.00008){this.show();return}   /* fue un toque, no un arrastre */
    const via=[D.c0[D.i0][0]+dx,D.c0[D.i0][1]+dy];
    const pos=this.vias.filter(v=>this.nearest(D.c0,v)<D.i0).length;this.vias.splice(pos,0,via);await this.redo()},
  simplify(c,max=400){if(c.length<=max)return c.map(p=>[+p[0].toFixed(5),+p[1].toFixed(5)]);const st=Math.ceil(c.length/max),o=[];for(let i=0;i<c.length;i+=st)o.push(c[i]);if(o[o.length-1]!==c[c.length-1])o.push(c[c.length-1]);return o.map(p=>[+p[0].toFixed(5),+p[1].toFixed(5)])},
  async open(){const el=document.getElementById('remap'),st=MapKit.styleOf();if(!el)return;
    if(!st){el.innerHTML='<div class="empty" style="padding:30px"><p class="lead">El mapa no está disponible en esta versión.</p></div>';return}
    try{await MapKit.lib()}catch(e){el.innerHTML='<div class="empty" style="padding:30px"><p class="lead">No se pudo cargar el mapa. Revisa tu conexión.</p></div>';return}
    const c0=this.a||[-74.08,4.65];
    this.map=new maplibregl.Map({container:el,style:st,center:c0,zoom:this.a?12:10.5,attributionControl:{compact:true}});
    this.map.on('load',()=>{this.show();this.markers();this.ui();
      if(this.c){const lo=this.c.map(p=>p[0]),la=this.c.map(p=>p[1]);this.map.fitBounds([[Math.min(...lo),Math.min(...la)],[Math.max(...lo),Math.max(...la)]],{padding:60,duration:0})}});
    this.map.on('click',async e=>{if(this.busy||this.drag)return;const p=[e.lngLat.lng,e.lngLat.lat];
      if(!this.a){this.a=p;this.markers();this.ui()}else if(!this.b){this.b=p;this.markers();await this.redo()}});
    ['mousedown','touchstart'].forEach(k=>this.map.on(k,e=>this.down(e)));
    ['mousemove','touchmove'].forEach(k=>this.map.on(k,e=>this.move(e)));
    ['mouseup','touchend'].forEach(k=>this.map.on(k,e=>this.up(e)));
    if(!this.a&&navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>{if(!this.a&&this.map)this.map.jumpTo({center:[p.coords.longitude,p.coords.latitude],zoom:12})},()=>{},{timeout:5000,maximumAge:120000});
    this.ui()},
  leave(){if(this.map){try{this.map.remove()}catch(e){}this.map=null}this.mk={}}};

SCR.rutaEd=()=>`<div class="scr light">${hdr('Dibuja tu ruta','crear')}
 <div style="position:relative;flex:1;min-height:0;margin:0 14px;border-radius:22px;overflow:hidden;background:#0B120F"><div id="remap" style="position:absolute;inset:0"></div></div>
 <div style="background:#10151A;margin:10px 14px 0;border-radius:18px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;flex:none" id="re-info"></div>
 <div class="foot" style="flex:none"><div style="display:flex;gap:10px"><button class="btn sm ghost" style="flex:1" data-act="reUndo">Deshacer</button><button class="btn sm ghost" style="flex:1" data-act="reClear">Empezar de nuevo</button></div>
 <button class="btn" id="re-ok" data-act="reUse" disabled>Usar esta ruta</button></div></div>`;
AFTER.rutaEd=()=>{RE.open()};
Object.assign(ACT,{
  reNew:()=>{RE.fresh();go('rutaEd')},
  reEdit:()=>{const c=S.cr.custom;if(c){RE.fresh();RE.a=c.coords[0];RE.b=c.coords[c.coords.length-1];RE.c=c.coords;RE.km=c.km;RE.vias=(c.vias||[])}go('rutaEd')},
  reUndo:()=>{if(RE.vias.length){RE.vias.pop();RE.redo()}else if(RE.b){RE.b=null;RE.c=null;RE.km=0;RE.show([]);RE.markers();RE.ui()}else if(RE.a){RE.a=null;RE.markers();RE.ui()}},
  reClear:()=>{RE.fresh();RE.show([]);RE.markers();RE.ui()},
  reUse:()=>{if(!(RE.a&&RE.b&&RE.c))return;S.cr.custom={coords:RE.simplify(RE.c),km:Math.max(1,Math.round(RE.km)),vias:RE.vias.slice()};S.cr.ruta='custom';S.cr.punto='Inicio de tu ruta (marcado en el mapa)';delete S.errs.punto;go('crear')},
  reDel:()=>{S.cr.custom=null;S.cr.ruta=null;S.cr.punto=null;render()}
});
const _goRE=go;go=function(id){if(S.screen==='rutaEd'&&id!=='rutaEd')RE.leave();_goRE(id)};

'use strict';
/* RodApp · Clubes y copas
   Depende de clubs-model.js (ECON, clubDiscount, clubPts, cop). Datos de ejemplo + pantallas + acciones. */

/* ================= 2. DATOS DE EJEMPLO ================= */
/* Clubes ficticios. En producción vienen de la tabla clubs (ver supabase/schema.sql). */
const REGIONES=[
  {k:'Bogotá y Sabana',on:true},{k:'Antioquia y Eje Cafetero',on:false},{k:'Valle y Pacífico',on:false},
  {k:'Santanderes',on:false},{k:'Caribe',on:false},{k:'Llanos y Oriente',on:false}];
const LIGAS=['Rookie','Pro','Élite'];
const CLUBS=[
  {id:'halcones',n:'Halcones del Norte',z:'Norte',cc:'200–500',liga:'Pro',m:24,p:9,rod:6,km:1480,asist:.82,inc:6,cal:4.7,d:'Rodadas de domingo por la Autopista Norte, Zipaquirá y Guatavita.'},
  {id:'cerros',n:'Cerros Riders',z:'Calera',cc:'200–500',liga:'Pro',m:31,p:17,rod:7,km:1790,asist:.88,inc:7,cal:4.8,d:'Ruta de montaña La Calera – Guasca. Salida temprano.'},
  {id:'sabana',n:'Sabana Moto Club',z:'Occidente',cc:'<200',liga:'Rookie',m:19,p:4,rod:4,km:760,asist:.74,inc:4,cal:4.5,d:'Rodadas cortas Tenjo – Tabio para empezar.'},
  {id:'sur',n:'Sur en Dos Ruedas',z:'Sur',cc:'<200',liga:'Rookie',m:22,p:12,rod:5,km:1020,asist:.80,inc:5,cal:4.6,d:'Salidas desde Portal Sur hacia Sibaté y Fusagasugá.'},
  {id:'patios',n:'Patios Pace',z:'Patios',cc:'>500',liga:'Élite',m:16,p:13,rod:8,km:2210,asist:.91,inc:8,cal:4.9,d:'Alto cilindraje, ritmo constante, cero adelantamientos en curva.'},
  {id:'nortepro',n:'Torque Norte',z:'Norte',cc:'>500',liga:'Élite',m:28,p:19,rod:7,km:2040,asist:.86,inc:6,cal:4.7,d:'Touring y deportivas. Rutas largas de fin de semana.'},
  {id:'urbanos',n:'Urbanos 85',z:'Norte',cc:'<200',liga:'Rookie',m:41,p:11,rod:6,km:540,asist:.69,inc:5,cal:4.4,d:'Commuters que se juntan los sábados a rodar fuera de la ciudad.'},
  {id:'calerabros',n:'Calera Brothers',z:'Calera',cc:'200–500',liga:'Pro',m:15,p:3,rod:5,km:1190,asist:.77,inc:4,cal:4.6,d:'Grupo pequeño, parche fijo y almuerzo en la ruta.'},
  {id:'occidente',n:'Madrid Moto Team',z:'Occidente',cc:'200–500',liga:'Pro',m:20,p:8,rod:5,km:1130,asist:.79,inc:5,cal:4.5,d:'Mosquera, Madrid y Subachoque.'}
];
const CLUB_PERKS=[
  ['Bronce','Perfil de club verificado y panel de asistencia por rodada.'],
  ['Plata','Co-branding en las rodadas del club y una rodada destacada al mes.'],
  ['Oro','Cupo en copas Élite y ofertas de aliados (talleres, combustible), por negociar.'],
  ['Platino','Prioridad para eventos oficiales y parada sugerida con aliado del club.']];

/* ================= 3. PANTALLAS ================= */
IC.trophy='<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>';

const clubById=id=>CLUBS.find(c=>c.id===id);
/* Si la persona es Premium y está en un club, cuenta como un Premium más (los datos de ejemplo no la incluyen). */
const clubStats=c=>{const mine=S.club===c.id;return{...c,m:c.m+(mine?1:0),p:c.p+(mine&&S.premium?1:0)}};
const clubsAll=()=>CLUBS.map(clubStats);
const fmtPct=x=>Math.round(x*100)+' %';
const tierChip=d=>d.tier&&d.pct>0?`<span class="lchip">${d.tier.n} · −${fmtPct(d.pct)}</span>`:`<span class="lchip off">${d.locked?'Faltan '+d.faltaMin+' Premium':'Sin descuento'}</span>`;

function discountMeter(c){
  const d=clubDiscount(c.m,c.p),E=ECON,max=.9,w=Math.min(100,Math.round(d.ratio/max*100));
  const marks=E.TIERS.map(t=>`<i class="mk ${d.ratio>=t.min-1e-9&&!d.locked?'on':''}" style="left:${Math.round(t.min/max*100)}%"><b>${t.n}</b></i>`).join('');
  let msg;
  if(d.locked)msg=`Faltan <b>${d.faltaMin}</b> miembros Premium para activar el descuento. Mínimo: ${E.MIN_PREMIUM}.`;
  else if(d.next)msg=`Suman <b>${d.faltanNext}</b> Premium más y suben a <b>${d.next.n}</b> (−${fmtPct(d.next.pct)}).`;
  else msg='Nivel máximo de descuento.';
  return `<div class="dmeter"><div class="dtop"><span><b>${c.p}</b> de ${c.m} con Premium · ${fmtPct(d.ratio)}</span>${tierChip(d)}</div>
  <div class="dbar" role="progressbar" aria-label="Miembros con Premium" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(d.ratio*100)}"><span style="width:${w}%"></span>${marks}</div>
  <p class="small" style="margin:18px 0 0">${msg}</p>${d.capped?'<p class="small">Tope de margen aplicado: el descuento baja un tramo hasta que más miembros sean Premium.</p>':''}</div>`}

const rankOf=(list)=>list.map(c=>({...c,pts:clubPts(c)})).sort((a,b)=>b.pts-a.pts);
function filteredClubs(){const f=S.clubs;return clubsAll().filter(c=>c.m>=ECON.MIN_MIEMBROS_COPA&&(!f.cc||c.cc===f.cc)&&(!f.liga||c.liga===f.liga))}

function clubRow(c,i){const d=clubDiscount(c.m,c.p);
  return `<button class="crow" data-act="clubOpen" data-id="${c.id}"><span class="rk ${i<3?'t'+(i+1):''}">${i+1}</span>
  <span class="cinfo"><b>${esc(c.n)}${S.club===c.id?' <span class="lchip">Tu club</span>':''}</b><span class="small">${c.z} · ${c.cc} cc · Liga ${c.liga} · ${c.m} miembros</span></span>
  <span class="cpts"><b>${c.pts}</b><span class="small">pts</span></span></button>`}

SCR.clubes=()=>{const f=S.clubs,mine=S.club?clubStats(clubById(S.club)):null;
  const chip=(act,v,l,on)=>`<button class="chip" aria-pressed="${on}" data-act="${act}" data-v="${v}">${l}</button>`;
  const vistas=`<div class="scrollx" role="group" aria-label="Qué ver" data-tour="cl-vistas">${chip('clVista','copas','Copas',f.vista==='copas')}${chip('clVista','explorar','Explorar clubes',f.vista==='explorar')}${chip('clVista','reglas','Cómo se puntúa',f.vista==='reglas')}</div>`;
  const reg=REGIONES.find(r=>r.k===f.reg);
  const regs=`<div class="scrollx" role="group" aria-label="Zona del país">${REGIONES.map(r=>chip('clReg',esc(r.k),esc(r.k),f.reg===r.k)).join('')}</div>`;
  const cats=`<div class="scrollx" role="group" aria-label="Categoría">${chip('clCc','',"Todos los cc",!f.cc)}${CCS.map(c=>chip('clCc',c.k,c.k+' cc',f.cc===c.k)).join('')}${LIGAS.map(l=>chip('clLiga',l,'Liga '+l,f.liga===l)).join('')}</div>`;
  let main='';
  if(f.vista==='reglas')main=reglasHTML();
  else if(!reg.on)main=`<div class="empty"><h2 class="t">${esc(f.reg)}: muy pronto</h2><p class="lead">Abrimos una zona cuando hay 3 clubes con 12 miembros o más. Registra tu club y entra a la lista de espera.</p><button class="btn sm" data-act="toast" data-m="Anotamos tu club en la lista de espera">Registrar mi club</button></div>`;
  else{const list=rankOf(filteredClubs());
    if(f.vista==='copas')main=`<div class="gcard"><b>Copa de noviembre · ${esc(f.reg)}</b><span class="small">${f.cc?f.cc+' cc':'Todos los cilindrajes'} · ${f.liga?'Liga '+f.liga:'Todas las ligas'} · cierra el 30 nov</span></div>${podium(list)}<div class="cards" style="gap:8px">${list.map(clubRow).join('')||'<p class="lead">Ningún club cumple esta categoría todavía.</p>'}</div>`;
    else main=`<div class="cards" style="gap:12px">${clubsAll().filter(c=>!f.cc||c.cc===f.cc).map(c=>clubCard(c)).join('')}</div>`}
  const mineCard=mine?`<button class="gcard minec" data-act="clubOpen" data-id="${mine.id}" data-tour="cl-mi"><div class="gtop"><b>${esc(mine.n)}</b>${tierChip(clubDiscount(mine.m,mine.p))}</div><span class="small">${mine.p} de ${mine.m} con Premium · toca para ver beneficios</span></button>`:`<div class="gcard"><b>Aún no estás en un club</b><span class="small">Únete a uno de tu zona y compite en las copas.</span></div>`;
  return `<div class="scr light"><div class="hhead">${wordmark()}<span></span></div><div class="body" style="gap:14px"><div><h1 class="t">Clubes</h1><p class="lead" style="margin-top:4px">Compitan por asistencia y rodadas sin incidentes, no por velocidad.</p></div>${mineCard}${vistas}${f.vista!=='reglas'?regs+cats:''}${main}</div>${tabbar('clubes')}</div>`};

function podium(list){if(list.length<3)return '';const o=[list[1],list[0],list[2]],h=[64,86,48];
  return `<div class="pod" aria-label="Podio">${o.map((c,i)=>`<div class="pcol"><span class="small">${esc(c.n)}</span><div class="pbar p${[2,1,3][i]}" style="height:${h[i]}px"><b>${[2,1,3][i]}</b></div><b>${c.pts}</b></div>`).join('')}</div>`}

function clubCard(c){const d=clubDiscount(c.m,c.p);
  return `<button class="gcard" data-act="clubOpen" data-id="${c.id}"><div class="gtop"><b>${esc(c.n)}</b>${tierChip(d)}</div><p>${esc(c.d)}</p>
  <div class="grow2"><span class="small">${c.z} · ${c.cc} cc · Liga ${c.liga}</span><span class="small">${c.m} miembros</span></div></button>`}

function reglasHTML(){
  const E=ECON,rows=[['Rodada completada','20 pts'],['Asistencia','hasta 10 pts por rodada, según % de cupos que llegan'],['Km en grupo','1 pt por cada 20 km'],['Rodada sin incidentes','15 pts'],['Calificación promedio','10 pts por cada punto de calificación']];
  return `<div class="gcard"><b>Qué suma</b>${rows.map(r=>`<div class="grow2"><span>${r[0]}</span><span class="small" style="text-align:right">${r[1]}</span></div>`).join('')}</div>
  <div class="banner info">${I('shield',20)}<span>La velocidad, los adelantamientos y las maniobras no puntúan. Una caída o una alerta por conducción imprudente resta la bonificación de esa rodada.</span></div>
  <div class="gcard"><b>Categorías</b><p>Cada copa se juega por zona del país, cilindraje del club (menos de 200, 200–500, más de 500 cc) y liga (Rookie, Pro, Élite). El club sube de liga con 3 copas seguidas en el top 3 y baja si queda último dos veces.</p><p>Para competir, el club necesita mínimo ${E.MIN_MIEMBROS_COPA} miembros.</p></div>
  <div class="gcard"><b>Descuento por Premium</b><p>La cuota del plan Club (${cop(E.CUOTA_CLUB)}/mes, supuesto) baja según el % de miembros con Premium. Mínimo ${E.MIN_PREMIUM} Premium en el club para activarlo.</p>
  ${E.TIERS.map(t=>`<div class="grow2"><span>${t.n} · desde ${fmtPct(t.min)}</span><b>−${fmtPct(t.pct)}</b></div>`).join('')}
  <p class="small">El descuento nunca cuesta más del ${fmtPct(E.TOPE_COSTO)} de lo que los Premium del club pagan a RodApp. Los precios son supuestos hasta validarlos con clubes reales.</p></div>`}

SCR.club=()=>{const c0=clubById(S.clubs.sel)||CLUBS[0],c=clubStats(c0),d=clubDiscount(c.m,c.p),mine=S.club===c.id,E=ECON;
  const sim=S.clubs.sim==null?c.p:S.clubs.sim,ds=clubDiscount(c.m,sim);
  const perks=CLUB_PERKS.map(([n,t],i)=>{const on=d.tier&&d.pct>0&&E.TIERS.findIndex(x=>x.n===d.tier.n)>=i;return `<div class="perk ${on?'on':''}"><span class="pk">${on?I('check',14,3.5):I('lock',14)}</span><span><b>${n}</b><span class="small" style="display:block">${t}</span></span></div>`}).join('');
  return `<div class="scr light">${hdr('','clubes')}<div class="body" style="gap:14px">
  <div><h1 class="t">${esc(c.n)}</h1><p class="lead" style="margin-top:4px">${esc(c.d)}</p><div class="meta" style="margin-top:8px"><span>${I('pin',16)}${c.z}</span><span>${I('engine',16)}${c.cc} cc</span><span>${I('trophy',16)}Liga ${c.liga}</span></div></div>
  <div class="stats"><div class="stat"><b>${c.m}</b><span>Miembros</span></div><div class="stat"><b>${clubPts(c)}</b><span>Puntos</span></div><div class="stat"><b>${Math.round(c.asist*100)}%</b><span>Asistencia</span></div></div>
  <div class="gcard"><b>Descuento del club por Premium</b>${discountMeter(c)}
   <div class="grow2"><span class="small">Cuota del club</span><span><s class="small">${cop(E.CUOTA_CLUB)}</s> <b>${cop(d.pago)}</b>/mes</span></div></div>
  <div class="gcard"><b>Beneficios</b>${perks}</div>
  <div class="gcard"><b>Simula el descuento</b><p class="small">Mueve cuántos miembros tendrían Premium y mira el tramo. Útil para que el líder del club fije metas.</p>
   <input type="range" min="0" max="${c.m}" value="${sim}" aria-label="Miembros con Premium" data-act-input="clSim" style="width:100%">
   <div class="grow2"><span>${sim} Premium · ${fmtPct(ds.ratio)}</span><b>${ds.tier?'−'+fmtPct(ds.pct)+' · '+ds.tier.n:ds.locked?'Faltan '+ds.faltaMin+' para activar':'Sin tramo'}</b></div></div>
  ${mine&&!S.premium?`<div class="banner info">${I('star',20)}<span>Si activas Premium sumas 1 al club${d.locked?' y te acercas al mínimo de '+E.MIN_PREMIUM:''}.</span></div><button class="btn" data-act="premiumOpen">Activar Premium</button>`:''}
  ${mine?`<button class="btn ghost" data-act="clubLeave">Salir del club</button>`:`<button class="btn" data-act="clubJoin" data-id="${c.id}">Unirme al club</button>`}
  </div></div>`};

/* Premium: en producción se cobra con la pasarela (Wompi/PSE/tarjeta). Aquí solo alterna el estado de ejemplo. */
function premiumSheet(){openLayer(`<div class="scrim" data-act="closeLayer"></div><div class="sheetp sheet" role="dialog" aria-label="RodApp Premium"><div class="grab"></div><h2 class="t">RodApp Premium</h2>
 <p class="lead">${cop(ECON.PRECIO_PRO)}/mes (precio de ejemplo). Historial de rodadas, rastreo sin límite y comandos de voz personalizados.</p>
 <p class="small">Tu club suma 1 Premium y se acerca a un descuento en su cuota.</p>
 <button class="btn" data-act="premiumOn">Activar Premium (demo)</button><button class="btn ghost" data-act="closeLayer">Ahora no</button></div>`)}

Object.assign(ACT,{
  clVista:d=>{S.clubs.vista=d.v;render()},
  clReg:d=>{S.clubs.reg=d.v;render()},
  clCc:d=>{S.clubs.cc=d.v||null;render()},
  clLiga:d=>{S.clubs.liga=S.clubs.liga===d.v?null:d.v;render()},
  clubOpen:d=>{S.clubs.sel=d.id;S.clubs.sim=null;go('club')},
  clubJoin:d=>{S.club=d.id;S.clubs.sim=null;toast('Ya eres parte de '+clubById(d.id).n);render()},
  clubLeave:()=>{const n=clubById(S.club).n;S.club=null;toast('Saliste de '+n);go('clubes')},
  premiumOpen:()=>premiumSheet(),
  premiumOn:()=>{S.premium=true;closeLayer();toast('Premium activo');render()}
});
document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.actInput==='clSim'){S.clubs.sim=+t.value;const sc=$('#screen .body'),k=sc.scrollTop;render();const n=$('#screen .body');if(n)n.scrollTop=k;const r=$('#screen input[type=range]');if(r)r.focus({preventScroll:true})}});

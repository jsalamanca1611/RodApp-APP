'use strict';
/* RodApp · compañeros simulados de las rodadas de ejemplo.
   Cada compañero sale de un barrio distinto de Bogotá y avanza despacio hacia el punto de encuentro (2,5–4,5 min en total, pensado para demostraciones).
   Mientras viaja escribe en el chat: ya salí, voy a tanquear, hay trancón, los intercepto, ya casi llego, ya llegué.
   Todo se calcula con el reloj desde que la persona se une, así el mapa, la lista y el chat siempre cuentan la misma historia.
   Solo se usa en rodadas marcadas sim:true (ejemplo). Las rodadas reales nunca llevan compañeros simulados. */
const SimBots=(()=>{
  const BARRIOS=[['Usaquén',[4.6950,-74.0300]],['Chapinero',[4.6480,-74.0620]],['Kennedy',[4.6280,-74.1500]],['Suba',[4.7400,-74.0900]],['Engativá',[4.7000,-74.1100]],['Fontibón',[4.6700,-74.1400]],
    ['Bosa',[4.6100,-74.1900]],['Ciudad Bolívar',[4.5500,-74.1600]],['Teusaquillo',[4.6400,-74.0800]],['San Cristóbal',[4.5700,-74.0900]],['Cedritos',[4.7250,-74.0400]],['Puente Aranda',[4.6150,-74.1100]]];
  const VIAS=['la Autopista Norte','la Carrera 7','la Calle 80','la Avenida Boyacá','la Autopista Sur','la Avenida 68','la Calle 26','la NQS'];
  const SALI=['Ya salí de {b}, voy para el punto.','Saliendo de {b}. Nos vemos allá.','Arranqué desde {b}, en unos minutos estoy.','Voy en camino desde {b}.'];
  const TANQ=['Voy a tanquear primero, me demoro 5 minutos.','Paro a echar gasolina y sigo.','Me desvío a tanquear, no me esperen.','Tanqueo y llego. Cinco minutos.'];
  const TANQ_OK=['Listo, ya tanqueé. Retomo la vía.','Tanque lleno, sigo para allá.','Ya salí de la bomba, voy en camino.'];
  const TRAN=['Hay trancón por {v}, voy despacio.','Mucho tráfico por {v}, me demoro un poquito.','Cierre en {v}, busco otra vía y llego.','Voy atrapado en {v}, aviso cuando salga.'];
  const INTER=['Los intercepto por {v}, ya voy cerca.','Voy por {v}; si pasan por ahí me les uno en la ruta.','Los alcanzo en el camino, voy por {v}.'];
  const CASI=['Ya casi llego, 2 minutos.','Estoy a unas cuadras, ya los veo.','Entrando al punto de encuentro.','Dos minutos y estoy ahí.'];
  const LLEGUE=['Ya llegué, los espero en el punto.','Aquí estoy. Hay sombra en la entrada.','Llegué. Voy por un tinto mientras llegan.','Presente. Ya estoy con la moto parqueada.'];
  const RESP=['Listo, ahí nos vemos.','Perfecto, yo ya estoy saliendo.','Me avisan si cambia algo.','Dale, parche.','Copiado.','Va, quedo atento.','Sin problema, aquí estamos.','De una, nos vemos en un rato.'];
  const pick=(a,h)=>a[Math.abs(h)%a.length];
  const meet=r=>SPOT_LL[SPOTS.indexOf(r.punto)]||SPOT_LL[0];
  const state={};
  function build(r){
    const t0=Date.now(),p0=meet(r),names=r.part.filter(n=>n!=='Tú').slice(0,6),used=new Set();
    const cand=BARRIOS.map(([b,ll])=>({b,ll,d:hav(ll,p0)})).filter(x=>x.d>4000&&x.d<26000);
    const pool=cand.length>=names.length?cand:BARRIOS.map(([b,ll])=>({b,ll,d:hav(ll,p0)}));
    const bots=names.map((n,i)=>{
      const h=hash(n+'|'+r.id),sorted=pool.slice().sort((a,c)=>(hash(a.b+n)%97)-(hash(c.b+n)%97));
      const o=sorted.find(x=>!used.has(x.b))||sorted[0];used.add(o.b);
      const dur=(150+h%120)*1000,delay=(h%15)*1000,tank=i===1||h%3===0,tankF=.3+(h%25)/100,tankMs=25000+(h%20)*1000;
      const tAt=f=>delay+f*dur+(tank&&f>tankF?tankMs:0);
      const v1=pick(VIAS,h),v2=pick(VIAS,h>>3),ev=[];
      ev.push([delay+3000+(h%9)*1000,pick(SALI,h).replace('{b}',o.b)]);
      if(tank){ev.push([tAt(tankF)-1,pick(TANQ,h)]);ev.push([tAt(tankF)+tankMs,pick(TANQ_OK,h)])}
      if(i===2||h%4===1)ev.push([tAt(.5),pick(TRAN,h).replace('{v}',v1)]);
      if(i===3||h%5===2)ev.push([tAt(.4),pick(INTER,h).replace('{v}',v2)]);
      ev.push([tAt(.86),pick(CASI,h)]);ev.push([tAt(1),pick(LLEGUE,h)]);
      ev.sort((a,c)=>a[0]-c[0]);
      return{n,o:o.ll,b:o.b,dur,delay,tank,tankF,tankMs,ev,sent:0,end:tAt(1),i}});
    const host=r.host!=='Tú'?r.host:null;
    const log=host?[{n:host,t:'Buenas, parche. Nos vemos en el punto de encuentro y tanqueamos ahí mismo.'}]:[];
    return{t0,p0,bots,log,r}}
  const get=r=>state[r.id]||(state[r.id]=build(r));
  function frac(b,now,t0){let e=Math.max(0,now-t0-b.delay);const ts=b.tankF*b.dur;if(b.tank&&e>ts)e-=Math.min(b.tankMs,e-ts);return Math.min(1,e/b.dur)}
  return{
    init:r=>{get(r)},
    reset:r=>{delete state[r.id]},
    log:r=>get(r).log,
    reply:(r,t)=>{const s=get(r),o=s.bots;if(!o.length)return null;const h=hash(t);return{n:o[h%o.length].n,t:pick(RESP,h)}},
    arrived:(r,n)=>{const s=get(r),b=s.bots.find(x=>x.n===n);return !!b&&frac(b,Date.now(),s.t0)>=1},
    /* En la sala, cada compañero confirma "listo" a los pocos segundos (el viaje real empieza al arrancar). */
    ready:(r,n)=>{const s=get(r),b=s.bots.find(x=>x.n===n);return !!b&&Date.now()-s.t0>=(6+b.i*7)*1000},
    readyFrac:r=>{const s=get(r),n=Date.now()-s.t0;return s.bots.length?s.bots.filter(b=>n>=(6+b.i*7)*1000).length/s.bots.length:1},
    arrivedFrac:r=>{const s=get(r),n=Date.now();return s.bots.length?s.bots.filter(b=>frac(b,n,s.t0)>=1).length/s.bots.length:1},
    /* Mensajes que ya les tocan a los compañeros. Cada uno se entrega una sola vez. */
    due:r=>{const s=get(r),el=Date.now()-s.t0,out=[];
      s.bots.forEach(b=>{while(b.sent<b.ev.length&&b.ev[b.sent][0]<=el){out.push({at:b.ev[b.sent][0],n:b.n,t:b.ev[b.sent][1]});b.sent++}});
      out.sort((a,c)=>a.at-c.at);out.forEach(m=>s.log.push({n:m.n,t:m.t}));return out.map(m=>({n:m.n,t:m.t}))},
    /* Posición actual: recta origen→punto de encuentro con un pequeño zigzag para que no parezca un riel. */
    peers:r=>{const s=get(r),now=Date.now(),o={};
      s.bots.forEach(b=>{const f=frac(b,now,s.t0),w=(1-f)*.004;
        o[b.n]={n:b.n,ll:[b.o[0]+(s.p0[0]-b.o[0])*f+Math.sin(f*9+b.i)*w,b.o[1]+(s.p0[1]-b.o[1])*f+Math.cos(f*7+b.i)*w],t:now,v:f>=1||(b.tank&&f>b.tankF&&f<b.tankF+.001)?0:22+(b.i*5)%12}});
      return o},
    lobbyInit:(r,host)=>{const s=get(r);
      S.lobby={host,ready:false,started:false,ppl:r.part.map(n=>({n,st:n==='Tú'?'conf':(SimBots.ready(r,n)?'ready':'conf')})),msgs:s.log.slice(),rid:r.id}},
    lobbyAfter:()=>{const L=S.lobby,r=S.sel;SimBots.init(r);
      $('#cform').addEventListener('submit',e=>{e.preventDefault();const i=$('#cin'),t=i.value.trim();if(!t)return;L.msgs.push({me:1,t});i.value='';refreshChat();
        later(()=>{const m=SimBots.reply(r,t);if(!m)return;L.msgs.push(m);SimBots.log(r).push(m);refreshChat()},1500+hash(t)%1500)});
      const tick=()=>{if(S.screen!=='lobby'||S.lobby!==L)return;
        const nm=SimBots.due(r);nm.forEach(m=>L.msgs.push(m));
        L.ppl.forEach(p=>{if(p.n!=='Tú')p.st=SimBots.ready(r,p.n)?'ready':'conf'});
        refreshLobby();if(nm.length){refreshChat();beep(520,.08)}
        if(L.ready&&!L.started&&SimBots.readyFrac(r)>=.6){L.started=true;const m={n:r.host==='Tú'?r.part[0]:r.host,t:'Arrancamos. Todos al punto de encuentro.'};L.msgs.push(m);beep(740,.2);render()}};
      tick();every(tick,1000)}
  }})();

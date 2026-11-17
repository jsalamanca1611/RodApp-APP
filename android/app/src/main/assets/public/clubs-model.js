'use strict';
/* RodApp · modelo económico de clubes (funciones puras, sin DOM). Probado con: node tests/clubs.test.js
   TODOS los valores de ECON son SUPUESTOS de trabajo: no hay precios validados en los briefs. */
/* ================= 1. MODELO ECONÓMICO ================= */
const ECON={
  PRECIO_PRO:14900,      /* COP/mes por miembro Premium. SUPUESTO. */
  FACTOR_NETO:0.70,      /* Lo que queda tras tienda de apps, pasarela e impuestos. SUPUESTO conservador. */
  CUOTA_CLUB:89000,      /* COP/mes del plan RodApp Club (perfil verificado, panel de asistencia, co-branding). SUPUESTO. */
  MIN_PREMIUM:10,        /* Mínimo de miembros Premium para activar cualquier descuento. */
  MIN_MIEMBROS_COPA:12,  /* Mínimo de miembros para competir en copas. */
  TOPE_COSTO:0.35,       /* El descuento nunca puede costar más del 35 % del ingreso neto que aportan los Premium del club. */
  TIERS:[{n:'Bronce',min:.20,pct:.10},{n:'Plata',min:.40,pct:.20},{n:'Oro',min:.60,pct:.30},{n:'Platino',min:.80,pct:.40}]
};
const cop=n=>'$'+Math.round(n).toLocaleString('es-CO');

/* Descuento de la cuota del club según el porcentaje de miembros Premium.
   Reglas: (1) sin 10 Premium no hay descuento; (2) el tramo sale del % Premium;
   (3) el tope de costo protege el margen: si el tramo cuesta más del 35 % del neto Premium, baja de 5 en 5 puntos. */
function clubDiscount(m,p){
  const E=ECON;m=Math.max(0,m|0);p=Math.max(0,Math.min(m,p|0));
  const ratio=m?p/m:0,neto=p*E.PRECIO_PRO*E.FACTOR_NETO;
  let t=-1;E.TIERS.forEach((x,i)=>{if(ratio>=x.min-1e-9)t=i});
  const locked=p<E.MIN_PREMIUM;
  let pct=(locked||t<0)?0:E.TIERS[t].pct;
  while(pct>0&&E.CUOTA_CLUB*pct>neto*E.TOPE_COSTO+1e-9)pct=Math.round((pct-.05)*100)/100;
  const capped=!locked&&t>=0&&pct<E.TIERS[t].pct;
  const nx=E.TIERS[t+1];
  const need=nx?Math.max(E.MIN_PREMIUM,Math.ceil(nx.min*m-1e-9))-p:0;
  const faltaMin=Math.max(0,E.MIN_PREMIUM-p);
  const costo=E.CUOTA_CLUB*pct;
  return{ratio,pct,tier:t>=0?E.TIERS[t]:null,locked,faltaMin,capped,next:nx||null,faltanNext:nx?Math.max(need,0):0,
    costo,neto,pago:E.CUOTA_CLUB-costo,ingreso:E.CUOTA_CLUB-costo+neto}}

/* Puntaje de una copa. No premia velocidad: premia asistir, completar rodadas y llegar sin incidentes. */
const clubPts=c=>c.rod*20+Math.round(c.km/20)+Math.round(c.asist*c.rod*10)+c.inc*15+Math.round(c.cal*10);
if(typeof module!=='undefined')module.exports={ECON,clubDiscount,clubPts};


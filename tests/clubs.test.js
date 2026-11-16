const {ECON,clubDiscount,clubPts}=require('../clubs-model.js');
let bad=0;const t=(c,m)=>{if(!c){bad++;console.log('FALLA',m)}};
for(let m=12;m<=200;m++){let prev=0;for(let p=0;p<=m;p++){const d=clubDiscount(m,p);
 t(d.costo<=d.neto*ECON.TOPE_COSTO+1e-6,`tope m=${m} p=${p}`);
 t(d.pct<=0.4,'maximo');t(p>=ECON.MIN_PREMIUM||d.pct===0,`minimo m=${m} p=${p}`);
 t(d.pct>=prev-1e-9,`monotono m=${m} p=${p}`);prev=d.pct;
 t(d.pago>=ECON.CUOTA_CLUB*0.6-1e-6,'pago minimo 60%')}}
console.log('halcones 9/24',clubDiscount(24,9).pct,'10/25',clubDiscount(25,10).pct,'platino 13/16',clubDiscount(16,13).pct);
console.log(bad?bad+' fallas':'OK: tope, mínimo, monotonía');process.exit(bad?1:0)

const {parseCedula}=require('../ocr.js');let bad=0;
const t=(n,c)=>{if(!c){bad++;console.log('FALLA',n)}};
// cédula amarilla con hologramas (texto típico de OCR)
let r=parseCedula(`REPÚBLICA DE COLOMBIA\nIDENTIFICACIÓN PERSONAL\nCÉDULA DE CIUDADANÍA\nNÚMERO 1.020.304.050\nAPELLIDOS\nCEDIEL RODRIGUEZ\nNOMBRES\nMAICOL ANDRÉS\nFECHA DE NACIMIENTO 12-MAR-1999`);
t('amarilla',r.ok&&r.numero==='1020304050'&&r.apellidos==='CEDIEL RODRIGUEZ'&&r.nombres==='MAICOL ANDRES'&&r.nombre==='MAICOL ANDRES CEDIEL RODRIGUEZ');
// cédula digital (NUIP, etiquetas en la misma línea)
r=parseCedula(`REPUBLICA DE COLOMBIA\nNUIP 79.123.456\nApellidos: PEREZ GOMEZ\nNombres: JUAN CARLOS\nFecha de nacimiento 01 ENE 1980`);
t('digital',r.ok&&r.numero==='79123456'&&r.apellidos==='PEREZ GOMEZ'&&r.nombres==='JUAN CARLOS');
// número en la línea siguiente
r=parseCedula(`NUMERO\n52.345.678\nAPELLIDOS\nRAMIREZ\nNOMBRES\nLAURA`);
t('numero abajo',r.ok&&r.numero==='52345678'&&r.nombre==='LAURA RAMIREZ');
// ruido: solo número legible
r=parseCedula(`xx 1.020.304.050 ###\nafsd`);
t('solo numero',!r.ok&&r.soloNumero&&r.numero==='1020304050');
// basura
r=parseCedula('');t('vacio',!r.ok&&!r.numero);
r=parseCedula('FECHA DE NACIMIENTO 12-03-1999 ESTATURA 1.75');t('no confunde estatura',!r.numero);
console.log(bad?bad+' fallas':'OK parser');process.exit(bad?1:0)

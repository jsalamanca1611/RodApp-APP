'use strict';
/* RodApp · lectura de la cédula por OCR (Tesseract.js, corre en el teléfono; la foto no se envía a terceros para leerla).
   parseCedula() es una función pura y se prueba con: node tests/ocr.test.js
   Límite importante: el OCR LEE texto, no VERIFICA autenticidad. Un documento falso bien impreso también se lee.
   La verificación real (documento + rostro + registro oficial) la hace un proveedor o una persona del equipo. */

const _sin=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'');
function parseCedula(texto){
  const L=_sin(texto).toUpperCase().replace(/[|_]/g,' ').split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
  const STOP=/FECHA|LUGAR|NACIMIENTO|ESTATURA|G\.?S\.?|SEXO|EXPEDICION|REPUBLICA|IDENTIFICACION|CEDULA|NUMERO|NUIP|APELLIDOS|NOMBRES|COLOMBIA|FIRMA|INDICE/;
  const soloNombre=l=>/^[A-Z][A-Z ñ'-]{1,40}$/.test(l)&&!STOP.test(l);
  /* número: junto a NUMERO/NUIP, o el primer grupo 1.234.567(.890) del documento */
  let numero=null;
  for(let i=0;i<L.length&&!numero;i++){
    if(/NUMERO|NUIP|NUMBER/.test(L[i])){
      const m=(L[i]+' '+(L[i+1]||'')).match(/\d{1,3}(?:[.,\s]\d{3}){1,3}|\d{6,10}/);if(m)numero=m[0].replace(/\D/g,'')}}
  if(!numero){const m=L.join(' ').match(/\b\d{1,3}(?:[.,]\d{3}){2,3}\b/);if(m)numero=m[0].replace(/\D/g,'')}
  if(numero&&(numero.length<6||numero.length>10))numero=null;
  /* nombres y apellidos: líneas debajo de la etiqueta, o en la misma línea tras ella */
  const tras=(re)=>{const i=L.findIndex(l=>re.test(l));if(i<0)return '';const mismo=L[i].replace(re,'').replace(/^[:\s]+/,'').trim();
    const out=[];if(mismo&&soloNombre(mismo))out.push(mismo);
    for(let j=i+1;j<L.length&&out.length<2;j++){if(soloNombre(L[j]))out.push(L[j]);else break}
    return out.join(' ')};
  const apellidos=tras(/^APELLIDOS?\b/),nombres=tras(/^NOMBRES?\b/);
  const ok=!!numero&&(apellidos.length>2||nombres.length>2);
  return{numero,apellidos,nombres,nombre:[nombres,apellidos].filter(Boolean).join(' '),ok,soloNumero:!!numero&&!ok}}
if(typeof module!=='undefined')module.exports={parseCedula};

const Ocr={w:null,
  async load(){if(this.w)return this.w;
    if(!window.Tesseract)await new Promise((ok,ko)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=ok;s.onerror=ko;document.head.appendChild(s)});
    this.w=await Tesseract.createWorker('spa');return this.w},
  /* blob = foto del frente. Devuelve parseCedula() o {ok:false,err}. Un stub en window.__OCR_STUB sirve para pruebas automáticas. */
  async read(blob){try{
      if(window.__OCR_STUB)return parseCedula(await window.__OCR_STUB(blob));
      const w=await this.load(),r=await w.recognize(blob);return parseCedula(r.data.text||'')}
    catch(e){return{ok:false,err:'ocr'}}}};

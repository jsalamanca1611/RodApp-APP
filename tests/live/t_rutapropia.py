import subprocess, time
from playwright.sync_api import sync_playwright
srv=[subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL),
     subprocess.Popen(['python3','tests/live/mock.py','8766'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)]
time.sleep(1.2)
ov="window.RODAPP_OVERRIDE={supabaseUrl:'http://127.0.0.1:8766',anonKey:'k',mapStyle:''};"
def boot(page,email,nombre,ced):
    page.goto('http://localhost:8765/index.html'); page.wait_for_timeout(500)
    page.evaluate("""async([e,n,c])=>{await RodAPI.signUp(e,'secreto1',{nombre:n,exp:'Intermedio'});
      await RodAPI.saveIdentity({nombre_legal:n,cedula:c,ocr_ok:true,editado:false,alt:false});
      await RodAPI.antecedentes({cedula:c});S.user={nombre:n,exp:'Intermedio'};newAccount();S.verStatus='ok';S.verified=true;go('home')}""",[email,nombre,ced])
ok=True
def chk(n,c):
    global ok; print(('PASS ' if c else 'FAIL ')+n); ok=ok and bool(c)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    A=b.new_context(viewport={'width':390,'height':780}).new_page(); A.on('pageerror',lambda e:print('PAGEERR',e)); A.add_init_script(ov)
    boot(A,'a@x.co','Ana Host','1010101010'); A.wait_for_timeout(800)
    A.evaluate("Object.assign(S.cr,{nombre:'Mi ruta',cc:'200–500',zona:'Norte',nivel:'Intermedio',fecha:FECHAS[1],hora:HORAS[3],cupo:4,custom:{coords:[[-74.05,4.7],[-74.04,4.71],[-74.03,4.72]],km:3,vias:[]},ruta:'custom',punto:'Inicio de tu ruta (marcado en el mapa)'});ACT.publish()"); A.wait_for_timeout(1200)
    chk('la rodada propia se publica con su ruta',A.evaluate("!!S.sel&&!!S.sel.cr&&S.sel.cr.length===3&&S.sel.km===3"))
    chk('el punto de encuentro es el inicio de la ruta',A.evaluate("Math.abs(spotOf(S.sel)[0]-4.7)<1e-6"))
    b.close()
finally:
  for x in srv: x.terminate()
print('OK' if ok else 'FALLAS')

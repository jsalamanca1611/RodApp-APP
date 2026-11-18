import subprocess, time
from playwright.sync_api import sync_playwright
srv=[subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL),
     subprocess.Popen(['python3','tests/live/mock.py','8766'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)]
time.sleep(1.2)
ok=True
def chk(n,c):
    global ok; print(('PASS ' if c else 'FAIL ')+n); ok=ok and bool(c)
def user(b,email,ced,identidad=True):
    pg=b.new_page(viewport={'width':390,'height':780}); pg.on('pageerror',lambda e:print('PAGEERR',e))
    pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'http://127.0.0.1:8766',anonKey:'k',mapStyle:''};")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("""async([e,c,i])=>{await RodAPI.signUp(e,'secreto1',{nombre:'Pendiente Uno',exp:'Intermedio'});
      if(i)await RodAPI.saveIdentity({nombre_legal:'Pendiente Uno',cedula:c,ocr_ok:true,editado:false,alt:false});
      S.user={nombre:'Pendiente Uno',exp:'Intermedio'};newAccount();S.verStatus='pending';go('home')}""",[email,ced,identidad])
    pg.wait_for_timeout(1500); return pg
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    # 1) cuenta pendiente por fallo de red, pero con cédula guardada: se verifica sola y se une
    pg=user(b,'p1@x.co','1112223334',True)
    rid=pg.evaluate("S.rides.find(r=>r.oficial).id")
    pg.evaluate(f"ACT.open({{id:{rid}}});ACT.join()"); pg.wait_for_timeout(2500)
    chk('pendiente con cédula: se reverifica y entra a la rodada',pg.evaluate("S.screen")=='lobby' and pg.evaluate("S.verStatus")=='ok')
    # 2) cuenta sin identidad: mensaje claro, no el genérico
    pg2=user(b,'p2@x.co','9998887776',False)
    rid=pg2.evaluate("S.rides.find(r=>r.oficial).id")
    pg2.evaluate(f"ACT.open({{id:{rid}}});ACT.join()"); pg2.wait_for_timeout(2500)
    chk('sin identidad: no entra y dice qué falta',pg2.evaluate("S.screen")!='lobby' and 'Falta completar tu verificación' in pg2.evaluate("document.querySelector('#toast').innerText"))
    b.close()
finally:
  for s in srv: s.terminate()
print('OK' if ok else 'FALLAS')

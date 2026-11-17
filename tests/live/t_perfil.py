import subprocess, time
from playwright.sync_api import sync_playwright
srv=[subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL),
     subprocess.Popen(['python3','tests/live/mock.py','8766'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)]
time.sleep(1.2)
ok=True
def chk(n,c):
    global ok; print(('PASS ' if c else 'FAIL ')+n); ok=ok and bool(c)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':800}); pg.on('pageerror',lambda e:print('PAGEERR',e))
    pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'http://127.0.0.1:8766',anonKey:'k',mapStyle:''};")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("RodAPI.signUp('amigo@x.co','secreto1',{nombre:'Amigo Rider',exp:'Intermedio'})"); pg.wait_for_timeout(300)
    pg.evaluate("S.user={nombre:'Amigo Rider',exp:'Intermedio'};S.veh={cc:'<200',tipo:'Trail',marca:'AKT',placa:'ABC12D',bt:false};S.screen='veh'")
    pg.evaluate("ACT.vehNext()"); pg.wait_for_timeout(800)
    chk('registro de la moto se guarda y avanza',pg.evaluate("S.screen")=='done')
    pr=pg.evaluate("RodAPI.profile()")
    chk('el perfil quedó con cc, marca y placa',pr and pr['cc']=='<200' and pr['marca']=='AKT' and pr['placa']=='ABC12D')
    b.close()
finally:
  for s in srv: s.terminate()
print('OK' if ok else 'FALLAS')

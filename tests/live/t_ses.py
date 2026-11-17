import subprocess, time
from playwright.sync_api import sync_playwright
srv=[subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL),subprocess.Popen(['python3','tests/live/mock.py','8766'])]
time.sleep(1.2)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_context(viewport={'width':390,'height':780}).new_page(); pg.on('pageerror',lambda e:print('ERR',e))
    pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'http://127.0.0.1:8766',anonKey:'k',mapStyle:''};")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("RodAPI.signUp('s@x.co','secreto1',{nombre:'Sara Prueba',exp:'Avanzado'})"); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(1500)
    print('tras recargar:',pg.evaluate("S.screen"),pg.evaluate("S.user&&S.user.nombre"))
    pg.evaluate("go('perfil')"); pg.evaluate("ACT.go({to:'splash'})"); pg.wait_for_timeout(300)
    print('tras cerrar sesión:',pg.evaluate("S.screen"),pg.evaluate("!!RodAPI.session()"),pg.evaluate("localStorage.getItem('rodapp.ses')"))
    pg.reload(); pg.wait_for_timeout(1200); print('recarga sin sesión:',pg.evaluate("S.screen"))
    b.close()
finally:
  for s in srv: s.terminate()

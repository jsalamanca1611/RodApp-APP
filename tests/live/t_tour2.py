import subprocess, time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':800}); pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'',anonKey:''}"); pg.on('pageerror',lambda e:print('PAGEERR',e))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    pg.evaluate("ACT.login()"); pg.wait_for_function("Tour.active",timeout=5000); pg.wait_for_timeout(400)
    pg.screenshot(path='tw0.png')
    for i in range(3): pg.evaluate("Tour.next()"); pg.wait_for_timeout(400)
    pg.screenshot(path='tw3.png'); b.close()
finally: srv.terminate()

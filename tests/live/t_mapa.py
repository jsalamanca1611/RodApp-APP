import subprocess, time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=True
def chk(n,c):
    global ok; print(('PASS ' if c else 'FAIL ')+n); ok=ok and bool(c)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']); ctx=b.new_context(viewport={'width':390,'height':800},geolocation={'latitude':4.7536,'longitude':-74.0458},permissions=['geolocation'])
    pg=ctx.new_page(); pg.on('pageerror',lambda e:print('PAGEERR',e))
    reqs=[]; pg.on('request',lambda r:reqs.append(r.url))
    pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'',anonKey:''};")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("ACT.login();Tour.stop()"); pg.wait_for_timeout(600); pg.evaluate("Tour.stop()")
    pg.evaluate("ACT.open({id:1})"); pg.evaluate("ACT.join()"); pg.wait_for_timeout(1200)
    pg.evaluate("go('mapa')"); pg.wait_for_timeout(2500)
    chk('sin compartir ya hay mapa (no pantalla vacía)',pg.evaluate("!!document.querySelector('#mapbox canvas, #mapbox svg')"))
    chk('maplibre se carga desde la app, no del CDN',any('assets/vendor/maplibre-gl.js' in u for u in reqs) and not any('jsdelivr' in u and 'maplibre' in u for u in reqs))
    chk('maplibre disponible',pg.evaluate("!!window.maplibregl"))
    pg.screenshot(path='mapa_antes.png')
    pg.wait_for_timeout(11000)   # el sandbox no llega a los mosaicos: debe caer al esquema SVG
    chk('si los mosaicos no cargan, cae al esquema SVG',pg.evaluate("!!document.querySelector('#mapbox svg')"))
    chk('el esquema muestra Encuentro y compañeros',pg.evaluate("document.querySelector('#mapbox').innerText.includes('Encuentro')"))
    pg.screenshot(path='mapa_fallback.png')
    pg.evaluate("ACT.locAllow()"); pg.wait_for_timeout(2500)
    chk('compartir ubicación funciona y muestra "Tú"',pg.evaluate("Live.sharing&&!!document.querySelector('#mapbox')"))
    b.close()
finally: srv.terminate()
print('OK' if ok else 'FALLAS')

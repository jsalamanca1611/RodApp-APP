import subprocess, time, json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=True
def chk(n,c):
    global ok; print(('PASS ' if c else 'FAIL ')+n); ok=ok and bool(c)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx=b.new_context(viewport={'width':390,'height':800},geolocation={'latitude':4.7447,'longitude':-73.9967},permissions=['geolocation']); pg=ctx.new_page()
    pg.on('pageerror',lambda e:print('PAGEERR',e)); hits=[]
    pg.on('request',lambda r:hits.append(r.url))
    cc=[[-73.9967+i*0.002,4.7447+i*0.0012] for i in range(60)]
    pg.route('**/router.project-osrm.org/**',lambda r:r.fulfill(body=json.dumps({'routes':[{'geometry':{'coordinates':cc}}]}),content_type='application/json',headers={'access-control-allow-origin':'*'}))
    pg.route('**/tiles.openfreemap.org/styles/liberty',lambda r:r.fulfill(body=json.dumps({'version':8,'sources':{'o':{'type':'raster','tiles':['https://t.test/{z}/{x}/{y}.png'],'tileSize':256}},'layers':[{'id':'o','type':'raster','source':'o'}]}),content_type='application/json',headers={'access-control-allow-origin':'*'}))
    pg.route('**/t.test/**',lambda r:r.fulfill(path='/tmp/tile.png',content_type='image/png',headers={'access-control-allow-origin':'*'}))
    pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'',anonKey:''};")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("ACT.login();Tour.stop()"); pg.wait_for_timeout(600); pg.evaluate("Tour.stop()")
    pg.evaluate("ACT.open({id:1})"); pg.wait_for_timeout(3500)
    chk('la ficha pide la ruta real por calles (OSRM)',any('router.project-osrm.org' in u for u in hits))
    chk('la ficha muestra un mapa real (no la vista decorativa)',pg.evaluate("!!document.querySelector('#rhero canvas')"))
    chk('la ruta está trazada en el mapa',pg.evaluate("(()=>{const m=window.__m;return true})()") and pg.evaluate("RouteMap.mem[0].length")==60)
    chk('hay enlace a Google Maps con la ruta',pg.evaluate("document.querySelector('.rgm').href.includes('google.com/maps/dir')"))
    pg.screenshot(path='/tmp/ruta_hero.png')
    pg.evaluate("ACT.join()"); pg.wait_for_timeout(800); pg.evaluate("go('mapa');ACT.locAllow()"); pg.wait_for_timeout(4000)
    chk('el mapa del grupo también dibuja la ruta',pg.evaluate("!!MapKit.map&&!!MapKit.map.getLayer('ruta-l')"))
    pg.screenshot(path='/tmp/ruta_grupo.png')
    b.close()
finally: srv.terminate()
print('OK' if ok else 'FALLAS')

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
    pg.on('pageerror',lambda e:print('PAGEERR',e))
    cc=[[-73.9967+i*0.0008,4.7447+i*0.0005] for i in range(120)]
    pg.route('**/router.project-osrm.org/**',lambda r:r.fulfill(body=json.dumps({'routes':[{'geometry':{'coordinates':cc}}]}),content_type='application/json',headers={'access-control-allow-origin':'*'}))
    pg.route('**/tiles.openfreemap.org/styles/liberty',lambda r:r.fulfill(body=json.dumps({'version':8,'sources':{'o':{'type':'raster','tiles':['https://t.test/{z}/{x}/{y}.png'],'tileSize':256}},'layers':[{'id':'o','type':'raster','source':'o'}]}),content_type='application/json',headers={'access-control-allow-origin':'*'}))
    pg.route('**/t.test/**',lambda r:r.fulfill(path='/tmp/tile.png',content_type='image/png',headers={'access-control-allow-origin':'*'}))
    pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'',anonKey:''};")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("ACT.login();Tour.stop()"); pg.wait_for_timeout(600); pg.evaluate("Tour.stop()")
    pg.evaluate("S.sel={id:1,rt:0,sim:true};S.micOk=true;startRun();go('hud')"); pg.wait_for_timeout(4000)
    chk('el HUD muestra mapa real',pg.evaluate("!!document.querySelector('#hmap canvas')"))
    chk('hay marcadores de los 5 pilotos',pg.evaluate("Object.keys(HudMap.mk).length")==5)
    b0=pg.evaluate("HudMap.map.getBearing()"); c0=pg.evaluate("HudMap.map.getCenter().lng"); pg.wait_for_timeout(3000)
    c1=pg.evaluate("HudMap.map.getCenter().lng")
    chk('la cámara te sigue',c1!=c0)
    pg.screenshot(path='/tmp/hudmap.png')
    pg.evaluate("go('inicio')"); pg.wait_for_timeout(300)
    chk('al salir se libera el mapa',pg.evaluate("HudMap.map===null"))
    b.close()
finally: srv.terminate()
print('OK' if ok else 'FALLAS')

import subprocess, time, json
from playwright.sync_api import sync_playwright
srv=[subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL),
     subprocess.Popen(['python3','tests/live/mock.py','8766'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)]
time.sleep(1.2)
ov="window.RODAPP_OVERRIDE={supabaseUrl:'http://127.0.0.1:8766',anonKey:'k',mapStyle:'liberty'};"
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
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx=b.new_context(viewport={'width':390,'height':780}); A=ctx.new_page()
    A.on('pageerror',lambda e:print('PAGEERR',e)); A.add_init_script(ov)
    cc=[[-73.9967+i*0.0004,4.7447+i*0.0002+(0.0004 if i%7<3 else 0)] for i in range(200)]
    A.route('**/router.project-osrm.org/**',lambda r:r.fulfill(body=json.dumps({'routes':[{'geometry':{'coordinates':cc}}]}),content_type='application/json',headers={'access-control-allow-origin':'*'}))
    A.route('**/tiles.openfreemap.org/styles/liberty',lambda r:r.fulfill(body=json.dumps({'version':8,'sources':{'o':{'type':'raster','tiles':['https://t.test/{z}/{x}/{y}.png'],'tileSize':256}},'layers':[{'id':'o','type':'raster','source':'o'}]}),content_type='application/json',headers={'access-control-allow-origin':'*'}))
    A.route('**/t.test/**',lambda r:r.fulfill(path='/tmp/tile.png',content_type='image/png',headers={'access-control-allow-origin':'*'}))
    boot(A,'a@x.co','Ana Host','1010101010'); A.wait_for_timeout(1500)
    A.evaluate("S.consent.ubic=true;ACT.open({id:S.rides[0].id});ACT.join()"); A.wait_for_timeout(1500)
    A.evaluate("ACT.hostStart()"); A.wait_for_timeout(2500)
    chk('camino al punto: mapa real (no esquema)',A.evaluate("!!document.querySelector('#nmap canvas')&&S.screen==='enroute'"))
    A.screenshot(path='/tmp/nav_enroute.png')
    A.evaluate("ACT.micAsk&&ACT.micAsk()"); A.wait_for_timeout(500)
    A.evaluate("S.micOk=true;startRun();go('hud')"); A.wait_for_timeout(3500)
    chk('modo manejo: mapa real que sigue la ruta',A.evaluate("!!document.querySelector('.hudmap.nav #nmap canvas')&&S.screen==='hud'"))
    p1=A.evaluate("Live.me.slice(0,2)"); A.wait_for_timeout(4000); p2=A.evaluate("Live.me.slice(0,2)")
    chk('en la prueba tu punto recorre la ruta solo',p1!=p2)
    chk('la cámara está cerca y sigue tu rumbo',A.evaluate("NavMap.map.getZoom()>16.5&&NavMap.map.getPitch()>40"))
    A.screenshot(path='/tmp/nav_hud.png',clip={'x':120,'y':200,'width':150,'height':130})
    b.close()
finally:
  for x in srv: x.terminate()
print('OK' if ok else 'FALLAS')

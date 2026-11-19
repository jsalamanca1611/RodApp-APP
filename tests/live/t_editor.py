import subprocess, time, json, re
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=True
def chk(n,c):
    global ok; print(('PASS ' if c else 'FAIL ')+n); ok=ok and bool(c)
urls=[]
def osrm(r):
    u=r.request.url; urls.append(u)
    pts=[tuple(map(float,x.split(','))) for x in re.search(r'driving/([^?]+)',u).group(1).split(';')]
    c=[]
    for (a,b) in zip(pts,pts[1:]):
        for i in range(40): c.append([a[0]+(b[0]-a[0])*i/40,a[1]+(b[1]-a[1])*i/40])
    c.append(list(pts[-1]))
    r.fulfill(body=json.dumps({'routes':[{'geometry':{'coordinates':c}}]}),content_type='application/json',headers={'access-control-allow-origin':'*'})
try:
  with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=b.new_context(viewport={'width':390,'height':800}).new_page()
    pg.on('pageerror',lambda e:print('PAGEERR',e))
    pg.route('**/router.project-osrm.org/**',osrm)
    pg.route('**/tiles.openfreemap.org/styles/liberty',lambda r:r.fulfill(body=json.dumps({'version':8,'sources':{'o':{'type':'raster','tiles':['https://t.test/{z}/{x}/{y}.png'],'tileSize':256}},'layers':[{'id':'o','type':'raster','source':'o'}]}),content_type='application/json',headers={'access-control-allow-origin':'*'}))
    pg.route('**/t.test/**',lambda r:r.fulfill(path='/tmp/tile.png',content_type='image/png',headers={'access-control-allow-origin':'*'}))
    pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'',anonKey:''};")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("ACT.login();Tour.stop()"); pg.wait_for_timeout(600); pg.evaluate("Tour.stop()")
    pg.evaluate("go('crear')"); pg.wait_for_timeout(300)
    chk('crear ofrece dibujar la ruta propia antes de las sugeridas',pg.evaluate("document.querySelector('[data-act=reNew]')!==null"))
    pg.evaluate("ACT.reNew()"); pg.wait_for_timeout(2500)
    box=pg.evaluate("(()=>{const r=document.getElementById('remap').getBoundingClientRect();return[r.x,r.y,r.width,r.height]})()")
    cx,cy=box[0]+box[2]/2,box[1]+box[3]/2
    pg.mouse.click(cx-100,cy+60); pg.wait_for_timeout(400)
    pg.mouse.click(cx+100,cy-60); pg.wait_for_timeout(1500)
    chk('pone inicio y destino y traza la ruta',pg.evaluate("!!RE.a&&!!RE.b&&RE.c&&RE.c.length>40"))
    n0=len(urls)
    # arrastrar la línea por su punto medio
    mid=pg.evaluate("(()=>{const q=RE.map.project(RE.c[Math.floor(RE.c.length/2)]);const r=document.getElementById('remap').getBoundingClientRect();return[r.x+q.x,r.y+q.y]})()")
    pg.mouse.move(mid[0],mid[1]); pg.mouse.down(); pg.mouse.move(mid[0]+10,mid[1]+40,steps=4); pg.mouse.move(mid[0]+20,mid[1]+90,steps=6)
    pre=pg.evaluate("RE.map.getSource('re')._data.geometry.coordinates.length")
    pg.mouse.up(); pg.wait_for_timeout(1500)
    chk('arrastrar la línea agrega un punto de paso y re-traza',pg.evaluate("RE.vias.length")==1 and len(urls)>n0 and urls[-1].count(';')==2)
    pg.screenshot(path='/tmp/editor.png')
    pg.evaluate("ACT.reUse()"); pg.wait_for_timeout(500)
    chk('usar la ruta la guarda en el formulario',pg.evaluate("S.screen==='crear'&&S.cr.custom&&S.cr.custom.coords.length>40&&S.cr.ruta==='custom'"))
    chk('el formulario muestra la ruta propia',pg.evaluate("document.body.innerText.includes('Ruta propia')"))
    b.close()
finally: srv.terminate()
print('OK' if ok else 'FALLAS')

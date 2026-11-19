import subprocess, time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=True
def chk(n,c):
    global ok; print(('PASS ' if c else 'FAIL ')+n); ok=ok and bool(c)
FAKE="""(()=>{let n=0;const g={getCurrentPosition(){},clearWatch(){},watchPosition(s,e,o){n++;
  if(n===1){setTimeout(()=>e({code:3}),300)}            // 1.º intento (alta precisión): se agota
  else{setTimeout(()=>s({coords:{latitude:4.6097,longitude:-74.0817,accuracy:18,heading:90,speed:5}}),300);setInterval(()=>s({coords:{latitude:4.6097,longitude:-74.0817,accuracy:18,heading:90,speed:5}}),1000)}
  return n}};Object.defineProperty(navigator,'geolocation',{value:g,configurable:true});window.__n=()=>n})();"""
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    for live in (False,True):
      ctx=b.new_context(viewport={'width':390,'height':800}); pg=ctx.new_page(); pg.on('pageerror',lambda e:print('PAGEERR',e))
      ov="{supabaseUrl:'https://x.invalid',anonKey:'k',mapStyle:''}" if live else "{supabaseUrl:'',anonKey:'',mapStyle:''}"
      pg.add_init_script("window.RODAPP_OVERRIDE="+ov+";"+FAKE)
      pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
      pg.evaluate("ACT.login();Tour.stop()"); pg.wait_for_timeout(800); pg.evaluate("Tour.stop()")
      pg.evaluate("S.sel={id:1,name:'x',punto:SPOTS[0],zona:'Norte',part:[],pp:[],rt:0};S.consent.ubic=true;go('mapa')"); pg.wait_for_timeout(300)
      pg.evaluate("Live.start()"); pg.wait_for_timeout(1500)
      tag='live' if live else 'demo'
      chk(tag+': reintenta con ubicación por red tras agotarse el GPS',pg.evaluate("window.__n()")>=2)
      chk(tag+': usa la ubicación REAL y no la de ejemplo',pg.evaluate("Live.simMe!==true&&Math.abs(Live.me[0]-4.6097)<1e-6"))
      chk(tag+': guarda la precisión',pg.evaluate("Live.me[5]===18"))
      ctx.close()
    # en modo real, si el GPS falla del todo no se inventa posición
    ctx=b.new_context(viewport={'width':390,'height':800}); pg=ctx.new_page()
    pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'https://x.invalid',anonKey:'k',mapStyle:''};Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(){},clearWatch(){},watchPosition(s,e){setTimeout(()=>e({code:1}),200);return 1}},configurable:true});")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("ACT.login();Tour.stop()"); pg.wait_for_timeout(800); pg.evaluate("Tour.stop()")
    pg.evaluate("S.sel={id:1,name:'x',punto:SPOTS[0],zona:'Norte',part:[],pp:[],rt:0};S.consent.ubic=true;go('mapa')"); pg.wait_for_timeout(300)
    pg.evaluate("Live.start()"); pg.wait_for_timeout(1200)
    chk('real: GPS denegado → no se inventa tu posición',pg.evaluate("Live.me===null&&!Live.simMe&&Live.err==='denegado'"))
    b.close()
finally: srv.terminate()
print('OK' if ok else 'FALLAS')

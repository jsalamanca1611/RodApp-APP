import subprocess, time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=True
def chk(n,c):
    global ok; print(('PASS ' if c else 'FAIL ')+n); ok=ok and bool(c)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':800},geolocation={'latitude':4.7536,'longitude':-74.0458},permissions=['geolocation'])
    pg=ctx.new_page(); pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'',anonKey:'',mapStyle:''};window.__off=0;const _n=Date.now.bind(Date);Date.now=()=>_n()+window.__off;")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("ACT.login();Tour.stop()"); pg.wait_for_timeout(600); pg.evaluate("Tour.stop()")
    pg.evaluate("ACT.open({id:1})"); pg.evaluate("ACT.join()"); pg.wait_for_timeout(1500)
    chk('en lobby',pg.evaluate("S.screen")=='lobby')
    # al inicio: nadie está en el punto
    chk('nadie llegó al inicio',pg.evaluate("S.lobby.ppl.filter(p=>p.st==='ready').length")==0)
    pg.evaluate("go('mapa')"); pg.evaluate("ACT.locAllow()"); pg.wait_for_timeout(2500)
    pe=pg.evaluate("Object.values(Live.peers).map(q=>q.ll)")
    ds=pg.evaluate("(()=>{const p0=SPOT_LL[SPOTS.indexOf(S.sel.punto)];return Object.values(Live.peers).map(q=>Math.round(hav(q.ll,p0)))})()")
    print('distancias m',ds)
    chk('bots a 1-2 km y en puntos distintos',len(pe)>=3 and min(ds)>400 and len(set(map(tuple,pe)))==len(pe))
    pg.evaluate("go('lobby')"); pg.wait_for_timeout(1300)
    ms=[]
    for off in (40,120,200,280,360,460,560,700):
        pg.evaluate(f"window.__off={off*1000}"); pg.wait_for_timeout(1400)
    msgs=pg.evaluate("S.lobby.msgs.map(m=>m.n+': '+m.t)")
    print('\n'.join(msgs))
    chk('hay mensajes variados de varios bots',len(set(m.split(':')[0] for m in msgs))>=3 and len(msgs)>=8)
    chk('avisan ya llegué/casi llego',any('llegu' in m.lower() or 'casi' in m.lower() or 'Presente' in m or 'Aquí estoy' in m for m in msgs))
    chk('todos llegaron al final',pg.evaluate("S.lobby.ppl.filter(p=>p.n!=='Tú'&&p.st==='ready').length")==pg.evaluate("S.lobby.ppl.length-1"))
    pg.evaluate("ACT.ready()"); pg.wait_for_timeout(2500)
    chk('la rodada arranca tras estar listo',pg.evaluate("S.lobby.started")==True)
    pg.fill('#cin','Ya voy saliendo') if False else None
    pg.screenshot(path='bots_lobby.png')
    b.close()
finally: srv.terminate()
print('OK' if ok else 'FALLAS')

import subprocess, time
from playwright.sync_api import sync_playwright
srv=[subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL),
     subprocess.Popen(['python3','tests/live/mock.py','8766'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)]
time.sleep(1.2)
ov="window.RODAPP_OVERRIDE={supabaseUrl:'http://127.0.0.1:8766',anonKey:'k',mapStyle:''};"
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
    b=p.chromium.launch()
    mk=lambda lat,lng:b.new_context(viewport={'width':390,'height':780},geolocation={'latitude':lat,'longitude':lng},permissions=['geolocation'])
    A,B=mk(4.7536,-74.0458).new_page(),mk(4.7600,-74.0400).new_page()
    for pg,n in((A,'A'),(B,'B')): pg.on('pageerror',lambda e,n=n:print('PAGEERR',n,e)); pg.add_init_script(ov)
    boot(A,'a@x.co','Ana Host','1010101010'); boot(B,'b@x.co','Beto Rider','2020202020')
    A.evaluate("Object.assign(S.cr,{nombre:'Recip',ruta:0,cc:'200–500',zona:'Calera',nivel:'Intermedio',fecha:FECHAS[1],hora:HORAS[3],cupo:4,punto:SPOTS[1]});ACT.publish()"); A.wait_for_timeout(900)
    B.evaluate("go('home')"); B.wait_for_timeout(1200)
    B.evaluate("ACT.open({id:S.rides.find(r=>!r.sim).id});ACT.join()"); B.wait_for_timeout(1500)
    chk('B ve a A en la lista de personas',B.evaluate("S.lobby.ppl.length")==2 and 'Rodada n.º' in B.evaluate("document.querySelector('#lsync').innerText"))
    A.evaluate("S.consent.ubic=true;go('mapa');ACT.locStart()"); A.wait_for_timeout(2500)
    chk('A comparte y ve el mapa',A.evaluate("Live.canSee()&&!!document.querySelector('#mapbox')"))
    B.evaluate("go('mapa')"); B.wait_for_timeout(2500)
    chk('B no comparte: ve la puerta y no recibe a A',B.evaluate("!!document.querySelector('.gate')&&Object.keys(Live.peers).length===0"))
    B.evaluate("S.consent.ubic=true;ACT.locStart()"); B.wait_for_timeout(6500)
    print('DBG',B.evaluate("[Live.sharing,!!Live.me,Live.canSee(),!!document.querySelector('#mapbox'),!!document.querySelector('.gate'),JSON.stringify(Live.peers)]"))
    chk('B comparte: aparece el mapa y ve a A',B.evaluate("!!document.querySelector('#mapbox')&&Object.values(Live.peers).some(q=>q.n.startsWith('Ana'))"))
    A.wait_for_timeout(3000)
    chk('A ve a B',A.evaluate("Object.values(Live.peers).some(q=>q.n.startsWith('Beto'))"))
    b.close()
finally:
  for s in srv: s.terminate()
print('OK' if ok else 'FALLAS')

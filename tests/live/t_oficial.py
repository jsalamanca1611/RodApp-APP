import subprocess, time
from playwright.sync_api import sync_playwright
srv=[subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL),
     subprocess.Popen(['python3','tests/live/mock.py','8766'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)]
time.sleep(1.2)
ov="window.RODAPP_OVERRIDE={supabaseUrl:'http://127.0.0.1:8766',anonKey:'k',mapStyle:'',rodadasEjemplo:false};"
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
    boot(A,'a@x.co','Ana Lider','1010101010'); boot(B,'b@x.co','Beto Rider','2020202020')
    A.wait_for_timeout(1500); B.wait_for_timeout(1500)
    chk('solo hay UNA rodada de prueba (real): RodApp prueba',A.evaluate("S.rides.filter(r=>r.demo||r.sim).map(r=>r.name)")==['RodApp prueba'] and A.evaluate("S.rides[0].demo"))
    chk('A y B ven las rodadas oficiales sembradas',A.evaluate("S.rides.filter(r=>r.oficial&&!r.demo).length")==2 and B.evaluate("S.rides.filter(r=>r.oficial&&!r.demo).length")==2)
    chk('las tarjetas: oficiales y demostración',"Rodada oficial" in A.evaluate("document.querySelector('#screen').innerText") and "Prueba real" in A.evaluate("document.querySelector('#screen').innerText"))
    A.evaluate("ACT.open({id:S.rides.find(r=>r.demo).id});ACT.join()"); A.wait_for_timeout(2000)
    chk('la prueba real abre su sala',A.evaluate("S.screen")=='lobby' and A.evaluate("S.lobby.ppl.length")>=1)
    A.evaluate("ACT.leave()"); A.wait_for_timeout(800)
    rid=A.evaluate("S.rides.find(r=>r.oficial&&!r.demo).id")
    A.evaluate(f"ACT.open({{id:{rid}}});ACT.join()"); A.wait_for_timeout(1200)
    B.evaluate(f"go('home')"); B.wait_for_timeout(500)
    B.evaluate(f"ACT.open({{id:{rid}}});ACT.join()"); B.wait_for_timeout(2500)
    chk('B se une y ve a A en la sala',B.evaluate("S.lobby.ppl.length")==2)
    A.wait_for_timeout(2500)
    chk('A ve a B en la sala',A.evaluate("S.lobby.ppl.length")==2)
    chk('A (primero en unirse) es el líder y puede iniciar',A.evaluate("S.lobby.host===true&&!!document.querySelector('[data-act=hostStart]')"))
    chk('B no es líder',B.evaluate("S.lobby.host===false&&!document.querySelector('[data-act=hostStart]')"))
    chk('el líder no puede "Cancelar" una rodada oficial',A.evaluate("document.querySelector('[data-act=leave]').innerText.trim()")=='Salir')
    A.evaluate("ACT.hostStart()"); B.wait_for_timeout(3500)
    chk('al iniciar A, B recibe el inicio',B.evaluate("S.lobby.started===true"))
    # A sale: la rodada sigue y B pasa a liderar
    A.evaluate("ACT.leave()"); A.wait_for_timeout(1500)
    B.wait_for_timeout(2500)
    chk('la rodada oficial sigue existiendo tras salir el líder',len(B.evaluate("RodAPI.rest('/rides?id=eq.%d&select=id')"%rid))==1)
    chk('B pasa a ser el líder',B.evaluate("S.sel.host==='Tú'"))
    b.close()
finally:
  for s in srv: s.terminate()
print('OK' if ok else 'FALLAS')

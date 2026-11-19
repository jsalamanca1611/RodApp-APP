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
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    A,B=b.new_context(viewport={'width':390,'height':780}).new_page(),b.new_context(viewport={'width':390,'height':780}).new_page()
    for pg,n in((A,'A'),(B,'B')): pg.on('pageerror',lambda e,n=n:print('PAGEERR',n,e)); pg.add_init_script(ov)
    boot(A,'a@x.co','Ana Host','1010101010'); boot(B,'b@x.co','Beto Rider','2020202020')
    A.wait_for_timeout(1500); B.wait_for_timeout(1500)
    chk('la prueba real va primero y es real (no sim)',A.evaluate("S.rides[0].name==='RodApp prueba'&&S.rides[0].demo&&!S.rides[0].sim"))
    for pg in(A,B): pg.evaluate("ACT.open({id:S.rides[0].id});ACT.join()"); pg.wait_for_timeout(1500)
    chk('A y B están en la sala de la prueba',A.evaluate("S.screen")=='lobby' and B.evaluate("S.lobby.ppl.length")==2)
    A.evaluate("go('perfil')"); A.wait_for_timeout(300); A.evaluate("go('home')"); A.wait_for_timeout(500)
    chk('Inicio lleva directo a la sala de la rodada activa',A.evaluate("S.screen")=='lobby')
    chk('la sala trae las secciones plegables',A.evaluate("!!document.querySelector('.lsech[data-k=ppl]')&&!!document.querySelector('.lsech[data-k=chat]')"))
    A.evaluate("document.querySelector('.lsech[data-k=chat]').click()")
    chk('el chat se puede esconder',A.evaluate("document.getElementById('sec_chat').hidden"))
    A.evaluate("document.querySelector('.lsech[data-k=chat]').click()")
    A.evaluate("const i=document.getElementById('cin');i.value='hola desde A';document.getElementById('cform').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))"); B.wait_for_timeout(2600)
    chk('B recibe el mensaje de A en tiempo real',B.evaluate("S.lobby.msgs.some(m=>/hola desde A/.test(m.t))"))
    chk('sin compartir ubicación no hay mapa, solo el botón',A.evaluate("!document.querySelector('#mapbox')&&!!document.querySelector('[data-act=lmap]')"))
    for pg in(A,B): pg.evaluate("S.consent.ubic=true;ACT.lmap()"); pg.wait_for_timeout(2500)
    chk('el mapa aparece dentro de la sala',A.evaluate("!!document.querySelector('#lmapsec #mapbox')&&S.screen==='lobby'"))
    A.wait_for_timeout(3500)
    chk('A ve a B en el mapa (ubicación simulada compartida)',A.evaluate("Object.keys(Live.peers).length")==1)
    chk('B ve a A',B.evaluate("Object.keys(Live.peers).length")==1)
    A.evaluate("ACT.hostStart()"); A.wait_for_timeout(800)
    A.evaluate("S.sel.km=6;awardRide()"); A.wait_for_timeout(600)
    chk('la rodada terminada queda en el historial del servidor',A.evaluate("RodAPI.rest('/rpc/mi_resumen','POST',{}).then(j=>j.hist.length===1&&j.hist[0].nombre==='RodApp prueba')"))
    b.close()
finally:
  for x in srv: x.terminate()
print('OK' if ok else 'FALLAS')

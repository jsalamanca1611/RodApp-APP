import subprocess, time, json, sys
from playwright.sync_api import sync_playwright
srv=[subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL),
     subprocess.Popen(['python3','tests/live/mock.py','8766'])]
time.sleep(1.2)
ov="window.RODAPP_OVERRIDE={supabaseUrl:'http://127.0.0.1:8766',anonKey:'k',mapStyle:'',rodadasEjemplo:true};"
def boot(page,email,nombre,ced):
    page.goto('http://localhost:8765/index.html'); page.wait_for_timeout(500)
    page.evaluate("""async([e,n,c])=>{await RodAPI.signUp(e,'secreto1',{nombre:n,exp:'Intermedio'});
      await RodAPI.saveIdentity({nombre_legal:n,cedula:c,ocr_ok:true,editado:false,alt:false});
      const r=await RodAPI.antecedentes({cedula:c});S.user={nombre:n,exp:'Intermedio'};newAccount();S.verStatus='ok';S.verified=true;S.consent.ubic=true;go('home');return r}""",[email,nombre,ced])
ok=True
def chk(name,cond):
    global ok; print(('PASS ' if cond else 'FAIL ')+name); ok=ok and bool(cond)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-ui-for-media-stream'])
    mk=lambda lat,lng:b.new_context(viewport={'width':390,'height':780},geolocation={'latitude':lat,'longitude':lng},permissions=['geolocation'])
    ca,cb=mk(4.7536,-74.0458),mk(4.7600,-74.0400)
    A,B=ca.new_page(),cb.new_page()
    for pg,n in((A,'A'),(B,'B')): pg.on('pageerror',lambda e,n=n:print('PAGEERR',n,e)); pg.add_init_script(ov)
    boot(A,'a@x.co','Ana Host','1010101010'); boot(B,'b@x.co','Beto Rider','2020202020')
    chk('A solo ve rodadas de ejemplo (sim), ninguna real',A.evaluate("S.rides.filter(r=>!r.sim&&!r.oficial).length")==0 and A.evaluate("S.rides.length")>0)
    A.evaluate("Object.assign(S.cr,{nombre:'Prueba real',ruta:0,cc:'200–500',zona:'Calera',nivel:'Intermedio',fecha:FECHAS[1],hora:HORAS[3],cupo:4,punto:SPOTS[1]})")
    A.evaluate("ACT.publish()"); A.wait_for_timeout(800)
    chk('A en lobby tras publicar',A.evaluate("S.screen")=='lobby')
    chk('A aparece como participante único',A.evaluate("S.lobby.ppl.map(p=>p.n)")==['Tú'])
    B.evaluate("go('home')"); B.wait_for_timeout(1200)
    chk('B ve la rodada de A',B.evaluate("S.rides.filter(r=>!r.sim&&!r.oficial).map(r=>r.name)")==['Prueba real'])
    B.evaluate("ACT.open({id:S.rides.find(r=>!r.sim&&!r.oficial).id})"); B.evaluate("ACT.join()"); B.wait_for_timeout(1000)
    chk('B en lobby',B.evaluate("S.screen")=='lobby')
    A.wait_for_timeout(2500)
    chk('A ve a B en la sala',A.evaluate("S.lobby.ppl.map(p=>p.n)")==['Tú','Beto Rider'])
    B.evaluate("ACT.ready()"); A.wait_for_timeout(2600)
    chk('A ve a B listo',A.evaluate("S.lobby.ppl.find(p=>p.n==='Beto Rider').st")=='ready')
    B.fill('#cin','Hola Ana, ya salgo'); B.press('#cin','Enter'); A.wait_for_timeout(2600)
    chk('A recibe mensaje de B',A.evaluate("S.lobby.msgs.some(m=>m.n==='Beto Rider'&&m.t==='Hola Ana, ya salgo')"))
    A.fill('#cin','Perfecto, nos vemos'); A.press('#cin','Enter'); B.wait_for_timeout(2600)
    chk('B recibe mensaje de A',B.evaluate("S.lobby.msgs.some(m=>m.n==='Ana Host')"))
    chk('B no duplica su propio mensaje',B.evaluate("S.lobby.msgs.filter(m=>m.me).length")==1)
    A.screenshot(path='live_lobby_A.png')
    for pg in(A,B): pg.evaluate("go('mapa')")
    for pg in(A,B): pg.evaluate("ACT.locStart()")
    A.wait_for_timeout(6500)
    pa=A.evaluate("Object.values(Live.peers).map(q=>[q.n,q.ll])"); pb=B.evaluate("Object.values(Live.peers).map(q=>[q.n,q.ll])")
    print(pa,pb)
    chk('A ve a B en el mapa',len(pa)==1 and pa[0][0]=='Beto Rider' and abs(pa[0][1][0]-4.76)<1e-3)
    chk('B ve a A en el mapa',len(pb)==1 and pb[0][0]=='Ana Host' and abs(pb[0][1][0]-4.7536)<1e-3)
    chk('posición reciente (no "sin señal")',A.evaluate("Date.now()-Object.values(Live.peers)[0].t")<15000)
    A.screenshot(path='live_map_A.png')
    A.evaluate("go('lobby')"); A.wait_for_timeout(300); A.evaluate("ACT.hostStart()"); B.evaluate("go('lobby')"); B.wait_for_timeout(2600)
    chk('B ve que la rodada inició',B.evaluate("S.lobby.started")==True)
    B.evaluate("ACT.leave()"); B.wait_for_timeout(800); A.evaluate("go('lobby')"); A.wait_for_timeout(2600)
    chk('A ve que B salió',A.evaluate("S.screen")=='lobby' and A.evaluate("S.lobby.ppl.length")==1)
    # chat/posiciones ajenas bloqueadas para no miembros
    B.evaluate("S.sel={id:1}")
    r=B.evaluate("RodAPI.rest('/ride_messages?ride_id=eq.1&id=gt.0')")
    chk('no miembro no lee el chat',r==[])
    B.evaluate("ACT.open({id:-1})"); B.evaluate("ACT.join()"); B.wait_for_timeout(1500)
    chk('B se une a una rodada de ejemplo sin tocar la base',B.evaluate("S.screen")=='lobby' and B.evaluate("S.sel.sim")==True and B.evaluate("S.lobby.ppl.length")>2)
    B.evaluate("go('mapa')"); B.evaluate("ACT.locAllow()"); B.wait_for_timeout(2600); B.screenshot(path='live_sim_map.png')
    chk('mapa de ejemplo muestra compañeros simulados',B.evaluate("Object.keys(Live.peers).length")>=3)
    b.close()
finally:
  for s in srv: s.terminate()
print('OK' if ok else 'HAY FALLAS'); sys.exit(0 if ok else 1)

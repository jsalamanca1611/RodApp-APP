import subprocess, time, sys
from playwright.sync_api import sync_playwright
srv=[subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL),subprocess.Popen(['python3','tests/live/mock.py','8766'])]
time.sleep(1.2)
ov="window.RODAPP_OVERRIDE={supabaseUrl:'http://127.0.0.1:8766',anonKey:'k',mapStyle:''};"
ok=True
def chk(n,c):
    global ok; print(('PASS ' if c else 'FAIL ')+n); ok=ok and bool(c)
def boot(pg,e,n,c):
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("""async([e,n,c])=>{await RodAPI.signUp(e,'secreto1',{nombre:n,exp:'Intermedio'});await RodAPI.saveIdentity({nombre_legal:n,cedula:c,ocr_ok:true,editado:false,alt:false});
      await RodAPI.antecedentes({cedula:c});S.user={nombre:n,exp:'Intermedio'};newAccount();S.verStatus='ok';S.verified=true;S.consent.ubic=true;go('home')}""",[e,n,c])
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    mk=lambda la,ln:b.new_context(viewport={'width':390,'height':780},geolocation={'latitude':la,'longitude':ln},permissions=['geolocation','accelerometer','gyroscope','magnetometer'])
    A=mk(4.7536,-74.0458).new_page(); B=mk(4.7600,-74.0300).new_page()
    for pg,n in((A,'A'),(B,'B')): pg.on('pageerror',lambda e,n=n:print('PAGEERR',n,e)); pg.add_init_script(ov+"window.__said=[];window.speechSynthesis&&(speechSynthesis.speak=u=>window.__said.push(u.text));")
    boot(A,'a@x.co','Ana Host','1010101010'); boot(B,'b@x.co','Beto Rider','2020202020')
    A.evaluate("Object.assign(S.cr,{nombre:'Ruta HUD',ruta:0,cc:'200–500',zona:'Calera',nivel:'Intermedio',fecha:FECHAS[1],hora:HORAS[3],cupo:4,punto:SPOTS[1]})"); A.evaluate("ACT.publish()"); A.wait_for_timeout(800)
    B.evaluate("go('home')"); B.wait_for_timeout(1200); B.evaluate("ACT.open({id:S.rides.find(r=>!r.sim&&!r.demo).id})"); B.evaluate("ACT.join()"); B.wait_for_timeout(1200)
    A.wait_for_timeout(2500); A.evaluate("ACT.hostStart()"); B.wait_for_timeout(2600)
    for pg in(A,B): pg.evaluate("S.micOk=true;startRun();go('hud')")
    A.wait_for_timeout(4500); B.wait_for_timeout(500)
    chk('el HUD muestra el botón del sensor de movimiento',B.evaluate("!!document.querySelector('#hgy')")and B.evaluate("Gyro.ok")==True)
    B.evaluate("window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:2,y:3,z:1},rotationRate:{alpha:5,beta:3,gamma:2}}))"); B.wait_for_timeout(600)
    chk('un movimiento normal NO dispara alerta',not B.evaluate("(S.run.alerts||[]).length"))
    B.evaluate("window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:5,y:38,z:6},rotationRate:{alpha:0,beta:0,gamma:0}}))"); B.wait_for_timeout(500); A.wait_for_timeout(2800)
    chk('B lanza sola la alerta de movimiento brusco',B.evaluate("S.run.alerts.some(a=>a.k==='brusco')"))
    chk('A recibe: precaución, Beto tuvo un movimiento brusco',A.evaluate("S.run.banner&&S.run.banner.t.includes('Beto')&&S.run.banner.t.includes('movimiento brusco')"))
    chk('A lo anuncia por voz',A.evaluate("window.__said.some(t=>t.includes('Beto')&&t.includes('movimiento brusco'))"))
    B.evaluate("window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:5,y:38,z:6},rotationRate:{alpha:0,beta:0,gamma:0}}))"); B.wait_for_timeout(400)
    chk('no se repite en 25 s (anti-rebote)',B.evaluate("S.run.alerts.filter(a=>a.k==='brusco').length")==1)
    b.close()
finally:
  for x in srv: x.terminate()
print('OK' if ok else 'FALLAS')

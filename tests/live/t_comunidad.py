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
    A,B=b.new_context(viewport={'width':390,'height':780}).new_page(),b.new_context(viewport={'width':390,'height':780}).new_page()
    for pg,n in((A,'A'),(B,'B')): pg.on('pageerror',lambda e,n=n:print('PAGEERR',n,e)); pg.add_init_script(ov)
    boot(A,'a@x.co','Ana Host','1010101010'); boot(B,'b@x.co','Beto Rider','2020202020')
    B.evaluate("go('comunidad')"); B.wait_for_timeout(600)
    A.evaluate("go('comunidad')"); A.wait_for_timeout(600)
    A.evaluate("S.com.draft={tema:'ruta',txt:'Salimos mañana 5am desde el Portal',video:false};ACT.cpub()"); A.wait_for_timeout(1200)
    chk('A ve su publicación',A.evaluate("S.com.posts.some(p=>p.n==='Tú'&&/Portal/.test(p.t))"))
    B.wait_for_timeout(4800)
    chk('B ve la publicación de A',B.evaluate("S.com.posts.some(p=>p.n==='Ana Host'&&/Portal/.test(p.t))") and 'Portal' in B.evaluate("document.body.innerText"))
    B.evaluate("S.com.open=S.com.posts[0].id;render()")
    B.evaluate("const f=document.querySelector('[data-cform]');f.querySelector('input').value='Allá nos vemos';f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))"); B.wait_for_timeout(600)
    A.wait_for_timeout(4800)
    chk('A ve el comentario de B',A.evaluate("S.com.posts[0].c.some(c=>c.n==='Beto Rider'&&/vemos/.test(c.t))"))
    b.close()
finally:
  for x in srv: x.terminate()
print('OK' if ok else 'FALLAS')

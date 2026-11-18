import subprocess, time
from playwright.sync_api import sync_playwright
srv=[subprocess.Popen(['python3','-m','http.server','8765','-d','.'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL),
     subprocess.Popen(['python3','tests/live/mock.py','8766'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)]
time.sleep(1.2)
ok=True
def chk(n,c):
    global ok; print(('PASS ' if c else 'FAIL ')+n); ok=ok and bool(c)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':800}); pg.on('pageerror',lambda e:print('PAGEERR',e))
    pg.add_init_script("window.RODAPP_OVERRIDE={supabaseUrl:'http://127.0.0.1:8766',anonKey:'k',mapStyle:''};")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("RodAPI.signUp('g@x.co','secreto1',{nombre:'Gala Leria',exp:'Intermedio'});Ocr.read=async()=>({numero:'1010101010',nombre:'GALA LERIA',ok:true});S.user={nombre:'Gala Leria',exp:'Intermedio'};newAccount();S.kyc.step=0;go('kyc')"); pg.wait_for_timeout(600)
    chk('se ven los dos botones de galería',pg.locator('[data-act=gal]').count()==2)
    with pg.expect_file_chooser() as fc: pg.locator('[data-act=gal][data-k=front]').click()
    fc.value.set_files('/tmp/cedula_test.jpg'); pg.wait_for_timeout(1800)
    chk('frente: la foto de galería se sube y se lee',pg.evaluate("S.kyc.front")=='ok' and pg.evaluate("S.kyc.cedula")=='1010101010')
    with pg.expect_file_chooser() as fc: pg.locator('[data-act=gal][data-k=back]').click()
    fc.value.set_files('/tmp/cedula_test.jpg'); pg.wait_for_timeout(1800)
    chk('reverso: la foto de galería se sube',pg.evaluate("S.kyc.back")=='ok')
    chk('al quedar ok ya no ofrece galería',pg.locator('[data-act=gal]').count()==0)
    # la selfie no admite galería
    pg.evaluate("S.kyc.step=1;go('kyc')");pg.wait_for_timeout(300)
    chk('selfie: sin opción de galería',pg.locator('[data-act=gal]').count()==0 and pg.evaluate("Cam.pick('selfie')")==None)
    # visor de cámara: botón Galería solo en cédula
    pg.evaluate("S.kyc.front='idle';S.kyc.step=0;go('kyc');Cam.open('front')");pg.wait_for_timeout(500)
    chk('visor de cédula ofrece Galería (con cámara o sin ella)',pg.locator('.camfoot [data-act=gal], .camfoot #galfile').count()==1)
    b.close()
finally:
  for s in srv: s.terminate()
print('OK' if ok else 'FALLAS')

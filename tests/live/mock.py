import json, re, sys, uuid, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote
from email.utils import formatdate
DB={'profiles':{}, 'identity_docs':{}, 'consents':[], 'rides':[], 'ride_participants':[], 'ride_messages':[], 'ride_positions':[]}
USERS={}; TOK={}; NID={'rides':0,'ride_messages':0}; LOCK=threading.Lock()
def now_iso(): return time.strftime('%Y-%m-%dT%H:%M:%S',time.gmtime())+'.000000+00:00'
def verified(u): return DB['profiles'].get(u,{}).get('ver_status')=='ok'
def member(rid,u): return verified(u) and any(p['ride_id']==rid and p['user_id']==u for p in DB['ride_participants'])
class E(Exception):
    def __init__(s,st,msg,code=None): s.st=st; s.msg=msg; s.code=code
def match(row,flt):
    for k,v in flt:
        op,_,val=v.partition('.')
        x=row.get(k)
        if op=='eq':
            if str(x)!=val: return False
        elif op=='neq':
            if str(x)==val: return False
        elif op=='gt':
            if not (x is not None and float(x)>float(val)): return False
    return True
class H(BaseHTTPRequestHandler):
    def log_message(s,*a): pass
    def cors(s):
        s.send_header('Access-Control-Allow-Origin','*'); s.send_header('Access-Control-Allow-Headers','*'); s.send_header('Access-Control-Allow-Methods','*'); s.send_header('Access-Control-Expose-Headers','Date'); s.send_header('Date',formatdate(usegmt=True))
    def out(s,st,body=None):
        s.send_response(st); s.cors(); s.send_header('Content-Type','application/json'); s.end_headers()
        if body is not None: s.wfile.write(json.dumps(body).encode())
    def uid(s):
        a=s.headers.get('Authorization','')
        return TOK.get(a[7:]) if a.startswith('Bearer ') else None
    def do_OPTIONS(s): s.send_response(204); s.cors(); s.end_headers()
    def body(s):
        n=int(s.headers.get('Content-Length') or 0); raw=s.rfile.read(n) if n else b''
        return raw
    def handle_any(s,method):
        with LOCK:
            try: s.route(method)
            except E as e: s.out(e.st,{'message':e.msg,'code':e.code})
    do_GET=lambda s:s.handle_any('GET'); do_POST=lambda s:s.handle_any('POST'); do_PATCH=lambda s:s.handle_any('PATCH'); do_DELETE=lambda s:s.handle_any('DELETE')
    def route(s,method):
        u=urlparse(s.path); q=parse_qs(u.query,keep_blank_values=True); p=u.path; raw=s.body()
        js=json.loads(raw) if raw and s.headers.get('Content-Type','').startswith('application/json') else None
        prefer=s.headers.get('Prefer','')
        if p=='/auth/v1/signup':
            if any(x['email']==js['email'] for x in USERS.values()): raise E(422,'User already registered')
            uid_=str(uuid.uuid4()); USERS[uid_]={'email':js['email'],'meta':js.get('data',{})}
            t='tok-'+uid_; TOK[t]=uid_
            DB['profiles'][uid_]={'id':uid_,'nombre':js['data'].get('nombre','Rodador'),'exp':js['data'].get('exp'),'ver_status':'pending','xp':0}
            return s.out(200,{'access_token':t,'refresh_token':'r-'+uid_,'user':{'id':uid_}})
        if p=='/auth/v1/token':
            gt=q['grant_type'][0]
            if gt=='password':
                for k,v in USERS.items():
                    if v['email']==js['email']: t='tok2-'+k+str(time.time()); TOK[t]=k; return s.out(200,{'access_token':t,'refresh_token':'r-'+k,'user':{'id':k}})
                raise E(400,'Invalid login')
            k=js['refresh_token'][2:]; t='tok3-'+k+str(time.time()); TOK[t]=k; return s.out(200,{'access_token':t,'refresh_token':'r-'+k,'user':{'id':k}})
        if p.startswith('/storage/'): return s.out(200,{'Key':'ok'})
        me=s.uid()
        if me is None and p.startswith('/rest/'): raise E(401,'JWT expired','PGRST301')
        if p=='/rest/v1/rpc/verificar_piloto':
            d=DB['identity_docs'].get(me)
            if not d: return s.out(200,'error')
            st='flag' if d['cedula']=='1000000009' else 'error' if d['cedula']=='1000000007' else 'clear'
            if st!='error': DB['profiles'][me]['ver_status']='review' if (st=='flag' or d.get('alt')) else 'ok'
            return s.out(200,st)
        m=re.match(r'/rest/v1/(\w+)$',p)
        if not m: raise E(404,'nope')
        tb=m.group(1); flt=[(k,v[0]) for k,v in q.items() if k not in('select','order','limit','on_conflict')]
        if tb=='consents' and method=='POST': DB['consents'].extend(js); return s.out(201)
        if tb=='identity_docs' and method=='POST':
            if any(d['cedula']==js['cedula'] for d in DB['identity_docs'].values()): return s.out(201)
            DB['identity_docs'][me]=js; return s.out(201)
        if tb=='profiles':
            if method=='GET': r=[DB['profiles'][me]] if me in DB['profiles'] else []; return s.out(200,r)
            if method=='POST': DB['profiles'].setdefault(me,{'ver_status':'pending','xp':0}).update({k:v for k,v in js.items() if k in('id','nombre','exp','cc','tipo','marca','placa')}); return s.out(201)
        rows=DB[tb]
        if method=='GET':
            r=[dict(x) for x in rows if match(x,flt)]
            if tb=='rides':
                for x in r: x['ride_participants']=[{k:v for k,v in pp.items() if k in('user_id','nombre','xp','listo')} for pp in DB['ride_participants'] if pp['ride_id']==x['id']]
                r.sort(key=lambda x:-x['id'])
            if tb in('ride_messages','ride_positions'):
                rid=int(dict(flt)['ride_id'].split('.')[1]);
                if not member(rid,me): r=[]
            if tb=='ride_messages': r.sort(key=lambda x:x['id'])
            if 'limit' in q: r=r[:int(q['limit'][0])]
            return s.out(200,r)
        if method=='POST':
            if tb=='rides':
                if not verified(me): raise E(403,'new row violates row-level security','42501')
                NID['rides']+=1; row=dict(js,id=NID['rides'],estado='abierta',created_at=now_iso()); rows.append(row)
                DB['ride_participants'].append({'ride_id':row['id'],'user_id':me,'nombre':js.get('host_nombre',''),'xp':0,'listo':False}); return s.out(201,[row])
            if tb=='ride_participants':
                if not verified(me): raise E(403,'new row violates row-level security','42501')
                if any(x['ride_id']==js['ride_id'] and x['user_id']==js['user_id'] for x in rows): raise E(409,'duplicate','23505')
                rd=[x for x in DB['rides'] if x['id']==js['ride_id']][0]
                if len([x for x in rows if x['ride_id']==rd['id']])>=rd['cupo']: raise E(400,'rodada llena','P0001')
                rows.append(dict(js,listo=False)); return s.out(201)
            if tb=='ride_messages':
                if not member(js['ride_id'],me): raise E(403,'rls','42501')
                NID['ride_messages']+=1; row=dict(js,id=NID['ride_messages'],user_id=me,created_at=now_iso()); rows.append(row); return s.out(201,[row])
            if tb=='ride_positions':
                if not member(js['ride_id'],me): raise E(403,'rls','42501')
                js=dict(js,user_id=me,updated_at=now_iso())
                for x in rows:
                    if x['ride_id']==js['ride_id'] and x['user_id']==me: x.update(js); return s.out(201)
                rows.append(js); return s.out(201)
        if method=='PATCH':
            for x in rows:
                if match(x,flt):
                    if tb=='rides' and x['host']!=me: continue
                    if tb=='ride_participants' and x['user_id']!=me: continue
                    x.update(js)
            return s.out(204)
        if method=='DELETE':
            keep=[x for x in rows if not match(x,flt) or (tb=='rides' and x['host']!=me) or (tb in('ride_participants','ride_positions') and x['user_id']!=me)]
            gone=[x for x in rows if x not in keep]; rows[:]=keep
            if tb=='rides':
                for x in gone:
                    for t2 in('ride_participants','ride_messages','ride_positions'): DB[t2][:]=[y for y in DB[t2] if y['ride_id']!=x['id']]
            return s.out(204)
        raise E(405,'nope')
if __name__=='__main__': ThreadingHTTPServer(('127.0.0.1',int(sys.argv[1])),H).serve_forever()

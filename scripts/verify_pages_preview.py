#!/usr/bin/env python3
"""Read-only HTTP checks against an isolated preview. No browser analytics or real bookings."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from build_pages import preview_html

USER_AGENT = "REVIA-pages-validation/1.0"

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

def verify(origin,root):
    url=urlsplit(origin)
    if not ((url.scheme=='https' and url.hostname.endswith('.pages.dev')) or (url.scheme=='http' and url.hostname in ('localhost','127.0.0.1'))):
        raise ValueError('PREVIEW_ORIGIN_REQUIRED')
    opener=urllib.request.build_opener(NoRedirect)
    opener.addheaders=[("User-Agent", USER_AGENT)]
    checks=[]
    def request(path,method='GET',data=None):
        req=urllib.request.Request(origin.rstrip('/')+path,method=method,data=data)
        try:
            with opener.open(req,timeout=20) as response:
                return response.status,response.headers,response.read()
        except urllib.error.HTTPError as error:return error.code,error.headers,error.read()
    manifest=json.loads((root/'config/pages-public.json').read_text())
    for path in manifest['root_html']+['column/index.html']+manifest['existing_articles']:
        status,headers,body=request('/'+path)
        expected=(root/path).read_bytes()
        if path=='index.html': expected=preview_html(expected)
        assert status==200 and body==expected,(path,status,headers.get('cf-ray'),body[:120])
        assert 'noindex' in headers.get('X-Robots-Tag',''),path
        assert 'text/html' in headers.get('Content-Type',''),path
        checks.append({'path':'/'+path,'status':status,'bytes_equal':True,'noindex':True})
    for path in manifest['existing_static']:
        status,headers,body=request('/'+path)
        assert status==200,path
        assert 'noindex' in headers.get('X-Robots-Tag',''),path
        if path in ('script.js','contact.js'):assert b'https://script.google.com/macros/' not in body,path
        elif path=='robots.txt':assert b'Disallow: /' in body
        else:assert body==(root/path).read_bytes(),path
        checks.append({'path':'/'+path,'status':status})
    for path in ('/missing','/scripts/column_release.py','/config/pages-public.json','/.git/config','/column/future.html','/__pages_html/404.bin','/scheduled/2026-10-20.enc.json','/google-apps-script/Code.gs','/tmp/backup.html','/docs/cloudflare-pages-validation.md'):
        assert request(path)[0]==404,path
        checks.append({'path':path,'status':404})
    for path in ('/','/column/'):
        assert request(path)[0]==200
        status,_,body=request(path,'HEAD');assert status==200 and not body
        checks.append({'path':path,'status':200,'head':True})
    status,headers,_=request('/column');assert status==308 and headers['Location']=='/column/'
    mock=json.loads(request('/__qa/booking')[2])
    assert mock['testOnly'] is True
    slot=mock['slots'][0]
    assert slot['id']==slot['date']+'T'+slot['time']=='2026-10-20T10:00'
    assert slot['startIso']=='2026-10-20T10:00:00+09:00'
    assert slot['endIso']=='2026-10-20T10:30:00+09:00'
    status,_,body=request('/__qa/booking','POST',b'{"name":"SYNTHETIC TEST ONLY"}')
    assert status==200 and json.loads(body)['testOnly'] is True
    assert request('/__qa/booking?callback=alert(1)')[0]==400
    assert request('/index.html','POST',b'')[0]==405
    return checks

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--origin',required=True);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--output',type=Path)
    args=p.parse_args()
    try:
        checks=verify(args.origin,args.root)
        result={'origin':args.origin,'user_agent':USER_AGENT,'checks':checks,'additional':'robots, mock GET/POST, invalid JSONP, method guard, redirect'}
        if args.output:args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print('PREVIEW_HTTP_VERIFIED checks='+str(len(checks)))
    except Exception as error:
        print(f"{type(error).__name__}: {error}",file=sys.stderr)
        print('PREVIEW_HTTP_FAILED: inspect preview deployment and rerun; no production request made',file=sys.stderr);sys.exit(1)

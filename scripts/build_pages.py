#!/usr/bin/env python3
"""Build a strict public allowlist; no drafts, sources, docs, credentials or ciphertext."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
from datetime import datetime
from column_release import JST, ORIGIN, Page, read_ledger, release_at, require
from urllib.parse import urljoin, urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]


def build(root=ROOT, output=None, production=False):
    output = output or root / 'dist'
    require(output.resolve() == (root/'dist').resolve(), 'INVALID_OUTPUT')
    manifest = json.loads((root/'config/pages-public.json').read_text())
    articles = list(manifest['existing_articles'])
    static = list(manifest['existing_static'])
    for slot, record in read_ledger(root).items():
        require(release_at(slot) <= datetime.now(JST), 'FUTURE_ARTICLE_IN_LEDGER')
        articles.append(record['path'])
        for path, digest in record['assets_sha256'].items():
            require(hashlib.sha256((root/path).read_bytes()).hexdigest() == digest, 'PUBLISHED_ASSET_CHANGED')
            static.append(path)
    html_paths = manifest['root_html'] + ['column/index.html'] + articles
    for path in html_paths + static:
        require(not Path(path).is_absolute() and '..' not in Path(path).parts and (root/path).resolve().is_relative_to(root.resolve()), 'INVALID_PUBLIC_PATH')
    require(all((root/p).is_file() for p in html_paths), 'PUBLIC_FILE_MISSING')
    if output.exists(): shutil.rmtree(output)
    (output/'__pages_html').mkdir(parents=True)
    routes, public = {}, []
    for path in html_paths:
        data = (root/path).read_bytes()
        asset = '/__pages_html/' + hashlib.sha256(data).hexdigest() + '.bin'
        (output/asset.lstrip('/')).write_bytes(data)
        routes['/'+path] = asset
        if path.endswith('index.html'):
            routes['/'+path[:-len('index.html')]] = asset
    not_found = b'<!doctype html><html lang="ja"><meta charset="utf-8"><title>404 | REVIA</title><h1>\xe3\x83\x9a\xe3\x83\xbc\xe3\x82\xb8\xe3\x81\x8c\xe8\xa6\x8b\xe3\x81\xa4\xe3\x81\x8b\xe3\x82\x8a\xe3\x81\xbe\xe3\x81\x9b\xe3\x82\x93</h1><a href="/">REVIA</a></html>'
    asset='/__pages_html/404.bin'; (output/asset.lstrip('/')).write_bytes(not_found); routes['/404.html']=asset
    # Prevent Pages' default SPA fallback even when the worker is not invoked.
    (output/'404.html').write_bytes(not_found)
    for path in sorted(set(static)):
        dest=output/path;dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(root/path,dest);public.append('/'+path)
    allowed=set(routes)|set(public)|{'/column'}
    for path in html_paths:
        page=Page((root/path).read_text())
        for kind,ref in page.refs:
            url=urlsplit(urljoin(ORIGIN+'/'+path,ref))
            if url.hostname == urlsplit(ORIGIN).hostname:
                require(unquote(url.path) in allowed,'REFERENCE_NOT_IN_PUBLIC_OUTPUT')
    if not production:
        # Only the preview output changes endpoints; repository JavaScript stays intact.
        for name in ('script.js','contact.js'):
            p=output/name
            p.write_text(re.sub(r'https://script\.google\.com/macros/s/[^"\s]+/exec',
                               'https://PLACEHOLDER.invalid/__qa/booking',p.read_text()).replace('"https://PLACEHOLDER.invalid/__qa/booking"','window.location.origin + "/__qa/booking"'))
    worker=(root/'cloudflare/worker.template.js').read_text()
    worker=worker.replace('__ROUTES__',json.dumps(routes)).replace('__PUBLIC_FILES__',json.dumps(sorted(set(public)))).replace('__PRODUCTION_APPROVED__','true' if production else 'false')
    (output/'_worker.js').write_text(worker)
    (output/'_routes.json').write_text(json.dumps({'version':1,'include':['/*'],'exclude':['/images/*','/assets/*','/vendor/*','/*.css','/*.js','/*.png','/*.webmanifest']}))
    (output/'_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n\nhttps://:project.pages.dev/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n')
    return routes,public


if __name__=='__main__':
    production=os.environ.get('REVIA_PAGES_PRODUCTION_APPROVED')=='true' and os.environ.get('CF_PAGES_BRANCH')=='main'
    routes,public=build(production=production)
    print(json.dumps({'html_routes':len(routes),'static_files':len(public),'production_approved':production,'drafts_included':False}))

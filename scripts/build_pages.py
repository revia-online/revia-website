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


PREVIEW_SUCCESS = "模擬予約テストが完了しました。実際の予約は確定していません。"
PREVIEW_NO_MAIL = "メールは送信していません。Google Meet参加URLも発行していません。"


def preview_html(data):
    text = data.decode('utf-8')
    text = text.replace('<div class="booking-complete" id="bookingComplete" hidden>',
        '<p role="note">検証環境：実際の予約・メール送信・Google Meet URL発行は行いません。入力にはテストデータを使用してください。</p>\n'
        '<div class="booking-complete" id="bookingComplete" hidden>')
    text = text.replace('無料相談のご予約が確定しました。', PREVIEW_SUCCESS)
    notice = '<p id="bookingCompleteNotice">参加URLは確認メールをご確認ください。届かない場合はREVIAにお問い合わせください。</p>'
    require(text.count(notice) == 1, 'PREVIEW_HTML_NOTICE_MISSING')
    text = text.replace(notice, '<p id="bookingCompleteNotice">' + PREVIEW_NO_MAIL + '</p>')
    return text.encode('utf-8')


def public_paths(root):
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
        parts=Path(path).parts
        require(not any(part.startswith('.') for part in parts), 'NONPUBLIC_FILE_IN_MANIFEST')
        require(parts[0] not in ('google-apps-script','tmp','work','scripts','tests','docs','config','cloudflare','publication','scheduled','drafts','node_modules','revia-site-vercel-drop-20260704'), 'NONPUBLIC_FILE_IN_MANIFEST')
        require(Path(path).suffix.lower() in ('.html','.css','.js','.png','.jpg','.jpeg','.webp','.svg','.webmanifest','.xml','.txt'), 'NONPUBLIC_FILE_IN_MANIFEST')
    require(all((root/p).is_file() for p in html_paths), 'PUBLIC_FILE_MISSING')
    return html_paths, sorted(set(static))


def render_worker(root, routes, public, production):
    return ((root/'cloudflare/worker.template.js').read_text()
            .replace('__ROUTES__',json.dumps(routes))
            .replace('__PUBLIC_FILES__',json.dumps(sorted(set(public))))
            .replace('__PRODUCTION_APPROVED__','true' if production else 'false'))


def build(root=ROOT, output=None, production=False):
    output = output or root / 'dist'
    require(output.resolve() == (root/'dist').resolve(), 'INVALID_OUTPUT')
    html_paths, static = public_paths(root)
    if output.exists(): shutil.rmtree(output)
    (output/'__pages_html').mkdir(parents=True)
    routes, public = {}, []
    for path in html_paths:
        data = (root/path).read_bytes()
        if not production and path == 'index.html':
            data = preview_html(data)
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
        p=output/'script.js'
        # Change only the generated preview JS, never the repository's original JS.
        # Fail closed: regardless of the response payload, a preview cannot claim
        # that a real appointment, confirmation email or Meet URL exists.
        preview_js = p.read_text()
        handler = r'const getBookingSuccessMessage = \(result\) => \{.*?^\};'
        matches = list(re.finditer(handler, preview_js, flags=re.MULTILINE | re.DOTALL))
        require(len(matches) == 1, 'MEET_SUCCESS_HANDLER_MISSING')
        safe_handler = ('const getBookingSuccessMessage = (_result) => {\n  return '
                        + json.dumps(PREVIEW_SUCCESS + '\n' + PREVIEW_NO_MAIL, ensure_ascii=False)
                        + ';\n};')
        match = matches[0]
        p.write_text(preview_js[:match.start()] + safe_handler + preview_js[match.end():])
    worker=render_worker(root, routes, public, production)
    (output/'_worker.js').write_text(worker)
    # Production: every URL must pass through the hostname guard, including static files.
    # Validation: preserve existing static exclusions and their noindex _headers handling.
    excluded = [] if production else ['/images/*','/assets/*','/vendor/*','/*.css','/*.js','/*.png','/*.webmanifest']
    (output/'_routes.json').write_text(json.dumps({'version':1,'include':['/*'],'exclude':excluded}))
    # Functions responses set their own headers; this also covers static assets
    # and Pages-native error responses on every validation/branch hostname.
    headers='/*\n  X-Content-Type-Options: nosniff\n'
    if not production:
        headers+='  X-Robots-Tag: noindex, nofollow, noarchive\n'
    (output/'_headers').write_text(headers)
    if production:
        from verify_pages_production import verify_artifacts
        try:
            verify_artifacts(root, output)
        except Exception:
            # A rejected artifact must not remain available for an accidental upload.
            shutil.rmtree(output)
            raise
    return routes,public


if __name__=='__main__':
    from verify_pages_production import production_mode
    production=production_mode(os.environ)
    routes,public=build(production=production)
    print(json.dumps({'html_routes':len(routes),'static_files':len(public),'production_approved':production,'drafts_included':False}))

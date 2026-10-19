#!/usr/bin/env python3
"""Fail-closed production build and GET/HEAD-only HTTP checks. Standard library only."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
import mimetypes
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request
from urllib.parse import urljoin, urlsplit

from column_release import ORIGIN, require

VALIDATION_PROJECT = 'revia-website-validation'
USER_AGENT = 'REVIA-pages-production-check/1.0'
BLOCKED_PATHS = (
    '/missing-production-check', '/scripts/build_pages.py', '/config/pages-public.json',
    '/.git/config', '/column/future.html', '/__pages_html/404.bin',
    '/scheduled/2026-10-20.enc.json', '/google-apps-script/Code.gs',
    '/tmp/backup.html', '/docs/cloudflare-pages-validation.md', '/__qa/booking',
)


def project_host(url, project):
    host = urlsplit(url).hostname or ''
    return host == project + '.pages.dev' or host.endswith('.' + project + '.pages.dev')


def production_mode(env):
    """Existing validation project remains safe by default; unknown deployments stop."""
    mode = env.get('REVIA_PAGES_MODE', '')
    approval = env.get('REVIA_PAGES_PRODUCTION_APPROVED', '')
    branch = env.get('CF_PAGES_BRANCH', '')
    url = env.get('CF_PAGES_URL', '')
    # Separate, opt-in migration gate. Never make the original preview project a
    # production target merely by setting the ordinary production flag.
    repurpose = env.get('REVIA_PAGES_VALIDATION_REPURPOSE_APPROVED', '')
    require(mode in ('', 'validation', 'production'), 'INVALID_PAGES_MODE')
    require(approval in ('', 'false', 'true'), 'INVALID_PRODUCTION_APPROVAL')
    require(repurpose in ('', 'false', 'true'), 'INVALID_VALIDATION_REPURPOSE_APPROVAL')
    if mode != 'production':
        require(repurpose != 'true', 'VALIDATION_REPURPOSE_REQUIRES_PRODUCTION')
        require(approval != 'true' and branch != 'main', 'PRODUCTION_MODE_REQUIRED')
        require(not url or project_host(url, VALIDATION_PROJECT), 'UNKNOWN_PAGES_PROJECT')
        require(not env.get('CF_PAGES') or bool(url), 'PAGES_URL_REQUIRED')
        return False
    require(approval == 'true', 'PRODUCTION_APPROVAL_REQUIRED')
    require(branch == 'main', 'PRODUCTION_MAIN_REQUIRED')
    project = env.get('REVIA_PAGES_PRODUCTION_PROJECT', '')
    require(bool(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', project)),
            'PRODUCTION_PROJECT_REQUIRED')
    if project == VALIDATION_PROJECT:
        require(repurpose == 'true', 'VALIDATION_REPURPOSE_APPROVAL_REQUIRED')
    else:
        require(repurpose != 'true', 'VALIDATION_REPURPOSE_PROJECT_MISMATCH')
    require(urlsplit(url).scheme == 'https' and project_host(url, project),
            'PRODUCTION_PROJECT_MISMATCH')
    return True


class ProductionHTML(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = {key.lower(): value or '' for key, value in attrs}
        if tag == 'meta':
            name = attrs.get('name', '').lower()
            if name == 'robots' or 'bot' in name:
                require(not re.search(r'\b(noindex|none)\b', attrs.get('content', ''), re.I),
                        'PRODUCTION_META_NOINDEX')
            require(attrs.get('http-equiv', '').lower() != 'content-security-policy',
                    'PRODUCTION_META_CSP_REVIEW_REQUIRED')


def check_content(path, data):
    from build_pages import PREVIEW_SUCCESS, PREVIEW_NO_MAIL
    if Path(path).suffix not in ('.html', '.js', '.css', '.txt', '.xml', '.webmanifest'):
        return
    text = data.decode('utf-8')
    for marker in (PREVIEW_SUCCESS, PREVIEW_NO_MAIL, '検証環境：', '/__qa/booking',
                   'PLACEHOLDER.invalid', 'TEST ONLY: no real booking', 'testOnly'):
        require(marker.lower() not in text.lower(), 'PRODUCTION_VALIDATION_CONTENT ' + path)
    if path.endswith('.html'):
        ProductionHTML().feed(text)
        require('<html' in text.lower() and '<title' in text.lower(), 'PRODUCTION_INVALID_HTML ' + path)
    if path == 'robots.txt':
        require(not re.search(r'^\s*Disallow\s*:\s*/\s*(?:#.*)?$', text, re.I | re.M),
                'PRODUCTION_ROBOTS_BLOCKED')
        require(bool(re.search(r'^\s*Allow\s*:\s*/\s*$', text, re.I | re.M)),
                'PRODUCTION_ROBOTS_ALLOW_REQUIRED')


def verify_artifacts(root, output):
    from build_pages import public_paths, render_worker
    html, static = public_paths(root)
    routes = {}
    expected_files = {'_worker.js', '_headers', '_routes.json', '404.html', '__pages_html/404.bin'}
    for path in html:
        data = (root/path).read_bytes()
        check_content(path, data)
        asset = '/__pages_html/' + hashlib.sha256(data).hexdigest() + '.bin'
        expected_files.add(asset.lstrip('/'))
        require((output/asset.lstrip('/')).read_bytes() == data, 'PRODUCTION_HTML_CHANGED ' + path)
        routes['/' + path] = asset
        if path.endswith('index.html'):
            routes['/' + path[:-len('index.html')]] = asset
    routes['/404.html'] = '/__pages_html/404.bin'
    for path in static:
        data = (output/path).read_bytes()
        check_content(path, data)
        require(data == (root/path).read_bytes(), 'PRODUCTION_STATIC_CHANGED ' + path)
        expected_files.add(path)
    worker = (output/'_worker.js').read_text()
    require(worker == render_worker(root, routes, ['/' + p for p in static], True),
            'PRODUCTION_WORKER_CHANGED')
    require('const PRODUCTION_APPROVED = true;' in worker and
            "const preview = !PRODUCTION_APPROVED || url.hostname !== 'www.revia.website';" in worker and
            "if (PRODUCTION_APPROVED && url.hostname !== 'www.revia.website')" in worker,
            'PRODUCTION_WORKER_MODE_INVALID')
    require((output/'_headers').read_text() == '/*\n  X-Content-Type-Options: nosniff\n',
            'PRODUCTION_HEADERS_CHANGED')
    routing = json.loads((output/'_routes.json').read_text())
    require(routing == {'version': 1, 'include': ['/*'], 'exclude': []},
            'PRODUCTION_ROUTES_CHANGED')
    files = list(output.rglob('*'))
    require(not any(p.is_symlink() for p in files), 'PRODUCTION_SYMLINK')
    require({p.relative_to(output).as_posix() for p in files if p.is_file()} == expected_files,
            'PRODUCTION_UNEXPECTED_FILES')
    require((output/'404.html').read_bytes() == (output/'__pages_html/404.bin').read_bytes(),
            'PRODUCTION_404_CHANGED')
    check_content('404.html', (output/'404.html').read_bytes())
    return {'html_files': len(html), 'static_files': len(static), 'files': len(expected_files)}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def verify_http(root, opener=None):
    """Fixed official origins only. No JS, external resources, GAS, POST or form submission."""
    from build_pages import public_paths
    html, static = public_paths(root)
    opener = opener or urllib.request.build_opener(NoRedirect)
    checks = []

    def request(url, method='GET'):
        require(method in ('GET', 'HEAD'), 'READ_ONLY_REQUIRED')
        require(urlsplit(url).hostname in ('www.revia.website', 'revia.website'), 'OFFICIAL_HOST_REQUIRED')
        req = urllib.request.Request(url, method=method, headers={
            'User-Agent': USER_AGENT, 'Cache-Control': 'no-cache'})
        try:
            with opener.open(req, timeout=20) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers, error.read()

    def headers_ok(headers):
        require(not re.search(r'\b(noindex|none)\b', ','.join(headers.get_all('X-Robots-Tag', [])), re.I),
                'PRODUCTION_HTTP_NOINDEX')
        require(not headers.get('Content-Security-Policy') and
                not headers.get('Content-Security-Policy-Report-Only'), 'PRODUCTION_HTTP_CSP_REVIEW_REQUIRED')

    for path in html + static:
        status, headers, body = request(ORIGIN + '/' + path)
        require(status == 200, 'PRODUCTION_HTTP_STATUS /' + path + ' ' + str(status))
        headers_ok(headers)
        check_content(path, body)
        require(body == (root/path).read_bytes(), 'PRODUCTION_HTTP_BYTES_CHANGED /' + path)
        mime = headers.get('Content-Type', '').split(';')[0].strip().lower()
        expected = mimetypes.guess_type(path)[0]
        accepted = {'text/javascript', 'application/javascript'} if path.endswith('.js') else {expected}
        require(mime in accepted, 'PRODUCTION_HTTP_CONTENT_TYPE /' + path)
        checks.append({'path': '/' + path, 'status': status, 'bytes_equal': True})
    for path, source in (('/', 'index.html'), ('/column/', 'column/index.html')):
        status, headers, body = request(ORIGIN + path)
        require(status == 200 and body == (root/source).read_bytes(), 'PRODUCTION_ALIAS_CHANGED ' + path)
        headers_ok(headers)
        require('text/html' in headers.get('Content-Type', ''), 'PRODUCTION_ALIAS_CONTENT_TYPE')
        status, headers, body = request(ORIGIN + path, 'HEAD')
        require(status == 200 and not body, 'PRODUCTION_HEAD_FAILED ' + path)
        headers_ok(headers)
        checks.append({'path': path, 'status': 200, 'head': True})
    for path in BLOCKED_PATHS:
        status, _, _ = request(ORIGIN + path)
        require(status == 404, 'PRODUCTION_NONPUBLIC_EXPOSED ' + path)
        checks.append({'path': path, 'status': status})
    # Check all four scheme/host combinations, deep .html, queries, slash redirect and 404.
    for path in ('/?revia_check=1', '/column?revia_check=1', '/column/?revia_check=1',
                 '/' + html[-1] + '?revia_check=1', '/missing-production-check?revia_check=1'):
        target = ORIGIN + ('/column/?revia_check=1' if path.startswith('/column?') else path)
        for origin in (ORIGIN, 'http://www.revia.website', 'https://revia.website', 'http://revia.website'):
            current = origin + path
            seen = set()
            hops = 0
            while True:
                require(current not in seen and hops <= 5, 'PRODUCTION_REDIRECT_LOOP')
                seen.add(current)
                status, headers, _ = request(current)
                if current == target:
                    require(status == (404 if '/missing-production-check' in target else 200),
                            'PRODUCTION_REDIRECT_FINAL_STATUS')
                    headers_ok(headers)
                    break
                require(status in (301, 308), 'PRODUCTION_PERMANENT_REDIRECT_REQUIRED')
                next_url = urljoin(current, headers.get('Location', ''))
                next_parts, target_parts = urlsplit(next_url), urlsplit(target)
                require(next_parts.scheme == 'https' and
                        next_parts.hostname in ('www.revia.website', 'revia.website') and
                        next_parts.port in (None, 443) and not next_parts.username and not next_parts.password and
                        not next_parts.fragment and next_parts.query == target_parts.query and
                        next_parts.path in (urlsplit(current).path, target_parts.path),
                        'PRODUCTION_REDIRECT_TARGET_CHANGED')
                current = next_url
                hops += 1
            checks.append({'url': origin + path, 'target': target, 'redirects': hops, 'status': status})
    return checks


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, help='Save successful check results as JSON')
    parser.add_argument('--http', action='store_true', help='Explicitly GET/HEAD official production URLs (TLS verified)')
    args = parser.parse_args()
    try:
        if args.http:
            result = {'user_agent': USER_AGENT, 'origin': ORIGIN, 'checks': verify_http(args.root)}
        else:
            result = {'artifacts': verify_artifacts(args.root, args.root/'dist')}
        if args.output:
            args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print('PRODUCTION_VERIFIED ' + json.dumps(result.get('artifacts', {'http_checks': len(result.get('checks', []))})))
    except Exception as error:
        print('PRODUCTION_CHECK_FAILED: ' + str(error), file=sys.stderr)
        sys.exit(1)

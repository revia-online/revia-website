import itertools
import io
import json
from pathlib import Path
import select
import shutil
import subprocess
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import build_pages as build
import verify_pages_production as production
import verify_pages_preview as preview
from column_release import ReleaseError


class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)/'production'
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns('.git', 'dist', '__pycache__', '.wrangler', 'tmp', 'node_modules'))

    def tearDown(self):
        self.tmp.cleanup()

    def test_environment_matrix_fails_closed(self):
        count = 0
        for mode, approval, branch, project, url in itertools.product(
            ('', 'validation', 'production', 'typo'), ('', 'false', 'true', 'TRUE'),
            ('', 'main', 'codex/cloudflare-pages-validation'),
            ('', 'revia-website-validation', 'revia-website-production'),
            ('', 'https://revia-website-validation.pages.dev',
             'https://abc.revia-website-production.pages.dev', 'https://unrelated.pages.dev')):
            env = dict(REVIA_PAGES_MODE=mode, REVIA_PAGES_PRODUCTION_APPROVED=approval,
                       CF_PAGES_BRANCH=branch, REVIA_PAGES_PRODUCTION_PROJECT=project, CF_PAGES_URL=url)
            valid_production = (mode == 'production' and approval == 'true' and branch == 'main'
                                and project == 'revia-website-production'
                                and url == 'https://abc.revia-website-production.pages.dev')
            valid_preview = (mode in ('', 'validation') and approval in ('', 'false') and branch != 'main'
                             and url in ('', 'https://revia-website-validation.pages.dev'))
            with self.subTest(mode=mode, approval=approval, branch=branch, project=project, url=url):
                if valid_production or valid_preview:
                    self.assertEqual(production.production_mode(env), valid_production)
                else:
                    with self.assertRaises(ReleaseError): production.production_mode(env)
            count += 1
        self.assertEqual(count, 576)
        with self.assertRaisesRegex(ReleaseError, 'PAGES_URL_REQUIRED'):
            production.production_mode({'CF_PAGES':'1'})
        for suffix in ('revia-website-production.pages.dev.evil.invalid', 'evilrevia-website-production.pages.dev'):
            self.assertFalse(production.project_host('https://' + suffix, 'revia-website-production'))

    def test_production_artifacts_and_tampering(self):
        build.build(self.root, production=True)
        output = self.root/'dist'
        result = production.verify_artifacts(self.root, output)
        self.assertEqual(result['html_files'], 16)
        self.assertEqual(result['static_files'], 47)
        for path, data in (
            ('_headers', b'/*\n  X-Robots-Tag: NoIndex\n'),
            ('_headers', b"/*\n  Content-Security-Policy: connect-src 'self'\n"),
            ('script.js', b'window.location.origin + "/__qa/booking"'),
            ('contact.js', b'// unexpected endpoint replacement'),
            ('robots.txt', b'User-agent: *\nDisallow: /\n'),
            ('_worker.js', (output/'_worker.js').read_bytes().replace(b'PRODUCTION_APPROVED = true', b'PRODUCTION_APPROVED = false')),
            ('_routes.json', b'{"version":1,"include":[],"exclude":["/*"]}'),
        ):
            target = output/path
            original = target.read_bytes()
            target.write_bytes(data)
            with self.subTest(path=path):
                with self.assertRaises((ReleaseError, FileNotFoundError)):
                    production.verify_artifacts(self.root, output)
            target.write_bytes(original)
        target = output/'leaked.txt'
        target.write_text('canary')
        with self.assertRaisesRegex(ReleaseError, 'UNEXPECTED_FILES'):
            production.verify_artifacts(self.root, output)
        target.unlink()
        build.build(self.root)
        with self.assertRaises((ReleaseError, FileNotFoundError)):
            production.verify_artifacts(self.root, output)

    def test_contaminated_sources_stop_build_and_remove_output(self):
        for path, data in (
            ('index.html', '<meta name="ROBOTS" content="NoIndex">'),
            ('index.html', '<meta name="googlebot" content="none">'),
            ('index.html', '<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'">'),
            ('index.html', build.PREVIEW_SUCCESS),
            ('index.html', build.PREVIEW_NO_MAIL),
            ('script.js', '/* /__qa/booking */'),
            ('robots.txt', '\nDisallow: /\n'),
        ):
            target = self.root/path
            original = target.read_bytes()
            target.write_bytes(original + data.encode())
            with self.subTest(path=path, data=data):
                with self.assertRaises(ReleaseError): build.build(self.root, production=True)
                self.assertFalse((self.root/'dist').exists())
            target.write_bytes(original)

    def test_cli_invalid_environment_exits_before_build(self):
        with patch.dict('os.environ', {'REVIA_PAGES_MODE':'production', 'CF_PAGES_BRANCH':'main'}, clear=True):
            result = subprocess.run([sys.executable, str(self.root/'scripts/build_pages.py')], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'PRODUCTION_APPROVAL_REQUIRED', result.stderr)
        self.assertFalse((self.root/'dist').exists())

    def test_cli_valid_production_and_offline_inspection(self):
        env = {'REVIA_PAGES_MODE':'production', 'CF_PAGES_BRANCH':'main',
               'REVIA_PAGES_PRODUCTION_APPROVED':'true',
               'REVIA_PAGES_PRODUCTION_PROJECT':'revia-website-production',
               'CF_PAGES_URL':'https://local-test.revia-website-production.pages.dev'}
        with patch.dict('os.environ', env, clear=True):
            result = subprocess.run([sys.executable, str(self.root/'scripts/build_pages.py')],
                                    capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)['production_approved'])
        result = subprocess.run([sys.executable, str(self.root/'scripts/verify_pages_production.py')],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('PRODUCTION_VERIFIED', result.stdout)

    def test_real_workers_over_local_http_and_negative_responses(self):
        build.build(self.root, production=True)
        preview_root = Path(self.tmp.name)/'preview'
        shutil.copytree(self.root, preview_root, ignore=shutil.ignore_patterns('dist'))
        build.build(preview_root)
        process = subprocess.Popen(['node', str(ROOT/'tests/pages_http_fixture.mjs'),
                                    str(self.root/'dist'), str(preview_root/'dist')],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            self.assertTrue(select.select([process.stdout], [], [], 10)[0], 'Fixture startup timed out')
            port_line = process.stdout.readline().strip()
            if not port_line:
                self.fail('Fixture startup failed: ' + process.stderr.read())
            port = int(port_line)
            local = urllib.request.build_opener(production.NoRedirect)
            visited = []

            class LocalOpener:
                addheaders = []
                def open(self, request, timeout):
                    # Reuse preview verifier, which sets its UA at the opener level.
                    visited.append((request.full_url, request.get_method()))
                    headers = dict(self.addheaders)
                    headers.update(dict(request.header_items()))
                    headers['X-Revia-Fixture-Url'] = request.full_url
                    req = urllib.request.Request('http://127.0.0.1:' + str(port) + '/',
                                                 method=request.get_method(), data=request.data, headers=headers)
                    return local.open(req, timeout=timeout)

            transport = LocalOpener()
            checks = production.verify_http(self.root, transport)
            self.assertEqual(len(checks), 96)
            self.assertTrue(all(method in ('GET', 'HEAD') for _, method in visited))
            self.assertTrue(all('script.google.com' not in url for url, _ in visited))
            print('PRODUCTION_LOCAL_HTTP_VERIFIED checks=' + str(len(checks)))
            with patch.object(preview.urllib.request, 'build_opener', return_value=transport):
                preview_checks = preview.verify('https://validation.pages.dev', preview_root)
            self.assertEqual(len(preview_checks), 75)
            for path in ('/index.html', '/robots.txt', '/__qa/booking', '/missing'):
                request = urllib.request.Request('https://validation.pages.dev' + path)
                try:
                    response = transport.open(request, 20)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    self.assertIn('noindex', response.headers['X-Robots-Tag'])
                    policy = response.headers['Content-Security-Policy']
                    for directive in ("script-src 'self' 'unsafe-inline'", "connect-src 'self'",
                                      "frame-src 'none'", "form-action 'none'"):
                        self.assertIn(directive, policy)
            print('PREVIEW_LOCAL_HTTP_VERIFIED checks=' + str(len(preview_checks)))

            class FaultOpener:
                def __init__(self, fault): self.fault = fault
                def open(self, request, timeout):
                    if '/index.html' in request.full_url:
                        response = transport.open(request, timeout)
                        if self.fault == 'noindex': response.headers.add_header('X-Robots-Tag', 'Googlebot: NoIndex')
                        elif self.fault == 'csp': response.headers['Content-Security-Policy'] = "connect-src 'self'"
                        elif self.fault == 'type': response.headers.replace_header('Content-Type', 'text/plain')
                        elif self.fault == 'status': raise urllib.error.HTTPError(request.full_url, 503, '', response.headers, io.BytesIO(b''))
                        return response
                    if request.full_url.startswith('http:') or request.full_url.startswith('https://revia.website/'):
                        headers = {'Location': self.fault}
                        from email.message import Message
                        message = Message()
                        for key, value in headers.items(): message[key] = value
                        raise urllib.error.HTTPError(request.full_url, 308, '', message, io.BytesIO(b''))
                    return transport.open(request, timeout)

            for fault in ('noindex', 'csp', 'type', 'status',
                          'https://evil.invalid/', 'https://www.revia.website/?lost=query',
                          'https://revia.website/?revia_check=1'):
                with self.subTest(fault=fault):
                    with self.assertRaises(ReleaseError): production.verify_http(self.root, FaultOpener(fault))
        finally:
            process.terminate()
            process.communicate(timeout=10)


if __name__ == '__main__':
    unittest.main()

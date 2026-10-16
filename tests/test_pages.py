import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from datetime import datetime
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import build_pages as b
from column_release import ReleaseError, SLOTS, LEDGER, JST

class PagesTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)/'site'
        shutil.copytree(ROOT,self.root,ignore=shutil.ignore_patterns('.git','dist','.wrangler','__pycache__','tmp'))
    def tearDown(self):self.tmp.cleanup()

    def test_html_bytes_preserved_except_preview_completion(self):
        routes,_=b.build(self.root)
        for route,asset in routes.items():
            if route.endswith('.html') and route!='/404.html':
                expected=(self.root/route.lstrip('/')).read_bytes()
                if route=='/index.html': expected=b.preview_html(expected)
                self.assertEqual(expected,(self.root/'dist'/asset.lstrip('/')).read_bytes())
        self.assertEqual(routes['/'],routes['/index.html'])
        self.assertEqual(routes['/column/'],routes['/column/index.html'])

    def test_drafts_backup_sources_and_future_images_excluded(self):
        for name in ('column/future.html','images/column-2026-10-future.png','secret.js','scheduled/2026-10-20.enc.json','google-apps-script/canary.gs','tmp/private.txt','drafts/canary.html'):
            p=self.root/name;p.parent.mkdir(exist_ok=True);p.write_text('PRIVATE_CANARY')
        routes,public=b.build(self.root)
        self.assertFalse(any('future' in path or 'secret' in path for path in [*routes,*public]))
        for p in (self.root/'dist').rglob('*'):
            if p.is_file():self.assertNotIn(b'PRIVATE_CANARY',p.read_bytes())
        self.assertFalse((self.root/'dist/scripts').exists())
        for directory in ('google-apps-script','tmp','drafts','scheduled','docs','tests','config','publication','revia-site-vercel-drop-20260704'):
            self.assertFalse((self.root/'dist'/directory).exists(),directory)

    def test_nonpublic_paths_cannot_be_added_to_manifest(self):
        p=self.root/'config/pages-public.json';original=json.loads(p.read_text())
        for path in ('google-apps-script/source.js','tmp/backup.html','scheduled/draft.html','.env','private.gs'):
            manifest=json.loads(json.dumps(original));manifest['existing_static'].append(path)
            p.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ReleaseError,'NONPUBLIC_FILE_IN_MANIFEST'):b.build(self.root)

    def test_preview_static_and_html_responses_have_noindex(self):
        b.build(self.root)
        headers=(self.root/'dist/_headers').read_text()
        self.assertTrue(headers.startswith('/*\n'))
        self.assertIn('X-Robots-Tag: noindex, nofollow, noarchive',headers)
        worker=(self.root/'dist/_worker.js').read_text()
        self.assertIn("headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive'",worker)
        b.build(self.root,production=True)
        self.assertNotIn('X-Robots-Tag',(self.root/'dist/_headers').read_text())

    def test_preview_endpoints_are_mocked(self):
        original=(self.root/'script.js').read_bytes()
        b.build(self.root)
        for name in ('script.js','contact.js'):
            output=(self.root/'dist'/name).read_text()
            self.assertNotIn('https://script.google.com/macros/',output)
            self.assertIn('window.location.origin + "/__qa/booking"',output)
        self.assertEqual(original,(self.root/'script.js').read_bytes())
        self.assertIn('const PRODUCTION_APPROVED = false;', (self.root/'dist/_worker.js').read_text())

    def test_explicit_production_build_preserves_javascript(self):
        b.build(self.root,production=True)
        for name in ('script.js','contact.js'):
            self.assertEqual((self.root/name).read_bytes(),(self.root/'dist'/name).read_bytes())

    def test_preview_completion_and_production_html(self):
        original=(self.root/'index.html').read_bytes()
        routes,_=b.build(self.root)
        preview=(self.root/'dist'/routes['/index.html'].lstrip('/')).read_text()
        self.assertIn(b.PREVIEW_SUCCESS,preview)
        self.assertIn(b.PREVIEW_NO_MAIL,preview)
        self.assertNotIn('メールアドレスへお送りしました',preview)
        self.assertIn(b.PREVIEW_SUCCESS,(self.root/'dist/script.js').read_text())
        self.assertEqual(original,(self.root/'index.html').read_bytes())
        routes,_=b.build(self.root,production=True)
        self.assertEqual(original,(self.root/'dist'/routes['/index.html'].lstrip('/')).read_bytes())

    def test_future_ledger_and_unsafe_output_rejected(self):
        record={'path':'column/2026-10-test-20.html','assets_sha256':{}}
        with patch.object(b,'read_ledger',return_value={SLOTS[0]:record}), patch.object(b,'datetime') as clock:
            clock.now.return_value=datetime(2026,10,16,tzinfo=JST)
            with self.assertRaisesRegex(ReleaseError,'FUTURE_ARTICLE_IN_LEDGER'):b.build(self.root)
        with self.assertRaisesRegex(ReleaseError,'INVALID_OUTPUT'):b.build(self.root,self.root)

    def test_manifest_cannot_escape_root(self):
        p=self.root/'config/pages-public.json';m=json.loads(p.read_text());m['existing_static'].append('../outside')
        p.write_text(json.dumps(m))
        with self.assertRaisesRegex(ReleaseError,'INVALID_PUBLIC_PATH'):b.build(self.root)

    def test_existing_but_nonpublic_link_rejected(self):
        (self.root/'draft.html').write_text('PRIVATE')
        p=self.root/'index.html';p.write_text(p.read_text().replace('</body>','<a href="draft.html">TEST</a></body>'))
        with self.assertRaisesRegex(ReleaseError,'REFERENCE_NOT_IN_PUBLIC_OUTPUT'):b.build(self.root)

import json
import re
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import build_pages
import build_vercel_static
import prepare_november_column as november
from column_release import JST, ReleaseError, write_changes


@unittest.skipUnless((ROOT/november.DRAFTS/'manifest.json').is_file(), 'Private approved manuscripts are local-only; run release QA with the provided private package')
class NovemberTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)/'repo'
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns('.git','dist','vercel-public','__pycache__','node_modules','tmp'))
        self.entries = november.entries(self.root)
        # Every test starts from the pre-campaign fixture, even when run after a daily release.
        manifest_path = self.root/'config/pages-public.json'
        manifest = json.loads(manifest_path.read_text())
        for e in self.entries:
            if e['path'] not in manifest['existing_articles']:
                continue
            manifest['existing_articles'].remove(e['path'])
            manifest['existing_static'] = [p for p in manifest['existing_static'] if p not in e['assets']]
            (self.root/e['path']).unlink()
            for p in e['assets']:
                (self.root/p).unlink()
            for p in ('index.html', 'column/index.html'):
                file = self.root/p
                file.write_text(re.sub(r'<article class="column-(?:latest-card|card)">.*?</article>',
                    lambda m: '' if e['slug']+'.html' in m[0] else m[0], file.read_text(), flags=re.S))
            file = self.root/'sitemap.xml'
            file.write_text(re.sub(r'<url>.*?</url>', lambda m: '' if e['path'] in m[0] else m[0], file.read_text(), flags=re.S))
        home = self.root/'index.html'
        text = home.read_text()
        if '<article class="column-latest-card">' not in text:
            text = re.sub(r'<article class="column-card">.*?</article>',
                lambda m: m[0].replace('column-card"', 'column-latest-card"', 1).replace('>前回の記事<', '>最新記事<')
                if '2026-11-self-directed-learning-ai.html' in m[0] else m[0], text, flags=re.S)
            home.write_text(text)
        manifest_path.write_text(json.dumps(manifest))

    def tearDown(self):
        self.tmp.cleanup()

    def at(self, value):
        return datetime.fromisoformat(value)

    def test_all_five_before_at_and_after_boundary(self):
        baseline = {p.relative_to(self.root): p.read_bytes() for p in (self.root/'column').glob('*.html') if p.name != 'index.html'}
        for e in self.entries:
            boundary = self.at(e['publish_at'])
            with patch.object(november, 'current_time', return_value=boundary-timedelta(seconds=1)):
                with self.assertRaisesRegex(ReleaseError, 'TOO_EARLY'):
                    november.prepare(self.root, e['date'], november.current_time())
                html, static = build_pages.public_paths(self.root)
                self.assertNotIn(e['path'], html)
            with patch.object(november, 'current_time', return_value=boundary):
                changes = november.prepare(self.root, e['date'], boundary)
                self.assertEqual(set(changes), {e['path'], *e['assets'], 'index.html','column/index.html','sitemap.xml','config/pages-public.json'})
                write_changes(self.root, changes)
                routes, public = build_pages.build(self.root, production=True)
                self.assertIn('/'+e['path'], routes)
                build_vercel_static.build(self.root)
                self.assertEqual((self.root/'vercel-public'/e['path']).read_bytes(), changes[e['path']])
                for future in self.entries:
                    if future['date'] > e['date']:
                        self.assertNotIn('/'+future['path'], routes)
                        self.assertFalse(set('/'+p for p in future['assets']) & set(public))
                        self.assertFalse((self.root/'vercel-public'/future['path']).exists())
                with self.assertRaisesRegex(ReleaseError, 'ALREADY_PREPARED'):
                    november.prepare(self.root, e['date'], boundary+timedelta(seconds=1))
            for p, original in baseline.items():
                self.assertEqual((self.root/p).read_bytes(), original)
        home = (self.root/'index.html').read_text()
        self.assertIn('2026-11-self-directed-learning-ai.html', home)
        self.assertIn('2026-10-english-writing-simple-japanese.html', home)

    def test_current_build_excludes_drafts_and_manuscripts(self):
        with patch.object(november, 'current_time', return_value=self.at('2026-11-03T23:59:59+09:00')):
            routes, static = build_pages.build(self.root, production=True)
            build_vercel_static.build(self.root)
            for e in self.entries:
                self.assertNotIn('/'+e['path'], routes)
                self.assertFalse(set('/'+p for p in e['assets']) & set(static))
            for output in ('dist','vercel-public'):
                for p in (self.root/output).rglob('*'):
                    if p.is_file():
                        if p.suffix in ('.jpg','.png','.webp','.bin'): continue
                        text = p.read_text()
                        for e in self.entries:
                            self.assertNotIn(e['slug'], text)
                self.assertFalse((self.root/output/'drafts').exists())

    def test_build_without_private_drafts_succeeds(self):
        shutil.rmtree(self.root/'drafts')
        build_pages.build(self.root, production=True)
        build_vercel_static.build(self.root)

    def test_manual_manifest_and_reference_leaks_stop_both_builds(self):
        path = self.root/'config/pages-public.json'
        original = path.read_text()
        e = self.entries[0]
        with patch.object(november, 'current_time', return_value=self.at('2026-11-03T23:59:59+09:00')):
            for kind in ('article','image','reference'):
                manifest = json.loads(original)
                home = self.root/'index.html'; oldhome=home.read_text()
                if kind == 'article': manifest['existing_articles'].append(e['path'])
                elif kind == 'image': manifest['existing_static'].append(next(iter(e['assets'])))
                else: home.write_text(oldhome+'<!-- '+e['slug']+' -->')
                path.write_text(json.dumps(manifest))
                for builder in (build_pages.build, build_vercel_static.build):
                    with self.assertRaises(ReleaseError): builder(self.root)
                path.write_text(original); home.write_text(oldhome)

    def test_modified_approved_payload_is_rejected_without_writes(self):
        e = self.entries[0]
        for relative in ('approved.md','article.html',next(iter(e['assets']))):
            target = self.root/november.DRAFTS/e['date']/relative
            original = target.read_bytes(); target.write_bytes(original+b'changed')
            with patch.object(november, 'current_time', return_value=self.at(e['publish_at'])):
                with self.assertRaisesRegex(ReleaseError,'CHANGED'):
                    november.prepare(self.root, e['date'], november.current_time())
            self.assertFalse((self.root/e['path']).exists())
            target.write_bytes(original)

    def test_late_release_does_not_batch_future_or_overwrite_newer(self):
        late=self.at('2026-11-09T09:00:00+09:00')
        with patch.object(november,'current_time',return_value=late):
            e=self.entries[1]
            write_changes(self.root,november.prepare(self.root,e['date'],late))
            html,_=build_pages.public_paths(self.root)
            self.assertIn(e['path'],html)
            self.assertNotIn(self.entries[0]['path'],html)
            self.assertNotIn(self.entries[2]['path'],html)
            with self.assertRaisesRegex(ReleaseError,'OUT_OF_ORDER'):
                november.prepare(self.root,self.entries[0]['date'],late)

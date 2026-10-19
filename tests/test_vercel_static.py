"""Vercel isolation guarantees: only manifest-approved files are emitted."""
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_pages import public_paths
from build_vercel_static import build


class VercelStaticTests(unittest.TestCase):
    def test_vercel_config_uses_only_isolated_output(self):
        config = json.loads((ROOT / 'vercel.json').read_text())
        self.assertEqual(config['outputDirectory'], 'vercel-public')
        self.assertEqual(config['buildCommand'], 'python3 scripts/build_vercel_static.py')
        self.assertIs(config['cleanUrls'], False)

    def test_output_contains_exact_manifest_only(self):
        html, static = public_paths(ROOT)
        with TemporaryDirectory() as tmp:
            output = Path(tmp) / 'site'
            result = build(ROOT, output=output)
            expected = set(html + static)
            self.assertEqual(result['output_files'], len(expected))
            emitted = {p.relative_to(output).as_posix()
                       for p in output.rglob('*') if p.is_file()}
            self.assertEqual(emitted, expected)
            for path in expected:
                with self.subTest(path=path):
                    self.assertEqual((ROOT / path).read_bytes(), (output / path).read_bytes())
            for forbidden in ('google-apps-script/Code.gs', 'scripts/build_pages.py',
                              'tests/test_pages.py', 'docs/cloudflare-pages-validation.md',
                              'config/pages-public.json', 'tmp/backup.html',
                              'cloudflare/worker.template.js'):
                self.assertFalse((output / forbidden).exists())

    def test_vercel_output_ignored_by_git(self):
        self.assertIn('vercel-public/', (ROOT / '.gitignore').read_text())


if __name__ == '__main__':
    unittest.main()

import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import verify_pages_preview as preview


class PreviewClientTests(unittest.TestCase):
    def test_mock_calendar_uses_real_site_helpers(self):
        subprocess.run(['node', 'tests/check_preview_booking.mjs'], cwd=ROOT, check=True)

    def test_http_client_identifies_itself(self):
        class StopAfterRequest(Exception):
            pass
        class Opener:
            def open(self, request, timeout):
                self_headers = dict(self.addheaders)
                assert self_headers['User-Agent'] == 'REVIA-pages-validation/1.0'
                raise StopAfterRequest()
        with patch.object(preview.urllib.request, 'build_opener', return_value=Opener()):
            with self.assertRaises(StopAfterRequest):
                preview.verify('https://validation.pages.dev', ROOT)

"""Fail-closed regression tests for reusing the existing Pages validation project."""
import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from column_release import ReleaseError
from verify_pages_production import production_mode


class ValidationConversionTests(unittest.TestCase):
    def setUp(self):
        self.production = {
            'REVIA_PAGES_MODE': 'production',
            'REVIA_PAGES_PRODUCTION_APPROVED': 'true',
            'REVIA_PAGES_PRODUCTION_PROJECT': 'revia-website-validation',
            'REVIA_PAGES_VALIDATION_REPURPOSE_APPROVED': 'true',
            'CF_PAGES_BRANCH': 'main',
            'CF_PAGES_URL': 'https://revia-website-validation.pages.dev',
        }

    def test_explicit_validation_project_repurpose_main_only(self):
        self.assertTrue(production_mode(self.production))
        future_deployment = dict(self.production, CF_PAGES_URL='https://abcdef.revia-website-validation.pages.dev')
        self.assertTrue(production_mode(future_deployment))

    def test_missing_or_invalid_repurpose_approval_denied(self):
        for value in ('', 'false', 'TRUE', '1'):
            with self.subTest(value=value):
                env = dict(self.production)
                if value:
                    env['REVIA_PAGES_VALIDATION_REPURPOSE_APPROVED'] = value
                else:
                    del env['REVIA_PAGES_VALIDATION_REPURPOSE_APPROVED']
                with self.assertRaises(ReleaseError):
                    production_mode(env)

    def test_wrong_branch_or_url_denied(self):
        overrides = [
            {'CF_PAGES_BRANCH': 'codex/cloudflare-pages-validation'},
            {'CF_PAGES_BRANCH': 'revia/cloudflare-validation-conversion-20261019'},
            {'CF_PAGES_URL': 'https://other.pages.dev'},
            {'CF_PAGES_URL': 'https://revia-website-validation.pages.dev.evil.invalid'},
            {'CF_PAGES_URL': 'http://revia-website-validation.pages.dev'},
            {'CF_PAGES_URL': ''},
            {'REVIA_PAGES_PRODUCTION_APPROVED': 'false'},
            {'REVIA_PAGES_MODE': 'validation'},
        ]
        for changes in overrides:
            with self.subTest(changes=changes), self.assertRaises(ReleaseError):
                production_mode(dict(self.production, **changes))

    def test_existing_dedicated_production_project_still_supported(self):
        dedicated = dict(self.production,
            REVIA_PAGES_PRODUCTION_PROJECT='revia-website-production',
            CF_PAGES_URL='https://revia-website-production.pages.dev')
        dedicated.pop('REVIA_PAGES_VALIDATION_REPURPOSE_APPROVED')
        self.assertTrue(production_mode(dedicated))
        with self.assertRaises(ReleaseError):
            production_mode(dict(dedicated, REVIA_PAGES_VALIDATION_REPURPOSE_APPROVED='true'))

    def test_default_preview_still_has_no_production_permission(self):
        preview = {'REVIA_PAGES_MODE': 'validation',
                   'CF_PAGES_BRANCH': 'codex/cloudflare-pages-validation',
                   'CF_PAGES_URL': 'https://revia-website-validation.pages.dev'}
        self.assertFalse(production_mode(preview))
        with self.assertRaises(ReleaseError):
            production_mode(dict(preview, REVIA_PAGES_VALIDATION_REPURPOSE_APPROVED='true'))


if __name__ == '__main__':
    unittest.main()

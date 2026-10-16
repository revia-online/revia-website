"""Synthetic content only. Never add actual unpublished manuscripts to tests."""
import base64
from copy import deepcopy
from datetime import timedelta
import gzip
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import column_release as r
import commit_column_release as commit


def package(slot):
    title, description = "TEST ONLY", "Synthetic release test."
    slug = "2026-10-test-" + slot[-2:]
    url, timestamp = r.ORIGIN + "/column/" + slug + ".html", r.release_at(slot).isoformat()
    metas = {"description": description, "og:url": url, "og:title": title, "og:description": description,
             "og:image": r.ORIGIN + "/favicon.png", "article:published_time": timestamp,
             "article:modified_time": timestamp, "twitter:card": "summary", "twitter:title": title,
             "twitter:description": description, "twitter:image": r.ORIGIN + "/favicon.png"}
    structured = {"@type": "BlogPosting", "headline": title, "description": description,
                  "mainEntityOfPage": url, "datePublished": timestamp, "dateModified": timestamp}
    text = ('<!doctype html><html lang="ja"><head><title>TEST ONLY</title>'
            + ''.join(f'<meta property="{k}" content="{v}">' for k, v in metas.items())
            + f'<link rel="canonical" href="{url}"><link rel="stylesheet" href="../column.css">'
            + '<link rel="stylesheet" href="../styles.css">'
            + f'<script src="https://www.googletagmanager.com/gtag/js?id={r.GA4}"></script>'
            + f'<script>gtag("config", "{r.GA4}");</script>'
            + '<script type="application/ld+json">' + json.dumps(structured) + '</script>'
            + f'</head><body><h1>TEST ONLY</h1><time datetime="{timestamp}">公開日：2026年10月{int(slot[-2:])}日</time><p>Synthetic content.</p></body></html>')
    p = {"schema": 1, "slot": slot, "publish_at": timestamp,
         "article": {"slug": slug, "title": title, "description": description, "category": "TEST", "html": text}, "assets": {}}
    p["approval"] = {"by": "representative", "at": "2026-10-16T12:00:00+09:00", "sha256": r.fingerprint(p)}
    return p


def encode(p):
    return base64.b64encode(gzip.compress(json.dumps(p).encode())).decode()


def environment(*slots):
    return {"REVIA_ARTICLE_" + s.replace("-", ""): encode(package(s)) for s in slots}


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for path in ("index.html", "column/index.html", "sitemap.xml", "favicon.png", "styles.css", "column.css"):
            p = self.root / path
            p.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / path, p)

    def tearDown(self):
        self.tmp.cleanup()

    def apply(self, now, env):
        changes, missing, records = r.prepare(self.root, now, env)
        r.write_changes(self.root, changes)
        return changes, missing, records

    def test_every_boundary_and_utc_conversion(self):
        for slot in r.SLOTS:
            at = r.release_at(slot)
            self.assertNotIn(slot, r.due(at - timedelta(microseconds=1)))
            self.assertIn(slot, r.due(at))
            self.assertIn(slot, r.due(at + timedelta(seconds=1)))
            self.assertEqual(at.astimezone(r.timezone.utc).hour, 22)
            self.assertEqual((at - timedelta(days=1)).day, at.astimezone(r.timezone.utc).day)
        self.assertEqual(r.due(r.STOP), [])
        self.assertEqual(r.due(r.STOP + timedelta(days=365)), [])

    def test_before_publication_never_reads_future_payload(self):
        changes, missing, records = r.prepare(self.root, r.release_at(r.SLOTS[0]) - timedelta(seconds=1),
                                            {"REVIA_ARTICLE_20261020": "INVALID SECRET"})
        self.assertEqual((changes, missing, records), ({}, [], {}))

    def test_missing_approval_skips_without_exposure(self):
        changes, missing, records = r.prepare(self.root, r.release_at(r.SLOTS[0]), {})
        self.assertFalse(changes)
        self.assertEqual(missing, [r.SLOTS[0]])
        self.assertFalse(records)

    def test_first_release_is_atomic_and_idempotent(self):
        at, env = r.release_at(r.SLOTS[0]), environment(r.SLOTS[0])
        original = {p: (self.root / p).read_bytes() for p in ("index.html", "column/index.html", "sitemap.xml")}
        changes, missing, records = self.apply(at, env)
        self.assertEqual(len(changes), 5)
        self.assertFalse(missing)
        self.assertEqual(self.apply(at + timedelta(minutes=10), env)[0], {})
        self.assertEqual((self.root / records[r.SLOTS[0]]["path"]).read_text(), package(r.SLOTS[0])["article"]["html"])
        home, listing = (self.root / "index.html").read_text(), (self.root / "column/index.html").read_text()
        for path, text, tag, cls in (("index.html", home, "article", "column-latest-card"), ("column/index.html", listing, "div", "column-card-grid")):
            old = original[path].decode()
            s, _, _, e = r.element_span(old, tag, cls)
            ns, _, _, ne = r.element_span(text, tag, cls)
            self.assertEqual(old[:s], text[:ns])
            self.assertEqual(old[e:], text[ne:])
        self.assertIn('gtag("config", "G-734S14C7HR")', home)
        self.assertIn('href="column/2026-10-choosing-target-school.html"', home)
        self.assertIn("<h3>", home)

    def test_all_six_and_no_seventh(self):
        env = environment(*r.SLOTS)
        for n, slot in enumerate(r.SLOTS, 1):
            _, missing, records = self.apply(r.release_at(slot), env)
            self.assertEqual(len(records), n)
            self.assertFalse(missing)
        self.assertEqual(self.apply(r.STOP, env)[0], {})
        self.assertEqual(len(list((self.root / "column").glob("2026-10-test-*.html"))), 6)

    def test_late_approval_preserves_newest_order(self):
        at = r.release_at(r.SLOTS[1])
        _, missing, _ = self.apply(at, environment(r.SLOTS[1]))
        self.assertEqual(missing, [r.SLOTS[0]])
        self.apply(at, environment(r.SLOTS[0]))
        listing = (self.root / "column/index.html").read_text()
        self.assertLess(listing.index("2026-10-test-22.html"), listing.index("2026-10-test-20.html"))
        self.assertIn("2026-10-test-22.html", (self.root / "index.html").read_text())

    def test_tampering_and_wrong_approver_and_future_approval(self):
        for mutation in (lambda p: p["article"].update(title="ALTERED"),
                         lambda p: p["approval"].update(by="someone_else"),
                         lambda p: p["approval"].update(at="2026-11-01T00:00:00+09:00")):
            p = package(r.SLOTS[0]); mutation(p)
            with self.assertRaises(r.ReleaseError):
                r.validate(p, r.SLOTS[0], r.release_at(r.SLOTS[0]))

    def test_wrong_seo_ga4_css_and_traversal_rejected(self):
        for old, new in ((r.GA4, "G-WRONG"), ("../column.css", "other.css"), (r.ORIGIN, "https://invalid.example")):
            p = package(r.SLOTS[0]); p["article"]["html"] = p["article"]["html"].replace(old, new)
            p["approval"]["sha256"] = r.fingerprint(p)
            with self.assertRaises(r.ReleaseError):
                r.validate(p, r.SLOTS[0], r.release_at(r.SLOTS[0]))
        p = package(r.SLOTS[0]); p["article"]["slug"] = "../../index"
        p["approval"]["sha256"] = r.fingerprint(p)
        with self.assertRaises(r.ReleaseError):
            r.validate(p, r.SLOTS[0], r.release_at(r.SLOTS[0]))

    def test_collision_and_changed_published_content_fail_closed(self):
        slot = r.SLOTS[0]
        self.apply(r.release_at(slot), environment(slot))
        path = self.root / "column/2026-10-test-20.html"
        path.write_text("MANUAL EDIT")
        with self.assertRaisesRegex(r.ReleaseError, "PUBLISHED_FILE_CHANGED"):
            r.prepare(self.root, r.release_at(slot), {})

    def reject_html(self, old, new, code):
        slot = r.SLOTS[0]
        p = package(slot)
        self.assertIn(old, p['article']['html'])
        p['article']['html'] = p['article']['html'].replace(old, new)
        # Even a matching approval digest must not bypass semantic validation.
        p['approval']['sha256'] = r.fingerprint(p)
        before = {str(f.relative_to(self.root)): f.read_bytes() for f in self.root.rglob('*') if f.is_file()}
        with self.assertRaisesRegex(r.ReleaseError, code):
            self.apply(r.release_at(slot), {'REVIA_ARTICLE_20261020': encode(p)})
        self.assertEqual(before, {str(f.relative_to(self.root)): f.read_bytes() for f in self.root.rglob('*') if f.is_file()})

    def test_reject_wrong_html_title(self):
        self.reject_html('<title>TEST ONLY</title>', '<title>WRONG</title>', 'HTML_TITLE_MISMATCH')

    def test_existing_article_template_accepts_synthetic_replacement(self):
        slot=r.SLOTS[0];p=package(slot)
        source=(ROOT/'column/2026-10-choosing-target-school.html').read_text()
        old=r.Page(source)
        # Replace text; preserve real template structure without creating a new opinion.
        for key in ('og:title','og:description'):
            source=source.replace(old.metas[key],p['article']['title' if key=='og:title' else 'description'])
        start=source.index('<h1>');end=source.index('</h1>',start)
        source=source[:start]+'<h1>TEST ONLY'+source[end:]
        source=source.replace('2026-10-choosing-target-school',p['article']['slug']).replace('2026-10-10T09:00:00+09:00',p['publish_at']).replace('2026年10月10日','2026年10月20日')
        p['article']['html']=source;p['approval']['sha256']=r.fingerprint(p)
        r.validate(p,slot,r.release_at(slot),ROOT)

    def test_reject_wrong_ogp_title(self):
        self.reject_html('property="og:title" content="TEST ONLY"', 'property="og:title" content="WRONG"', 'SOCIAL_TITLE_MISMATCH')

    def test_reject_wrong_visible_date(self):
        self.reject_html('公開日：2026年10月20日', '公開日：2026年10月19日', 'VISIBLE_DATE_MISMATCH')

    def test_reject_missing_image(self):
        self.reject_html('</body>', '<img src="../images/nonexistent.png"></body>', 'INTERNAL_IMAGE_MISSING')

    def test_reject_broken_internal_link(self):
        self.reject_html('</body>', '<a href="../nonexistent.html">TEST</a></body>', 'INTERNAL_LINK_MISSING')

    def test_reject_broken_anchor_and_unsafe_reference(self):
        self.reject_html('</body>', '<a href="#missing">TEST</a></body>', 'INTERNAL_ANCHOR_MISSING')
        self.reject_html('</body>', '<a href="javascript:alert(1)">TEST</a></body>', 'UNSAFE_REFERENCE')

    def test_template_drift_never_writes_partial_files(self):
        p = self.root / "index.html"
        p.write_text(p.read_text().replace("column-latest-card", "changed-template"))
        with self.assertRaises(r.ReleaseError):
            self.apply(r.release_at(r.SLOTS[0]), environment(r.SLOTS[0]))
        self.assertFalse((self.root / "column/2026-10-test-20.html").exists())

    def test_actual_url_checker_rejects_stale_or_404(self):
        now = r.release_at(r.SLOTS[0])
        self.apply(now, environment(r.SLOTS[0]))
        def fetch(path):
            local = {"/": "index.html", "/column/": "column/index.html"}.get(path, path.lstrip("/"))
            return (self.root / local).read_bytes()
        self.assertEqual(r.verify_once(self.root, now, fetch), 1)
        for broken in (lambda p: b"STALE" if p.endswith(".html") else fetch(p),
                       lambda p: b"<urlset/>" if p == "/sitemap.xml" else fetch(p)):
            with self.assertRaises(Exception):
                r.verify_once(self.root, now, broken)
        def unavailable(path):
            raise OSError("404")
        with self.assertRaises(OSError):
            r.verify_once(self.root, now, unavailable)

    def test_cli_does_not_print_malformed_private_data(self):
        private = self.root / "private.json"
        private.write_text('{"PRIVATE_UNPUBLISHED_CANARY":')
        p = subprocess.run([sys.executable, str(ROOT / "scripts/column_release.py"), "pack", "--input", str(private), "--output", str(self.root / "out")], capture_output=True, text=True)
        self.assertEqual(p.returncode, 1)
        self.assertNotIn("PRIVATE_UNPUBLISHED_CANARY", p.stdout + p.stderr)

    def test_secret_size_and_new_asset_verification(self):
        with self.assertRaisesRegex(r.ReleaseError, "SECRET_TOO_LARGE"):
            r.decode("A" * (48 * 1024 + 1))
        slot = r.SLOTS[0]
        p = package(slot)
        p["assets"] = {"images/column-2026-10-test.png": base64.b64encode(b"SYNTHETIC IMAGE BYTES").decode()}
        p["approval"]["sha256"] = r.fingerprint(p)
        now = r.release_at(slot)
        self.apply(now, {"REVIA_ARTICLE_20261020": encode(p)})
        def fetch(path):
            local = {"/": "index.html", "/column/": "column/index.html"}.get(path, path.lstrip("/"))
            return (self.root / local).read_bytes()
        self.assertEqual(r.verify_once(self.root, now, fetch), 1)
        (self.root / "images/column-2026-10-test.png").write_bytes(b"STALE")
        with self.assertRaisesRegex(r.ReleaseError, "PUBLIC_ASSET_HASH_MISMATCH"):
            r.verify_once(self.root, now, fetch)

    def test_schedule_uses_only_six_dates_and_retries(self):
        workflow = (ROOT / ".github/workflows/column-release-202610.yml").read_text()
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertIn("vars.REVIA_PUBLISH_202610_ENABLED", workflow)
        self.assertNotIn("pull_request_target", workflow)

    def test_git_push_and_concurrent_main_conflict(self):
        def git(cwd, *args):
            p = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
            self.assertEqual(p.returncode, 0, p.stderr)
            return p.stdout.strip()
        remote = self.root / "remote.git"
        git(self.root, "init", "--bare", "--initial-branch=main", str(remote))
        repo = self.root / "repo"
        git(self.root, "clone", str(remote), str(repo))
        git(repo, "config", "user.name", "Release Test")
        git(repo, "config", "user.email", "test@example.invalid")
        for p in ("index.html", "column/index.html", "sitemap.xml", "favicon.png", "styles.css", "column.css"):
            dest = repo / p; dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(self.root / p, dest)
        git(repo, "add", "."); git(repo, "commit", "-m", "Baseline"); git(repo, "push", "origin", "main")
        runner = self.root / "runner"; runner.mkdir()
        env = {"GITHUB_REF": "refs/heads/main", "REVIA_PUBLISH_202610_ENABLED": "true", "RUNNER_TEMP": str(runner),
               "REVIA_RELEASE_AUTHOR_NAME": "Release Test", "REVIA_RELEASE_AUTHOR_EMAIL": "test@example.invalid"}
        from datetime import datetime
        class Clock:
            @staticmethod
            def now(zone):
                return r.release_at(r.SLOTS[1])
        old_cwd = Path.cwd()
        import os
        try:
            os.chdir(repo)
            for slot in r.SLOTS[:2]:
                changes, _, _ = r.prepare(repo, r.release_at(slot), environment(slot))
                r.write_changes(repo, changes)
                (runner / "revia-release-paths.json").write_text(json.dumps(sorted(changes)))
                if slot == r.SLOTS[1]:
                    other = self.root / "other"
                    git(self.root, "clone", str(remote), str(other))
                    git(other, "config", "user.name", "Human Test"); git(other, "config", "user.email", "test@example.invalid")
                    (other / "README.md").write_text("Concurrent human edit")
                    git(other, "add", "README.md"); git(other, "commit", "-m", "Human edit"); git(other, "push", "origin", "main")
                    remote_head = git(remote, "rev-parse", "main")
                with patch.dict(os.environ, env), patch.object(commit, "datetime", Clock):
                    if slot == r.SLOTS[0]:
                        commit.main()
                        self.assertEqual(git(repo, "rev-parse", "HEAD"), git(remote, "rev-parse", "main"))
                    else:
                        with self.assertRaisesRegex(r.ReleaseError, "CONCURRENT_MAIN_CHANGE"):
                            commit.main()
                        self.assertEqual(git(remote, "rev-parse", "main"), remote_head)
        finally:
            os.chdir(old_cwd)


if __name__ == "__main__":
    unittest.main()

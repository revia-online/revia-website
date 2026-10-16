#!/usr/bin/env python3
"""Finite October 2026 release campaign. Python standard library only."""
import argparse
import base64
import gzip
import hashlib
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timedelta, timezone
import urllib.request
import urllib.error
import time
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlsplit, unquote

JST = timezone(timedelta(hours=9))
DATES = (20, 22, 24, 27, 29, 31)
SLOTS = tuple(f"2026-10-{d:02d}" for d in DATES)
STOP = datetime(2026, 11, 1, tzinfo=JST)
ORIGIN = "https://www.revia.website"
GA4 = "G-734S14C7HR"
LEDGER = "publication/2026-10.json"
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


class ReleaseError(Exception):
    """Messages must never include raw payloads or third-party error bodies."""


def require(condition, code):
    if not condition:
        raise ReleaseError(code)


def instant(value):
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(dt.tzinfo is not None, "TIMEZONE_REQUIRED")
    return dt.astimezone(JST)


def release_at(slot):
    require(slot in SLOTS, "UNKNOWN_SLOT")
    return instant(slot + "T07:00:00+09:00")


def due(now):
    # No CLI option can move the production clock or bypass the campaign end.
    return [s for s in SLOTS if release_at(s) <= now < STOP]


def fingerprint(payload):
    fields = {k: payload[k] for k in ("slot", "publish_at", "article", "assets")}
    return hashlib.sha256(json.dumps(fields, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode()).hexdigest()


def decode(value):
    require(len(value.encode()) <= 48 * 1024, "SECRET_TOO_LARGE")
    compressed = base64.b64decode(value, validate=True)
    # Bounded decompression, including protection against compressed bombs.
    import io
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
        raw = stream.read(1024 * 1024 + 1)
    require(len(raw) <= 1024 * 1024, "PAYLOAD_TOO_LARGE")
    return json.loads(raw)


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.metas, self.links, self.scripts = {}, [], []
        self.refs, self.ids, self.texts, self.active = [], set(), {}, []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        if tag in ("title", "h1", "time"):
            entry = {"tag": tag, "attrs": a, "text": ""}
            self.texts.setdefault(tag, []).append(entry)
            self.active.append(entry)
        if tag == "a" and a.get("href"):
            self.refs.append(("link", a["href"]))
        if tag == "img" and a.get("src"):
            self.refs.append(("image", a["src"]))
        if tag == "meta":
            key = a.get("property", a.get("name", ""))
            require(key not in self.metas or not key, "DUPLICATE_META")
            self.metas[key] = a.get("content", "")
        elif tag == "link":
            self.links.append(a)
        elif tag == "script":
            self.scripts.append(a)

    def handle_data(self, data):
        for entry in self.active:
            entry["text"] += data

    def handle_endtag(self, tag):
        for i in range(len(self.active)-1, -1, -1):
            if self.active[i]["tag"] == tag:
                self.active.pop(i)
                break


def check_references(page, root, article_path, assets):
    origin = ORIGIN + "/" + article_path
    refs = page.refs + [("image", page.metas[k]) for k in ("og:image", "twitter:image") if page.metas.get(k)]
    for kind, ref in refs:
        url = urlsplit(urljoin(origin, ref))
        if url.scheme in ("mailto", "tel") and kind == "link":
            continue
        require(url.scheme in ("http", "https"), "UNSAFE_REFERENCE")
        if url.netloc != urlsplit(ORIGIN).netloc:
            require(kind == "link", "EXTERNAL_IMAGE_NOT_ALLOWED")
            continue
        rel = unquote(url.path).lstrip("/")
        if rel == article_path:
            require(not url.fragment or unquote(url.fragment) in page.ids, "INTERNAL_ANCHOR_MISSING")
            continue
        if rel in assets:
            continue
        target = (root / rel).resolve()
        require(target == root.resolve() or root.resolve() in target.parents, "REFERENCE_PATH_ESCAPE")
        if target.is_dir():
            target /= "index.html"
        require(target.is_file(), "INTERNAL_IMAGE_MISSING" if kind == "image" else "INTERNAL_LINK_MISSING")
        if url.fragment and target.suffix == ".html":
            require(unquote(url.fragment) in Page(target.read_text()).ids, "INTERNAL_ANCHOR_MISSING")


def validate(payload, slot, now, root=None):
    require(payload["schema"] == 1 and payload["slot"] == slot, "INVALID_PAYLOAD")
    require(payload["publish_at"] == release_at(slot).isoformat(), "SCHEDULE_MISMATCH")
    approval = payload["approval"]
    require(approval["by"] == "representative", "REPRESENTATIVE_APPROVAL_REQUIRED")
    require(instant(approval["at"]) <= now, "APPROVAL_IN_FUTURE")
    require(approval["sha256"] == fingerprint(payload), "APPROVAL_HASH_MISMATCH")
    a = payload["article"]
    require(re.fullmatch(r"2026-10-[a-z0-9]+(?:-[a-z0-9]+)*", a["slug"]), "INVALID_SLUG")
    for key in ("title", "description", "category", "html"):
        require(isinstance(a[key], str) and a[key].strip(), "MISSING_ARTICLE_FIELD")
    text = a["html"]
    page = Page(text)
    normalize = lambda value: "".join(value.split())
    titles = [e["text"] for e in page.texts.get("title", [])]
    allowed_titles = (a["title"], a["title"] + "｜代表の視点｜REVIA column")
    require(len(titles) == 1 and titles[0] in allowed_titles, "HTML_TITLE_MISMATCH")
    headings = page.texts.get("h1", [])
    require(len(headings) == 1 and normalize(headings[0]["text"]) == normalize(a["title"]), "H1_MISMATCH")
    date_text = f"2026年10月{int(slot[-2:])}日"
    times = [e for e in page.texts.get("time", []) if e["attrs"].get("datetime") == payload["publish_at"]]
    require(len(times) == 1 and normalize(times[0]["text"]) in (date_text, "公開日：" + date_text), "VISIBLE_DATE_MISMATCH")
    for key in ("og:title", "twitter:title"):
        require(page.metas.get(key) == a["title"], "SOCIAL_TITLE_MISMATCH")
    for key in ("og:description", "twitter:description"):
        require(page.metas.get(key) == a["description"], "SOCIAL_DESCRIPTION_MISMATCH")
    url = ORIGIN + "/column/" + a["slug"] + ".html"
    require([l.get("href") for l in page.links if l.get("rel") == "canonical"] == [url], "CANONICAL_MISMATCH")
    require(page.metas.get("description") == a["description"], "DESCRIPTION_MISMATCH")
    require(page.metas.get("og:url") == url, "OG_URL_MISMATCH")
    require(page.metas.get("article:published_time") == payload["publish_at"], "ARTICLE_TIME_MISMATCH")
    require(page.metas.get("article:modified_time") == payload["publish_at"], "MODIFIED_TIME_MISMATCH")
    for key in ("og:title", "og:description", "og:image", "twitter:card", "twitter:title", "twitter:description", "twitter:image"):
        require(page.metas.get(key), "SEO_FIELD_MISSING")
    require(any(s.get("src") == f"https://www.googletagmanager.com/gtag/js?id={GA4}" for s in page.scripts), "GA4_MISSING")
    require(re.search(r"gtag\([\"']config[\"']\s*,\s*[\"']" + GA4 + r"[\"']\)", text), "GA4_CONFIG_MISSING")
    require(any(l.get("href") == "../column.css" for l in page.links), "COLUMN_CSS_MISSING")
    require(any(l.get("href") == "../styles.css" for l in page.links), "SITE_CSS_MISSING")
    require(html.escape(a["title"]) in text or a["title"] in text, "TITLE_MISSING")
    structured = re.findall(r'<script\s+type=[\"\']application/ld\+json[\"\']\s*>(.*?)</script>', text, re.S)
    records = [json.loads(x) for x in structured]
    posts = [r for r in records if isinstance(r, dict) and r.get("@type") == "BlogPosting"]
    require(len(posts) == 1, "BLOGPOSTING_REQUIRED")
    post = posts[0]
    require(post.get("datePublished") == payload["publish_at"] and post.get("dateModified") == payload["publish_at"], "STRUCTURED_TIME_MISMATCH")
    require(post.get("headline") == a["title"] and post.get("description") == a["description"], "STRUCTURED_TEXT_MISMATCH")
    main = post.get("mainEntityOfPage")
    require(main == url or isinstance(main, dict) and main.get("@id") == url, "STRUCTURED_URL_MISMATCH")
    assets = {}
    for path, value in payload["assets"].items():
        require(re.fullmatch(r"images/column-2026-10-[a-z0-9-]+\.(?:jpg|jpeg|png|webp)", path), "INVALID_ASSET_PATH")
        assets[path] = base64.b64decode(value, validate=True)
        require(assets[path], "EMPTY_ASSET")
    check_references(page, root or Path.cwd(), "column/" + a["slug"] + ".html", assets)
    return a, assets


def read_ledger(root):
    p = root / LEDGER
    records = json.loads(p.read_text()) if p.exists() else {}
    require(isinstance(records, dict) and set(records) <= set(SLOTS), "INVALID_LEDGER")
    for slot, record in records.items():
        require(record["publish_at"] == release_at(slot).isoformat(), "INVALID_LEDGER_TIME")
        require(re.fullmatch(r"column/2026-10-[a-z0-9-]+\.html", record["path"]), "INVALID_LEDGER_PATH")
        require((root / record["path"]).is_file(), "PUBLISHED_FILE_MISSING")
        require(hashlib.sha256((root / record["path"]).read_bytes()).hexdigest() == record["html_sha256"], "PUBLISHED_FILE_CHANGED")
    require(len({r["path"] for r in records.values()}) == len(records), "DUPLICATE_PUBLISHED_PATH")
    return records


def element_span(text, tag, class_name):
    # Find balanced HTML element boundaries, retaining every byte outside them.
    pattern = re.compile(r"</?" + re.escape(tag) + r"\b[^>]*>", re.I)
    matches = [m for m in pattern.finditer(text) if not m.group().startswith("</") and
               re.search(r'class=[\"\'][^\"\']*\b' + re.escape(class_name) + r'\b[^\"\']*[\"\']', m.group())]
    require(len(matches) == 1, "TEMPLATE_BOUNDARY_MISMATCH")
    first = matches[0]
    depth = 1
    for m in pattern.finditer(text, first.end()):
        depth += -1 if m.group().startswith("</") else 1
        if depth == 0:
            return first.start(), first.end(), m.start(), m.end()
    raise ReleaseError("TEMPLATE_UNCLOSED")


def card(a, slot, latest=False):
    esc = lambda key: html.escape(a[key], quote=True)
    href = ("column/" if latest else "") + a["slug"] + ".html"
    cls = "column-latest-card" if latest else "column-card"
    excerpt_cls = "" if latest else ' class="column-card-excerpt"'
    number = 5 + SLOTS.index(slot)
    label = "最新記事" if latest else f"第{number}回"
    meta = f"第{number}回" if latest else esc("category")
    heading = "h3" if latest else "h2"
    date = f"2026年10月{int(slot[-2:])}日"
    image = ""
    if a.get("image"):
        img = a["image"]
        src = ("" if latest else "../") + img["path"]
        image = (f'<a class="column-card-image-link" href="{href}"><img class="column-card-image" '
                 f'src="{src}" alt="{html.escape(img["alt"], quote=True)}" width="{img["width"]}" height="{img["height"]}" loading="lazy" decoding="async" /></a>\n')
    return (f'<article class="{cls}">\n{image}<p class="column-card-label">{label}</p>\n'
            f'<p class="column-card-meta"><time datetime="{release_at(slot).isoformat()}">{date}</time>'
            f'<span>{meta}</span></p>\n<{heading}><a href="{href}">{esc("title")}</a></{heading}>\n'
            f'<p{excerpt_cls}>{esc("description")}</p>\n'
            f'<a class="column-text-link" href="{href}">続きを読む</a>\n</article>')


def prepare(root, now, environ):
    records = read_ledger(root)
    changes, missing = {}, []
    listing = (root / "column/index.html").read_text()
    home = (root / "index.html").read_text()
    sitemap = (root / "sitemap.xml").read_text()
    for slot in due(now):
        if slot in records:
            continue
        value = environ.get("REVIA_ARTICLE_" + slot.replace("-", ""), "")
        encrypted = root / 'scheduled' / (slot + '.enc.json')
        if encrypted.is_file():
            require(not value, 'AMBIGUOUS_ARTICLE_SOURCE')
            require(encrypted.stat().st_size <= 16*1024*1024, 'PAYLOAD_TOO_LARGE')
            from seal_column import crypt
            try:
                payload = json.loads(crypt('decrypt', slot, encrypted.read_bytes(), dict(environ)))
            except Exception:
                raise ReleaseError('BUNDLE_CRYPTO_FAILED') from None
        elif value:
            payload = decode(value)
        else:
            missing.append(slot)
            continue
        a, assets = validate(payload, slot, now, root)
        if a.get("image"):
            img = a["image"]
            require(re.fullmatch(r"images/[a-zA-Z0-9-]+\.(?:jpg|jpeg|png|webp)", img["path"]), "INVALID_CARD_IMAGE")
            require(isinstance(img["alt"], str) and all(type(img[k]) is int and img[k] > 0 for k in ("width", "height")), "INVALID_IMAGE_ATTRIBUTES")
            require(img["path"] in assets or (root / img["path"]).is_file(), "CARD_IMAGE_MISSING")
        path = "column/" + a["slug"] + ".html"
        require(path not in changes and not (root / path).exists() and path not in {r["path"] for r in records.values()}, "ARTICLE_PATH_EXISTS")
        require(a["slug"] + ".html" not in listing and ORIGIN + "/" + path not in sitemap, "ARTICLE_ALREADY_REFERENCED")
        for asset_path, data in assets.items():
            require(not (root / asset_path).exists() and asset_path not in changes, "ASSET_PATH_EXISTS")
            changes[asset_path] = data
        changes[path] = a["html"].encode()
        _, open_end, close_start, _ = element_span(listing, "div", "column-card-grid")
        insertion = close_start
        for existing in re.finditer(r'<article class="column-card">.*?</article>', listing[open_end:close_start], re.S):
            date = re.search(r'datetime="(\d{4}-\d{2}-\d{2})', existing.group())
            require(date is not None, "CARD_DATE_MISSING")
            if date[1] < slot:
                insertion = open_end + existing.start()
                break
        listing = listing[:insertion] + card(a, slot) + "\n" + listing[insertion:]
        require(sitemap.count("</urlset>") == 1, "SITEMAP_BOUNDARY_MISMATCH")
        sitemap = sitemap.replace("</urlset>", f'  <url><loc>{ORIGIN}/{path}</loc><lastmod>{slot}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>')
        records[slot] = {"path": path, "publish_at": release_at(slot).isoformat(), "approval_sha256": payload["approval"]["sha256"],
                         "html_sha256": hashlib.sha256(changes[path]).hexdigest(), "released_at": now.isoformat(),
                         "assets_sha256": {p: hashlib.sha256(data).hexdigest() for p, data in assets.items()}}
        # A late earlier article must not replace a newer latest article.
        if slot == max(records):
            start, _, _, end = element_span(home, "article", "column-latest-card")
            old = home[start:end]
            previous = re.findall(r'<a\s+class="column-previous-link"[^>]*>.*?</a>', old, re.S)
            prior_path = re.search(r'href="(column/[a-z0-9-]+\.html)"', old)
            prior_number = re.search(r"第(\d+)回", old)
            require(prior_path and prior_number, "PREVIOUS_LATEST_MISSING")
            links = f'<a class="column-previous-link" href="{prior_path[1]}">第{prior_number[1]}回の記事を読む</a>\n' + "\n".join(previous)
            latest = card(a, slot, latest=True).replace("</article>", links + "\n</article>")
            home = home[:start] + latest + home[end:]
    if changes:
        for loc in (ORIGIN + "/", ORIGIN + "/column/"):
            pattern = r"(<loc>" + re.escape(loc) + r"</loc>\s*<lastmod>)[^<]+(</lastmod>)"
            require(len(re.findall(pattern, sitemap)) == 1, "SITEMAP_EXISTING_ENTRY_MISMATCH")
            sitemap = re.sub(pattern, lambda m: m[1] + max(records) + m[2], sitemap)
        ET.fromstring(sitemap)
        changes.update({"column/index.html": listing.encode(), "index.html": home.encode(), "sitemap.xml": sitemap.encode(),
                        LEDGER: (json.dumps(records, indent=2, ensure_ascii=False) + "\n").encode()})
    return changes, missing, records


def write_changes(root, changes):
    # All validation precedes writes. Only one git commit later publishes the set.
    for path, data in changes.items():
        p = root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)


def fetch_public(path):
    request = urllib.request.Request(ORIGIN + path, headers={"Cache-Control": "no-cache", "User-Agent": "REVIA-publication-check/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            require(response.status == 200, "HTTP_NOT_200 " + path)
            require(response.geturl() == ORIGIN + path, "UNEXPECTED_REDIRECT " + path)
            return response.read(8 * 1024 * 1024)
    except urllib.error.HTTPError as error:
        raise ReleaseError(f"HTTP_{error.code} {path}") from None
    except (urllib.error.URLError, TimeoutError):
        raise ReleaseError("NETWORK_OR_TIMEOUT " + path) from None


def verify_once(root, now, fetch=fetch_public):
    records = read_ledger(root)
    require(records, "NOTHING_PUBLISHED")
    listing = fetch("/column/").decode()
    home = fetch("/").decode()
    tree = ET.fromstring(fetch("/sitemap.xml"))
    require(ET.tostring(tree) == ET.tostring(ET.fromstring((root / "sitemap.xml").read_bytes())), "PUBLIC_SITEMAP_STALE")
    urls = [e.text for e in tree.findall(f"{{{NS}}}url/{{{NS}}}loc")]
    for slot, record in records.items():
        require(release_at(slot) <= now, "PUBLISHED_TOO_EARLY")
        path = record["path"]
        body = fetch("/" + path)
        require(hashlib.sha256(body).hexdigest() == record["html_sha256"], "PUBLIC_ARTICLE_HASH_MISMATCH " + path)
        for asset, digest in record.get("assets_sha256", {}).items():
            require(re.fullmatch(r"images/column-2026-10-[a-z0-9-]+\.(?:jpg|jpeg|png|webp)", asset), "INVALID_LEDGER_ASSET")
            require(hashlib.sha256(fetch("/" + asset)).hexdigest() == digest, "PUBLIC_ASSET_HASH_MISMATCH " + asset)
        require(urls.count(ORIGIN + "/" + path) == 1, "PUBLIC_SITEMAP_MISMATCH")
        require(Path(path).name in listing, "PUBLIC_LISTING_MISMATCH")
    require(records[max(records)]["path"] in home, "PUBLIC_LATEST_MISMATCH")
    # Match the entire latest card and list, catching stale/mixed deployments.
    for remote, local_path, tag, cls in ((listing, "column/index.html", "div", "column-card-grid"), (home, "index.html", "article", "column-latest-card")):
        local = (root / local_path).read_text()
        s, _, _, e = element_span(remote, tag, cls)
        ls, _, _, le = element_span(local, tag, cls)
        require(remote[s:e] == local[ls:le], "PUBLIC_COMPONENT_MISMATCH")
    return len(records)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("gate", "prepare", "verify", "pack"))
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--attempts", type=int, default=1)
    args = parser.parse_args()
    now = datetime.now(JST)
    if args.command == "gate":
        allowed = bool(due(now)) and os.environ.get("REVIA_PUBLISH_202610_ENABLED") == "true" and os.environ.get("GITHUB_REF") == "refs/heads/main"
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as out:
                out.write(f"allowed={'true' if allowed else 'false'}\n")
        print("CAMPAIGN_ACTIVE" if allowed else "CAMPAIGN_INACTIVE")
    elif args.command == "pack":
        require(args.input and args.output, "INPUT_OUTPUT_REQUIRED")
        # Input is private JSON including the representative's approval record.
        p = json.loads(args.input.read_text())
        validate(p, p["slot"], now, args.root)
        value = base64.b64encode(gzip.compress(json.dumps(p, ensure_ascii=False).encode(), mtime=0))
        require(len(value) <= 48 * 1024, "SECRET_TOO_LARGE_USE_PRIVATE_STORAGE")
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as out:
            out.write(value)
        print("PRIVATE_PACKAGE_WRITTEN")
    elif args.command == "prepare":
        if args.apply:
            require(os.environ.get("REVIA_PUBLISH_202610_ENABLED") == "true" and os.environ.get("GITHUB_REF") == "refs/heads/main", "ACTIVATION_REQUIRED")
            require(bool(due(now)), "CAMPAIGN_CLOSED")
        changes, missing, records = prepare(args.root, now, os.environ)
        if args.apply:
            write_changes(args.root, changes)
            if os.environ.get("RUNNER_TEMP"):
                (Path(os.environ["RUNNER_TEMP"]) / "revia-release-paths.json").write_text(json.dumps(sorted(changes)))
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as out:
                out.write(f"changed={'true' if changes else 'false'}\nmissing={'true' if missing else 'false'}\npublished={len(records)}\n")
        print(json.dumps({"changed_files": len(changes), "missing_slots": missing, "published_count": len(records),
                          "lateness_seconds": {s: max(0, int((now - release_at(s)).total_seconds())) for s in due(now) if s not in records or changes and records[s]["released_at"] == now.isoformat()}}))
    else:
        require(1 <= args.attempts <= 20, "INVALID_ATTEMPTS")
        for attempt in range(args.attempts):
            try:
                count = verify_once(args.root, now)
                print(f"PUBLIC_VERIFIED count={count} origin={ORIGIN}")
                for record in read_ledger(args.root).values():
                    print("VERIFIED_URL " + ORIGIN + "/" + record["path"])
                return
            except Exception as error:
                code = str(error) if isinstance(error, ReleaseError) else type(error).__name__
                print(f"VERIFICATION_PENDING attempt={attempt + 1} code={code}")
                if attempt + 1 == args.attempts:
                    raise ReleaseError("PUBLIC_VERIFICATION_FAILED_CHECK_HOSTING_AND_RETRY") from None
                time.sleep(30)


if __name__ == "__main__":
    try:
        main()
    except ReleaseError as error:
        print("ERROR " + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("ERROR INVALID_INPUT_OR_IO (payload withheld)", file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Prepare exactly one approved November column locally; never commit, push or deploy."""
import argparse
from datetime import datetime
import hashlib
import html
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from column_release import JST, ORIGIN, require, element_span, write_changes, ReleaseError

ROOT = Path(__file__).resolve().parents[1]
DRAFTS = Path('drafts/november-2026')
DATES = tuple(f'2026-11-{day:02d}' for day in range(4, 9))


def current_time():
    return datetime.now(JST)


def public_entries(root):
    records = json.loads((root/'config/november-columns.json').read_text())
    require(tuple(e['date'] for e in records) == DATES, 'INVALID_NOVEMBER_DATES')
    for e in records:
        require(e['publish_at'] == e['date']+'T07:00:00+09:00', 'INVALID_NOVEMBER_TIME')
        require(re.fullmatch(r'2026-11-[a-z0-9-]+', e['slug']), 'INVALID_NOVEMBER_SLUG')
        require(e['path'] == 'column/'+e['slug']+'.html', 'INVALID_NOVEMBER_PATH')
        require(all(re.fullmatch(r'images/column-2026-11-[a-z0-9-]+\.jpg', p) for p in e['assets']), 'INVALID_NOVEMBER_ASSET')
    return records


def entries(root):
    records = json.loads((root/DRAFTS/'manifest.json').read_text())
    public = public_entries(root)
    require(len(records) == len(public), 'NOVEMBER_PRIVATE_MANIFEST_MISMATCH')
    for private, schedule in zip(records, public):
        require(all(private.get(k) == v for k, v in schedule.items()), 'NOVEMBER_PRIVATE_MANIFEST_MISMATCH')
    return records


def digest(data):
    return hashlib.sha256(data).hexdigest()


def check_public_state(root, articles, static):
    """Both public builders fail closed on premature or incomplete activation."""
    now = current_time()
    home = (root/'index.html').read_text()
    listing = (root/'column/index.html').read_text()
    sitemap = (root/'sitemap.xml').read_text()
    for e in public_entries(root):
        active = e['path'] in articles
        assets = set(e['assets'])
        if active:
            require(datetime.fromisoformat(e['publish_at']) <= now, 'NOVEMBER_ARTICLE_TOO_EARLY')
            require(assets <= set(static), 'NOVEMBER_ASSET_NOT_PUBLIC')
            require(digest((root/e['path']).read_bytes()) == e['html_sha256'], 'NOVEMBER_HTML_CHANGED')
            for p, sha in e['assets'].items():
                require(digest((root/p).read_bytes()) == sha, 'NOVEMBER_ASSET_CHANGED')
            require(e['slug']+'.html' in listing and ORIGIN+'/'+e['path'] in sitemap, 'NOVEMBER_PUBLIC_REFERENCE_MISSING')
        else:
            require(not assets & set(static), 'NOVEMBER_UNRELEASED_IMAGE_EXPOSED')
            require(all(e['slug'] not in text for text in (home, listing, sitemap)), 'NOVEMBER_FUTURE_REFERENCE')
    active = [e for e in public_entries(root) if e['path'] in articles]
    if active:
        s, _, _, end = element_span(home, 'article', 'column-latest-card')
        require(active[-1]['path'] in home[s:end], 'NOVEMBER_LATEST_MISMATCH')


def card(e, latest=False):
    esc = lambda value: html.escape(str(value), quote=True)
    image = e['image']
    prefix = '' if latest else '../'
    href = ('column/' if latest else '')+e['slug']+'.html'
    heading = 'h3' if latest else 'h2'
    return f'''<article class="{'column-latest-card' if latest else 'column-card'}">
              <a class="column-card-image-link" href="{href}" aria-label="{esc(e['title'])}を読む">
                <img class="column-card-image" style="object-fit: contain; object-position: center" src="{prefix+image['path']}" alt="{esc(e['alt'])}" width="{image['width']}" height="{image['height']}" loading="lazy" decoding="async" />
              </a>
              <p class="column-card-label">{'最新記事' if latest else '第'+str(e['number'])+'回'}</p>
              <p class="column-card-meta"><time datetime="{e['publish_at']}">2026年11月{int(e['date'][-2:])}日</time><span>{'第'+str(e['number'])+'回' if latest else esc(e['category'])}</span></p>
              <{heading}><a href="{href}">{esc(e['title'])}</a></{heading}>
              <p class="column-card-excerpt">{esc(e['description'])}</p>
              <a class="column-text-link" href="{href}" aria-label="{esc(e['title'])}を読む">続きを読む</a>
            </article>'''


def prepare(root, slot, now):
    require(slot in DATES, 'UNKNOWN_NOVEMBER_DATE')
    require(now.tzinfo is not None, 'TIMEZONE_REQUIRED')
    records = entries(root)
    e = next(e for e in records if e['date'] == slot)
    require(datetime.fromisoformat(e['publish_at']) <= now, 'NOVEMBER_ARTICLE_TOO_EARLY')
    manifest = json.loads((root/'config/pages-public.json').read_text())
    check_public_state(root, manifest['existing_articles'], manifest['existing_static'])
    require(e['path'] not in manifest['existing_articles'], 'NOVEMBER_ALREADY_PREPARED')
    require(not any(x['date'] > slot and x['path'] in manifest['existing_articles'] for x in records), 'NOVEMBER_OUT_OF_ORDER')
    draft = root/DRAFTS/slot
    require(digest((draft/'approved.md').read_bytes()) == e['source_sha256'], 'NOVEMBER_APPROVED_SOURCE_CHANGED')
    data = (draft/'article.html').read_bytes()
    require(digest(data) == e['html_sha256'], 'NOVEMBER_DRAFT_HTML_CHANGED')
    changes = {e['path']: data}
    for p, sha in e['assets'].items():
        data = (draft/p).read_bytes()
        require(digest(data) == sha, 'NOVEMBER_DRAFT_IMAGE_CHANGED')
        changes[p] = data
    require(all(not (root/p).exists() for p in changes), 'NOVEMBER_DESTINATION_EXISTS')
    listing = (root/'column/index.html').read_text()
    home = (root/'index.html').read_text()
    sitemap = (root/'sitemap.xml').read_text()
    _, start, _, _ = element_span(listing, 'div', 'column-card-grid')
    listing = listing[:start]+'\n            '+card(e)+'\n'+listing[start:]
    start, _, _, end = element_span(home, 'article', 'column-latest-card')
    # Retain the previous latest card and every existing older card/link.
    previous = home[start:end].replace('column-latest-card', 'column-card', 1).replace('>最新記事<', '>前回の記事<', 1)
    home = home[:start]+card(e, latest=True)+'\n          '+previous+home[end:]
    require(sitemap.count('</urlset>') == 1, 'SITEMAP_BOUNDARY_MISMATCH')
    sitemap = sitemap.replace('</urlset>', f'  <url><loc>{ORIGIN}/{e["path"]}</loc><lastmod>{slot}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>')
    for url in (ORIGIN+'/', ORIGIN+'/column/'):
        pattern = r'(<loc>'+re.escape(url)+r'</loc>\s*<lastmod>)[^<]+(</lastmod>)'
        require(len(re.findall(pattern, sitemap)) == 1, 'SITEMAP_EXISTING_ENTRY_MISMATCH')
        sitemap = re.sub(pattern, lambda m: m[1]+slot+m[2], sitemap)
    ET.fromstring(sitemap)
    manifest['existing_articles'].append(e['path'])
    manifest['existing_static'].extend(e['assets'])
    changes.update({'index.html':home.encode(), 'column/index.html':listing.encode(), 'sitemap.xml':sitemap.encode(),
                    'config/pages-public.json':(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n').encode()})
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True, choices=DATES)
    parser.add_argument('--apply', action='store_true', help='Write local files only, after date gate')
    args = parser.parse_args()
    changes = prepare(ROOT, args.date, current_time())
    if args.apply:
        write_changes(ROOT, changes)
    print(json.dumps({'date': args.date, 'applied':args.apply, 'files':sorted(changes), 'push':False, 'deploy':False}))


if __name__ == '__main__':
    try:
        main()
    except ReleaseError as error:
        raise SystemExit('ERROR ' + str(error))

#!/usr/bin/env python3
"""Asset manager: fetch public-domain images from Wikimedia Commons with license metadata.

  assets.py add <id> "<File:Title on Commons>" [--note "..."] [--use "shot ids"]
  assets.py add-met <id> <Met objectID> [--note "..."] [--use "..."]   (Met Open Access, CC0 only)
  assets.py list
  assets.py credits            -> writes assets/CREDITS.md (end card + video description)

Every entry in assets/manifest.json records title, artist, date, source page, license, retrieval date
and how we modified it. Only files whose license is Public domain / CC0 are accepted.
"""
import json, sys, time, re, html, datetime, urllib.request, urllib.parse, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MAN = ROOT / 'assets' / 'manifest.json'; RAW = ROOT / 'assets' / 'raw'
UA = {'User-Agent': 'gensen-220-documentary/1.0 (non-commercial research; python-urllib)'}
OK_LIC = re.compile(r'^(public domain|pd|cc0)', re.I)


def get(url, tries=5):
    for k in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and k < tries - 1:
                time.sleep(15 * (k + 1)); continue
            raise


def strip(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def load():
    return json.loads(MAN.read_text()) if MAN.exists() else {'assets': {}}


def save(m):
    MAN.parent.mkdir(parents=True, exist_ok=True); MAN.write_text(json.dumps(m, ensure_ascii=False, indent=1))


def add(aid, title, note='', use=''):
    q = urllib.parse.urlencode({'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata|mime', 'iiurlwidth': 3840, 'format': 'json'})
    page = next(iter(json.loads(get('https://commons.wikimedia.org/w/api.php?' + q))['query']['pages'].values()))
    ii = page['imageinfo'][0]; md = ii['extmetadata']
    lic = strip(md.get('LicenseShortName', {}).get('value'))
    if not OK_LIC.match(lic):
        sys.exit(f'REJECT {title}: license "{lic}" is not public domain / CC0')
    src = ii['url'] if ii.get('size', 0) < 40_000_000 and ii['width'] <= 8000 else (ii.get('thumburl') or ii['url']); ext = pathlib.Path(urllib.parse.urlparse(src).path).suffix.lower() or '.jpg'
    RAW.mkdir(parents=True, exist_ok=True); out = RAW / f'{aid}{ext}'
    time.sleep(2); out.write_bytes(get(src))
    m = load()
    m['assets'][aid] = {'file': str(out.relative_to(ROOT)), 'commons_title': title, 'source_page': ii['descriptionurl'], 'download_url': src,
                        'width': ii['width'], 'height': ii['height'], 'title': strip(md.get('ObjectName', {}).get('value')) or title,
                        'artist': strip(md.get('Artist', {}).get('value')), 'date': strip(md.get('DateTimeOriginal', {}).get('value')),
                        'credit': strip(md.get('Credit', {}).get('value'))[:300], 'license': lic, 'retrieved': datetime.date.today().isoformat(),
                        'used_in': use, 'modifications': note or 'レイヤー分離・トリミング・色調整（動画内）', 'kind': '史料'}
    save(m); print('OK', aid, lic, '|', m['assets'][aid]['artist'][:60], '|', m['assets'][aid]['date'][:40], '->', out.name)


def add_met(aid, oid, note='', use=''):
    o = json.loads(get(f'https://collectionapi.metmuseum.org/public/collection/v1/objects/{oid}'))
    if not o.get('isPublicDomain') or not o.get('primaryImage'):
        sys.exit(f'REJECT met {oid}: not public domain or no image')
    src = o['primaryImage']; ext = pathlib.Path(urllib.parse.urlparse(src).path).suffix.lower() or '.jpg'
    RAW.mkdir(parents=True, exist_ok=True); out = RAW / f'{aid}{ext}'; out.write_bytes(get(src))
    m = load()
    m['assets'][aid] = {'file': str(out.relative_to(ROOT)), 'met_object_id': oid, 'source_page': o.get('objectURL'), 'download_url': src,
                        'title': o.get('title', ''), 'artist': o.get('artistDisplayName', ''), 'date': o.get('objectDate', ''),
                        'medium': o.get('medium', ''), 'credit': o.get('creditLine', ''), 'repository': o.get('repository', 'The Metropolitan Museum of Art'),
                        'license': 'Public domain / CC0（The Met Open Access）', 'retrieved': datetime.date.today().isoformat(),
                        'used_in': use, 'modifications': note or 'レイヤー分離・トリミング・色調整（動画内）', 'kind': '史料'}
    save(m); print('OK', aid, '|', m['assets'][aid]['artist'], '|', m['assets'][aid]['date'], '|', m['assets'][aid]['title'][:60], '->', out.name, out.stat().st_size // 1024, 'KB')


def credits():
    m = load(); L = ['# 素材クレジット（画像）', '']
    for aid, a in m['assets'].items():
        L.append(f"- {a['title']} — {a['artist']}（{a['date']}）／ {a['license']} ／ {a['source_page']}")
    (ROOT / 'assets' / 'CREDITS.md').write_text('\n'.join(L) + '\n'); print('\n'.join(L))


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    if a[0] == 'add':
        kw = dict(zip(a[3::2], a[4::2])); add(a[1], a[2], kw.get('--note', ''), kw.get('--use', ''))
    elif a[0] == 'add-met':
        kw = dict(zip(a[3::2], a[4::2])); add_met(a[1], int(a[2]), kw.get('--note', ''), kw.get('--use', ''))
    elif a[0] == 'list':
        for k, v in load()['assets'].items(): print(k, v['license'], v['title'][:60])
    elif a[0] == 'credits':
        credits()

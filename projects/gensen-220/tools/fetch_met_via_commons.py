#!/usr/bin/env python3
"""Slow, polite fetcher: Met Open Access objects via their Wikimedia Commons mirror (Met image host blocks bots).
Usage: fetch_met_via_commons.py <id>=<metObjectID> ...   (retries with long backoff on HTTP 429)"""
import json, sys, time, urllib.request, urllib.parse, pathlib, datetime
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import assets as A
UA = {'User-Agent': 'gensen-220-doc/1.0 (documentary research; low volume)'}
def j(url): return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
def patient(fn, *a):
    for k in range(12):
        try: return fn(*a)
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            w = 90 * (k + 1); print('429, wait', w, 's', flush=True); time.sleep(w)
    raise SystemExit('gave up')
for arg in sys.argv[1:]:
    aid, oid = arg.split('='); oid = int(oid)
    if aid in A.load()['assets']: print('skip', aid); continue
    o = patient(j, f'https://collectionapi.metmuseum.org/public/collection/v1/objects/{oid}')
    assert o.get('isPublicDomain'), f'{oid} not PD'
    dp = pathlib.Path(urllib.parse.urlparse(o['primaryImage']).path).stem          # e.g. DP880579
    r = patient(j, 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'list': 'search', 'srsearch': f'intitle:"MET {dp}"', 'srnamespace': 6, 'format': 'json'}))
    hits = [h['title'] for h in r['query']['search']]
    if not hits: print('no commons mirror for', oid, dp); continue
    time.sleep(20)
    q = urllib.parse.urlencode({'action': 'query', 'titles': hits[0], 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'iiurlwidth': 3840, 'format': 'json'})
    ii = next(iter(patient(j, 'https://commons.wikimedia.org/w/api.php?' + q)['query']['pages'].values()))['imageinfo'][0]
    src = ii['thumburl'] if ii['width'] > 3840 else ii['url']; time.sleep(20)
    data = patient(lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120).read(), src)
    A.RAW.mkdir(parents=True, exist_ok=True); out = A.RAW / f'{aid}.jpg'; out.write_bytes(data)
    m = A.load(); m['assets'][aid] = {'file': str(out.relative_to(A.ROOT)), 'met_object_id': oid, 'source_page': o.get('objectURL'), 'mirror': ii['descriptionurl'],
        'download_url': src, 'title': o.get('title', ''), 'artist': o.get('artistDisplayName', ''), 'date': o.get('objectDate', ''), 'medium': o.get('medium', ''),
        'credit': o.get('creditLine', ''), 'repository': 'The Metropolitan Museum of Art', 'license': 'Public domain / CC0（The Met Open Access）',
        'retrieved': datetime.date.today().isoformat(), 'modifications': 'レイヤー分離・トリミング・色調整（動画内）', 'kind': '史料'}
    A.save(m); print('OK', aid, hits[0], len(data) // 1024, 'KB', flush=True); time.sleep(30)
print('ALL_DONE')

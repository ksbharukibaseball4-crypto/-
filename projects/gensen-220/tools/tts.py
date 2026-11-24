#!/usr/bin/env python3
"""Narration with a local VOICEVOX engine (http://127.0.0.1:50021).
  tts.py <chapter-number ...> [--style 13] [--speed 1.0]
Writes public/audio/c<ch>_<n>.wav and public/timing.json  ({id, ch, text, tag, src, dur})
Reading fixes for the engine live in READ (display text stays unchanged)."""
import json, sys, wave, urllib.request, urllib.parse, pathlib, io
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / 'public' / 'audio'; OUT.mkdir(parents=True, exist_ok=True)
E = 'http://127.0.0.1:50021'
READ = {'行が': 'ぎょうが', '220年': 'にひゃくにじゅうねん', '1799年': 'せんななひゃくきゅうじゅうきゅうねん', '1803年': 'せんはっぴゃくさんねん'}
def post(path, data=None, q=None):
    url = E + path + ('?' + urllib.parse.urlencode(q) if q else '')
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else b'', method='POST', headers={'Content-Type': 'application/json'})
    return urllib.request.urlopen(req, timeout=120).read()
args = sys.argv[1:]; style = int(args[args.index('--style') + 1]) if '--style' in args else 13
speed = float(args[args.index('--speed') + 1]) if '--speed' in args else 1.0
chs = [int(a) for a in args if a.isdigit() and (args.index(a) == 0 or args[args.index(a) - 1] not in ('--style', '--speed'))]
N = json.load(open(ROOT / 'narration.json')); tp = ROOT / 'public' / 'timing.json'
T = json.load(open(tp)) if tp.exists() else {}
for c in N:
    if c['ch'] not in chs: continue
    T[str(c['ch'])] = []
    for n, (text, tag, src) in enumerate(c['lines']):
        say = text
        for k, v in READ.items(): say = say.replace(k, v)
        q = json.loads(post('/audio_query', q={'text': say, 'speaker': style}))
        q.update(speedScale=speed, prePhonemeLength=0.05, postPhonemeLength=0.1, outputSamplingRate=48000, intonationScale=1.05)
        wav = post('/synthesis', q, q={'speaker': style}); f = OUT / f'c{c["ch"]}_{n:02d}.wav'; f.write_bytes(wav)
        with wave.open(io.BytesIO(wav)) as w: dur = w.getnframes() / w.getframerate()
        T[str(c['ch'])].append({'id': f'c{c["ch"]}_{n:02d}', 'text': text, 'tag': tag, 'src': src, 'dur': round(dur, 3), 'kana': q.get('kana', '')})
        print(f'{c["ch"]}-{n:02d} {dur:5.2f}s {text}')
json.dump(T, open(tp, 'w'), ensure_ascii=False, indent=1)

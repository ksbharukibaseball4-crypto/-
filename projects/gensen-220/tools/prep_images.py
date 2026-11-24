#!/usr/bin/env python3
"""Copy fetched archive images into public/img (resized to <=3840px) and write public/img/available.json."""
import json, pathlib
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parent.parent
MAP = {'london': 'london_thames_1809', 'plumpudding': 'plumpudding_1805', 'bank': 'bank_1792'}
man = json.loads((ROOT / 'assets/manifest.json').read_text()) if (ROOT / 'assets/manifest.json').exists() else {'assets': {}}
avail = {}
for key, aid in MAP.items():
    a = man['assets'].get(aid); avail[key] = False
    if not a: continue
    im = Image.open(ROOT / a['file']).convert('RGB'); s = min(1, 3840 / im.width); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(ROOT / 'public/img' / f'{key}.jpg', quality=92); avail[key] = True; print(key, im.size)
(ROOT / 'public/img/available.json').write_text(json.dumps(avail)); print(avail)

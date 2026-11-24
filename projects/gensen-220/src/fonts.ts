import { continueRender, delayRender, staticFile } from 'remotion';
const FACES: [string, string, string][] = [
  ['Noto Sans JP', 'noto-sans-jp-japanese-500-normal', '500'], ['Noto Sans JP', 'noto-sans-jp-japanese-700-normal', '700'], ['Noto Sans JP', 'noto-sans-jp-japanese-900-normal', '900'],
  ['Noto Sans JP', 'noto-sans-jp-latin-500-normal', '500'], ['Noto Sans JP', 'noto-sans-jp-latin-700-normal', '700'], ['Noto Sans JP', 'noto-sans-jp-latin-900-normal', '900'],
  ['Shippori Mincho', 'shippori-mincho-japanese-800-normal', '800'], ['Shippori Mincho', 'shippori-mincho-latin-800-normal', '800'], ['Shippori Mincho', 'shippori-mincho-japanese-500-normal', '500'],
];
let started = false;
export function loadFonts() {
  if (started) return; started = true;
  const h = delayRender('fonts');
  Promise.all(FACES.map(([fam, file, w]) => new FontFace(fam, `url(${staticFile(`fonts/${file}.woff2`)})`, { weight: w }).load().then((f) => (document.fonts as unknown as { add: (x: FontFace) => void }).add(f))))
    .then(() => continueRender(h)).catch((e) => { console.error(e); continueRender(h); });
}

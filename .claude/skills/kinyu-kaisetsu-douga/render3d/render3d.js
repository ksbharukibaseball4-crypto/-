#!/usr/bin/env node
// Render a 3D scenes.json to <out>/visual.mp4 by driving engine.js in headless Chromium.
//
// Usage:
//   node render3d.js <scenes.json> --out <dir> [--workers 3] [--theme studio|navy]
//   node render3d.js <scenes.json> --out <dir> --still 1.5 10 22.3   (PNG previews with safe-area overlay)
// Needs <out>/timeline.json (scripts/tts.py) and `npm install` in this folder.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.json': 'application/json' };

function args() {
  const a = process.argv.slice(2); const o = { spec: a[0], out: 'out', workers: 3, theme: null, still: null };
  for (let i = 1; i < a.length; i++) {
    if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--workers') o.workers = +a[++i];
    else if (a[i] === '--theme') o.theme = a[++i];
    else if (a[i] === '--still') { o.still = []; while (a[i + 1] && !a[i + 1].startsWith('--')) o.still.push(+a[++i]); }
  }
  return o;
}

function serve(specPath, tlPath) {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const SD = path.dirname(specPath);
      let f = u === '/__spec.json' ? specPath : u === '/__timeline.json' ? tlPath
        : u.startsWith('/__asset/') ? path.join(SD, u.slice('/__asset/'.length)) : path.join(ROOT, u);
      if (!f.startsWith(ROOT) && !f.startsWith(SD + path.sep) && f !== specPath && f !== tlPath) { rsp.writeHead(403); return rsp.end(); }
      fs.readFile(f, (err, buf) => {
        if (err) { rsp.writeHead(404); return rsp.end(); }
        rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); rsp.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(browser, port, theme) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html${theme ? `?theme=${theme}` : ''}`);
  await page.waitForFunction('window.ready === true || window.initError', null, { timeout: 120000 });
  const err = await page.evaluate('window.initError');
  if (err) throw new Error(err);
  return page;
}

async function main() {
  const o = args();
  const specPath = path.resolve(o.spec); const out = path.resolve(o.out);
  const tlPath = path.join(out, 'timeline.json');
  const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
  const srv = await serve(specPath, tlPath); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    if (o.still) {
      const page = await openPage(browser, port, o.theme);
      for (const s of o.still) {
        await page.evaluate((t) => window.renderAt(t), s);
        await page.evaluate(() => {
          const d = document.createElement('div'); d.id = 'safe';
          d.innerHTML = '<div style="position:absolute;left:918px;top:0;width:162px;height:1920px;background:rgba(255,0,0,.25)"></div><div style="position:absolute;left:0;top:1440px;width:1080px;height:480px;background:rgba(255,0,0,.25)"></div>';
          document.getElementById('ov').appendChild(d);
        });
        const p = path.join(out, `still3d_${s.toFixed(2).padStart(5, '0')}${o.theme ? '_' + o.theme : ''}.png`);
        await page.screenshot({ path: p }); console.log(p);
      }
      return;
    }
    const fps = 30; const n = Math.ceil(tl.duration * fps);
    const W = Math.max(1, o.workers); const per = Math.ceil(n / W);
    const t0 = Date.now(); let done = 0;
    const segs = await Promise.all([...Array(W).keys()].map(async (w) => {
      const a = w * per, b = Math.min(n, a + per); if (a >= b) return null;
      const seg = path.join(out, `seg_${w}.mp4`);
      const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), seg], { stdio: ['pipe', 'inherit', 'inherit'] });
      const page = await openPage(browser, port, o.theme);
      for (let f = a; f < b; f++) {
        await page.evaluate((t) => window.renderAt(t), f / fps);
        const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        done++;
        if (done % 150 === 0) {
          const el = (Date.now() - t0) / 1000;
          console.log(`[render3d] ${done}/${n} frames, ${el.toFixed(0)}s elapsed, ~${(el / done * (n - done)).toFixed(0)}s left`);
        }
      }
      ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await page.close();
      return seg;
    }));
    const list = path.join(out, 'segs.txt');
    fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
    await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy',
      path.join(out, 'visual.mp4')], { stdio: 'inherit' }).on('close', (c) => (c ? rej(new Error('concat failed')) : res())));
    segs.filter(Boolean).forEach((s) => fs.unlinkSync(s)); fs.unlinkSync(list);
    console.log(`[render3d] ${n} frames -> ${path.join(out, 'visual.mp4')} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } finally {
    await browser.close(); srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

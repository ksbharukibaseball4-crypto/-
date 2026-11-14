// node render.js <mode h|v> <out.mp4|--still t1,t2> [dur]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const [mode, out, durArg] = process.argv.slice(2); const DUR = +(durArg || 15), FPS = 30; const root = __dirname;
const [Wd, Hd] = mode === 'v' ? [1080, 1920] : [1920, 1080];
const types = { '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: Wd, height: Hd } });
  pg.on('pageerror', (e) => console.log('ERR', e.message));
  await pg.goto(`http://localhost:${srv.address().port}/page.html?m=${mode}`); await pg.waitForFunction(() => window.ready);
  if (out === '--still') { for (const t of process.argv[4].split(',')) { await pg.evaluate((t) => window.renderAt(t), +t); await pg.screenshot({ path: `still_${mode}_${t}.png` }); } }
  else { const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = 0; f < DUR * FPS; f++) { await pg.evaluate((t) => window.renderAt(t), f / FPS); const buf = await pg.screenshot({ type: 'jpeg', quality: 95 }); if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); }
    ff.stdin.end(); await new Promise((r) => ff.on('close', r)); }
  await b.close(); srv.close(); console.log('done', mode); });

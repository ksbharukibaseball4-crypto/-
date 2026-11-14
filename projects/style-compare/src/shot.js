const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = __dirname; const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.woff':'font/woff', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => { const port = srv.address().port; const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const f of process.argv.slice(2)) { const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } }); pg.on('pageerror', (e) => console.log('ERR', f, e.message)); pg.on('console', (m) => { if (m.type() === 'error') console.log('CERR', f, m.text()); });
    await pg.goto(`http://localhost:${port}/${f}`); await pg.waitForFunction(() => window.ready === true, null, { timeout: 180000 }); await pg.waitForTimeout(300);
    await pg.screenshot({ path: f.replace('.html', '.png') }); console.log('ok', f); await pg.close(); }
  await b.close(); srv.close(); });

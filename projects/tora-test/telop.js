const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const root = __dirname;
const types = { '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const j of jobs) { await pg.goto(`http://localhost:${srv.address().port}/telop.html?` + new URLSearchParams(j.q)); await pg.waitForFunction(() => window.ready); await pg.screenshot({ path: j.out, omitBackground: true }); }
  await b.close(); srv.close(); console.log('telops', jobs.length); });

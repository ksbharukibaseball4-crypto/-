// Original retro-RPG style renderer (pixel art drawn procedurally on a 270x480 canvas, upscaled 4x).
// No assets, characters, music or UI copied from any existing game: everything here is original.
// Visual spec: { type: 'rpg', kind: 'map'|'battle'|'title'|'skill'|'status'|'effects'|'months'|'items'|'levelup'|'end', ... }
const LW = 270, LH = 480, S4 = 4;
const VIEW = { y: 55, h: 190 };          // game view band in low-res px (hi-res 220..980)
const TILE = 12;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const eOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const eBack = (x) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const eInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const P = {
  grass: '#5bb04d', grass2: '#4e9e41', grass3: '#69bf58', path: '#dcc98f', path2: '#cbb57a', water: '#3f8fe0', water2: '#6fb2f0',
  tree: '#2f7d35', tree2: '#3f9a43', trunk: '#7a4a22', wall: '#efe7d2', wall2: '#d6ccb2', ink: '#1b1b2a', gold: '#f2c248', gold2: '#b8861d',
  red: '#e0473c', blue: '#3a6fd8', teal: '#2bb3a3', skin: '#f5cfae', hair: '#5a3a22', white: '#ffffff', gray: '#8b93a3', navy: '#27375f',
};
let spec, tl, cv, ctx, world, ov, svg;
const SP = {};            // spots in tile coords
function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function RW(c2, x, y, w, h, col) { c2.fillStyle = col; c2.fillRect(x, y, w, h); }

// ------------------------------------------------------------------ world map (pre-rendered)
function buildWorld() {
  const W = 48, H = 34; world = document.createElement('canvas'); world.width = W * TILE; world.height = H * TILE;
  const c = world.getContext('2d'); c.imageSmoothingEnabled = false;
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    RW(c, tx * TILE, ty * TILE, TILE, TILE, P.grass);
    for (let k = 0; k < 4; k++) { const r = rnd(tx * 91 + ty * 7 + k); RW(c, tx * TILE + Math.floor(r * 11), ty * TILE + Math.floor(rnd(r * 99) * 11), 1, 2, r > 0.5 ? P.grass2 : P.grass3); }
  }
  const path = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { RW(c, x * TILE, y * TILE, TILE, TILE, P.path); if (rnd(x * 13 + y) > 0.6) RW(c, x * TILE + 3, y * TILE + 5, 2, 1, P.path2); } };
  path(0, 16, W - 1, 17); path(21, 7, 22, H - 1); path(8, 11, 9, 15); path(38, 11, 39, 15); path(40, 18, 41, 20); path(8, 18, 9, 21); path(30, 18, 30, 21);
  // pond
  for (let y = 28; y <= 32; y++) for (let x = 13; x <= 18; x++) { const d = Math.hypot((x - 15.5) / 3, (y - 30) / 2.3); if (d < 1) { RW(c, x * TILE, y * TILE, TILE, TILE, P.water); RW(c, x * TILE + 2, y * TILE + 4, 5, 1, P.water2); } }
  const bld = (x, y, w, h, roof, wall = P.wall, opts = {}) => {
    const X = x * TILE, Y = y * TILE, Wp = w * TILE, Hp = h * TILE;
    RW(c, X + 2, Y + Hp - 2, Wp, 3, 'rgba(0,0,0,0.25)');
    RW(c, X, Y + Math.floor(Hp * 0.35), Wp, Hp - Math.floor(Hp * 0.35), wall); RW(c, X, Y + Hp - 2, Wp, 2, P.wall2);
    RW(c, X - 2, Y, Wp + 4, Math.floor(Hp * 0.38), roof); RW(c, X - 2, Y + Math.floor(Hp * 0.38) - 2, Wp + 4, 2, 'rgba(0,0,0,0.25)');
    for (let i = 0; i < (opts.win || 3); i++) RW(c, X + 6 + i * Math.floor((Wp - 12) / (opts.win || 3)), Y + Math.floor(Hp * 0.5), 6, 6, '#8fd0ff');
    RW(c, X + Wp / 2 - 4, Y + Hp - 12, 8, 10, '#6b4423');
    c.strokeStyle = P.ink; c.lineWidth = 1; c.strokeRect(X - 1.5, Y - 0.5, Wp + 3, Hp + 0.5);
  };
  bld(5, 4, 8, 7, '#5b6b8f', '#dfe4ee', { win: 5 });  // company
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) RW(c, 5 * TILE + 8 + j * 18, 4 * TILE + 34 + i * 10, 6, 5, '#8fd0ff');
  bld(34, 4, 9, 7, '#3a6fd8', P.wall, { win: 4 });     // tax office
  RW(c, 42 * TILE, 1 * TILE, 1, 30, P.ink); RW(c, 42 * TILE + 1, 1 * TILE, 12, 8, P.white); RW(c, 42 * TILE + 5, 1 * TILE + 2, 4, 4, P.red);
  bld(18, 1, 9, 6, '#c0663a', '#f3ead7', { win: 6 });   // school
  RW(c, 22 * TILE - 3, 1 * TILE + 26, 7, 7, P.white); RW(c, 22 * TILE, 1 * TILE + 27, 1, 3, P.ink);
  bld(37, 21, 8, 6, '#8a5a2b');                         // town hall
  [[4, 21, '#d9534f'], [8, 22, '#3b82c4'], [12, 21, '#e0a23b'], [5, 26, '#6aa84f']].forEach(([x, y, col]) => bld(x, y, 3, 3, col, P.wall, { win: 1 }));
  // fountain
  const fx = 30 * TILE + 6, fy = 24 * TILE + 6; c.fillStyle = '#c9ccd4'; c.beginPath(); c.arc(fx, fy, 17, 0, 7); c.fill(); c.fillStyle = P.water; c.beginPath(); c.arc(fx, fy, 13, 0, 7); c.fill(); RW(c, fx - 2, fy - 8, 4, 8, '#c9ccd4');
  // trees
  const tree = (x, y) => { const X = x * TILE + 6, Y = y * TILE + 6; RW(c, X - 1, Y + 2, 3, 5, P.trunk); c.fillStyle = P.tree; c.beginPath(); c.arc(X, Y, 6, 0, 7); c.fill(); c.fillStyle = P.tree2; c.beginPath(); c.arc(X - 2, Y - 2, 3, 0, 7); c.fill(); };
  [[1, 1], [3, 2], [1, 12], [15, 3], [16, 8], [28, 2], [30, 9], [45, 2], [46, 12], [44, 30], [2, 31], [10, 31], [24, 30], [33, 31], [46, 20], [26, 20], [34, 20], [27, 27], [19, 22], [25, 10], [32, 13], [14, 12], [2, 18], [46, 26]]
    .forEach(([x, y]) => tree(x, y));
  Object.assign(SP, { home: [9, 24], crossroad: [22, 17], company: [9, 12], road: [24, 14], fountain: [30, 24], school: [22, 8], tax: [38, 12], town: [41, 21] });
}

// ------------------------------------------------------------------ sprites
function drawChar(x, y, look, t, opts = {}) {     // x,y = feet centre in low-res screen px
  const f = Math.floor(t * 4 + (opts.phase || 0)) % 2; const walk = opts.walk ? f : 0;
  const L = { hero: { hair: P.hair, body: P.blue, tie: P.red }, sage: { hair: '#e8e8e8', body: '#3e8e5e', beard: true, glasses: true },
    v1: { hair: '#2a1c14', body: '#e07a5f' }, v2: { hair: '#3a2618', body: '#8e6cc9' }, v3: { hair: '#1f1f1f', body: '#2bb3a3' }, v4: { hair: '#6b3e1f', body: '#e0a23b' } }[look] || {};
  const X = Math.round(x) - 5, Y = Math.round(y) - 15 - (opts.jump ? Math.round(Math.abs(Math.sin(t * 8)) * 3) : 0);
  R(X + 1, Y + 15, 9, 2, 'rgba(0,0,0,0.25)');
  R(X + 2, Y + 11, 2, 4 - walk, P.navy); R(X + 6, Y + 11, 2, 3 + walk, P.navy);             // legs
  R(X + 1, Y + 6, 8, 6, L.body); R(X + 1, Y + 6, 8, 1, 'rgba(255,255,255,0.25)');         // body
  if (L.tie) R(X + 5, Y + 7, 1, 3, L.tie);
  const armUp = opts.wave ? f : 0; R(X, Y + 7 - armUp * 3, 1, 4, P.skin); R(X + 9, Y + 7, 1, 4, P.skin);
  R(X + 2, Y, 6, 6, P.skin);                                                                  // head
  R(X + 2, Y - 1, 6, 2, L.hair); if (!L.beard) R(X + 1, Y, 1, 3, L.hair), R(X + 8, Y, 1, 3, L.hair);
  if (opts.dir !== 'up') { R(X + 3, Y + 2, 1, 1, P.ink); R(X + 6, Y + 2, 1, 1, P.ink); }
  if (L.glasses) { R(X + 2, Y + 2, 6, 1, 'rgba(255,255,255,0.7)'); R(X + 3, Y + 2, 1, 1, P.ink); R(X + 6, Y + 2, 1, 1, P.ink); }
  if (L.beard) { R(X + 2, Y + 4, 6, 3, '#f0f0f0'); R(X + 4, Y + 7, 2, 2, '#f0f0f0'); R(X + 10, Y - 2, 1, 16, '#8a5a2b'); R(X + 9, Y - 4, 3, 3, P.gold); }
}
function coinPx(x, y, r = 3) { ctx.fillStyle = P.gold2; ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), r, 0, 7); ctx.fill(); ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(Math.round(x) - 0.5, Math.round(y) - 0.5, r - 1, 0, 7); ctx.fill(); }
function monster(kind, x, y, s, t, alpha = 1, flash = 0) {
  if (flash > 0 && Math.floor(t * 16) % 2) return;
  ctx.save(); ctx.globalAlpha = alpha; const bob = Math.round(Math.sin(t * 3 + x) * 1.5); y += bob;
  const eye = (ex, ey) => { R(ex - 2, ey - 2, 4, 4, P.white); R(ex - 1, ey - 1, 2, 2, P.ink); R(ex - 3, ey - 4, 6, 1, P.ink); };
  if (kind === 'shotoku') {         // coin golem
    ctx.fillStyle = P.gold2; ctx.beginPath(); ctx.arc(x, y, 20 * s, 0, 7); ctx.fill(); ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(x - 1, y - 1, 17 * s, 0, 7); ctx.fill();
    R(x - 13 * s, y - 13 * s, 5 * s, 3 * s, '#ffe9a6'); eye(x - 7 * s, y - 4 * s); eye(x + 7 * s, y - 4 * s); R(x - 6 * s, y + 7 * s, 12 * s, 2 * s, P.ink);
    R(x - 26 * s, y, 6 * s, 3 * s, P.gold2); R(x + 20 * s, y, 6 * s, 3 * s, P.gold2); R(x - 9 * s, y + 18 * s, 5 * s, 6 * s, P.gold2); R(x + 4 * s, y + 18 * s, 5 * s, 6 * s, P.gold2);
  } else if (kind === 'shakai') {   // shield blob
    ctx.fillStyle = '#1f8f84'; ctx.beginPath(); ctx.moveTo(x - 18 * s, y - 18 * s); ctx.lineTo(x + 18 * s, y - 18 * s); ctx.lineTo(x + 16 * s, y + 6 * s); ctx.lineTo(x, y + 22 * s); ctx.lineTo(x - 16 * s, y + 6 * s); ctx.fill();
    ctx.fillStyle = P.teal; ctx.beginPath(); ctx.moveTo(x - 15 * s, y - 15 * s); ctx.lineTo(x + 15 * s, y - 15 * s); ctx.lineTo(x + 13 * s, y + 5 * s); ctx.lineTo(x, y + 18 * s); ctx.lineTo(x - 13 * s, y + 5 * s); ctx.fill();
    R(x - 2 * s, y - 12 * s, 4 * s, 12 * s, P.white); R(x - 6 * s, y - 8 * s, 12 * s, 4 * s, P.white); eye(x - 8 * s, y + 3 * s); eye(x + 8 * s, y + 3 * s);
  } else if (kind === 'jumin') {    // house mimic
    R(x - 16 * s, y - 4 * s, 32 * s, 22 * s, '#c79a6b'); ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.moveTo(x - 20 * s, y - 4 * s); ctx.lineTo(x, y - 20 * s); ctx.lineTo(x + 20 * s, y - 4 * s); ctx.fill();
    eye(x - 7 * s, y + 3 * s); eye(x + 7 * s, y + 3 * s); R(x - 10 * s, y + 11 * s, 20 * s, 4 * s, P.ink); for (let i = 0; i < 5; i++) R(x - 9 * s + i * 4 * s, y + 11 * s, 2 * s, 2 * s, P.white);
  } else if (kind === 'zure') {     // wobbly scale creature
    const w = Math.sin(t * 5) * 0.35; R(x - 2 * s, y - 16 * s, 4 * s, 34 * s, '#7b5cc4');
    ctx.save(); ctx.translate(x, y - 14 * s); ctx.rotate(w); R(-22 * s, -2 * s, 44 * s, 4 * s, '#9b7bd8');
    R(-26 * s, 2 * s, 10 * s, 3 * s, P.gold); R(16 * s, 2 * s, 10 * s, 3 * s, P.gold); ctx.restore();
    ctx.fillStyle = '#9b7bd8'; ctx.beginPath(); ctx.arc(x, y + 8 * s, 13 * s, 0, 7); ctx.fill(); eye(x - 5 * s, y + 6 * s); eye(x + 5 * s, y + 6 * s); R(x - 4 * s, y + 13 * s, 8 * s, 2 * s, P.ink);
  }
  ctx.restore();
}
const NAMES = { shotoku: '所得税', shakai: '社会保険料', jumin: '住民税', zure: 'ズレ' };

// ------------------------------------------------------------------ scene drawing
const MAPZ = 2;
function drawMapView(at, t, cx0, center) {
  const [tx, ty] = center || SP[at] || SP.crossroad; const vw = LW / MAPZ, vh = VIEW.h / MAPZ;
  let sx = tx * TILE + 6 - vw / 2 + (cx0 || 0), sy = ty * TILE + 6 - vh / 2;
  sx = Math.round(clamp(sx, 0, world.width - vw)); sy = Math.round(clamp(sy, 0, world.height - vh));
  ctx.drawImage(world, sx, sy, vw, vh, 0, 0, vw, vh);
  return { sx, sy, toScr: (wx, wy) => [wx * TILE + 6 - sx, wy * TILE + 6 - sy] };
}
function villagers(m, t, n = 6, y = 16.5) {
  for (let i = 0; i < n; i++) { const L = 48; const s = ((t * 1.6 + i * 9) % L + L) % L; const dir = i % 2 ? 1 : -1; const wx = dir > 0 ? s : L - s;
    const [x, yy] = m.toScr(wx, y + (i % 2 ? 0.2 : -0.6)); drawChar(x, yy, ['v1', 'v2', 'v3', 'v4'][i % 4], t, { walk: true, phase: i }); }
}
function bubble(x, y, text, col = P.white) { R(x - 7, y - 9, 14, 11, P.white); R(x - 6, y - 8, 12, 9, P.white); ctx.fillStyle = P.ink; ctx.font = '9px "DotGothic16"'; ctx.textAlign = 'center'; ctx.fillText(text, x, y - 1); R(x - 1, y + 2, 2, 2, P.white); }

function drawScene(v, lt, D, t, sc) {
  R(0, 0, LW, LH, '#101018');
  const k = v.kind;
  if (k === 'map') {
    ctx.save(); ctx.beginPath(); ctx.rect(0, VIEW.y, LW, VIEW.h); ctx.clip(); ctx.translate(0, VIEW.y); ctx.scale(MAPZ, MAPZ);
    const cartP = v.event === 'cart' ? clamp((lt - 0.3) / (D - 0.8)) : 0;
    const m = drawMapView(v.at, t, 0, v.event === 'cart' ? [lerp(9, 38, eInOut(cartP)), 14.5] : null);
    villagers(m, t, v.event === 'crowd' ? 0 : 5);
    const [hx, hy] = m.toScr(SP[v.at][0], SP[v.at][1] + 0.4);
    const ev = v.event;
    if (ev === 'chest') {
      const open = lt > 0.5; R(hx + 10, hy - 9, 14, 9, '#8a5a2b'); R(hx + 10, hy - 9 - (open ? 5 : 0), 14, 4, '#a8743f'); R(hx + 16, hy - 6, 2, 3, P.gold);
      if (open) { const p = eOut((lt - 0.5) / 0.5); coinPx(hx + 17, hy - 12 - p * 14, 4); sparkle(hx + 17, hy - 22, t); }
      drawChar(hx - 4, hy, 'hero', t, { jump: lt > 0.6 });
    } else if (ev === 'sad') { drawChar(hx - 4, hy, 'hero', t); coinPx(hx + 12, hy - 3, 2); R(hx + 2, hy - 20, 2, 4, '#7cc4ff'); bubble(hx - 4, hy - 22, '…');
    } else if (ev === 'alone') { drawChar(hx, hy, 'hero', t); bubble(hx, hy - 20, '？');
    } else if (ev === 'sage_in') { drawChar(hx - 14, hy, 'hero', t); const p = eOut(lt / 1.2); drawChar(lerp(hx + 80, hx + 14, p), hy, 'sage', t, { walk: p < 1 }); if (p >= 1) bubble(hx + 14, hy - 22, '！');
    } else if (ev === 'calc') { drawChar(hx - 4, hy, 'hero', t); R(hx + 6, hy - 12, 10, 12, P.white); for (let i = 0; i < 4; i++) R(hx + 8, hy - 10 + i * 3, 6, 1, P.gray); bubble(hx - 4, hy - 20, '？');
    } else if (ev === 'crowd') {
      for (let i = 0; i < 9; i++) { const p = ((lt * 0.35 + i / 9) % 1); const [x, y] = m.toScr(6.5 + (i % 3) * 1.2, lerp(16.5, 11.5, p)); drawChar(x, y, ['v1', 'v2', 'v3', 'v4', 'hero'][i % 5], t, { walk: true, phase: i, dir: 'up' }); }
    } else if (ev === 'cart') {
      const p = clamp((lt - 0.3) / (D - 0.8)); const [x, y] = m.toScr(lerp(9, 38, eInOut(p)), 15.8);
      R(x - 12, y - 10, 18, 8, '#8a5a2b'); for (let i = 0; i < 3; i++) coinPx(x - 8 + i * 5, y - 12, 2); R(x - 10, y - 2, 4, 4, P.ink); R(x + 1, y - 2, 4, 4, P.ink);
      drawChar(x + 12, y, 'v3', t, { walk: true });
    } else if (ev === 'spring') {
      drawChar(hx - 26, hy + 4, 'sage', t);
      for (let i = 0; i < 6; i++) { const ph = (t * 0.8 + i / 6) % 1; const a = i * 1.05; coinPx(hx + Math.cos(a) * ph * 18, hy - 10 - Math.sin(ph * Math.PI) * 26, 2); }
    } else if (ev === 'wind') {
      drawChar(hx - 4, hy, 'hero', t); for (let i = 0; i < 5; i++) { const p = clamp((lt - 0.3 - i * 0.2) / 1.5); R(hx + p * 120 + i * 3, hy - 10 - p * 30 + Math.sin(p * 9 + i) * 6, 5, 6, P.white); }
      bubble(hx - 4, hy - 20, '！');
    } else if (ev === 'bye') { drawChar(hx - 10, hy, 'hero', t, { wave: true }); drawChar(hx + 10, hy, 'sage', t, { wave: true }); }
    ctx.restore();
  } else if (k === 'battle') {
    // backdrop
    for (let y = 0; y < VIEW.h; y++) R(0, VIEW.y + y, LW, 1, `rgb(${18 + y * 0.15},${20 + y * 0.12},${40 + y * 0.35})`);
    R(0, VIEW.y + VIEW.h - 40, LW, 40, '#2b5a32'); for (let i = 0; i < 30; i++) R((i * 37) % LW, VIEW.y + VIEW.h - 38 + (i * 13) % 34, 3, 1, '#3f7a45');
    const n = v.enemies.length; const flash = v.event === 'encounter' && lt < 0.4 ? (Math.floor(lt * 20) % 2) : 0;
    v.enemies.forEach((e, i) => {
      const x = LW / 2 + (i - (n - 1) / 2) * (n > 2 ? 78 : 96); const y = VIEW.y + VIEW.h - 78;
      let alpha = 1, fl = 0, xs = x;
      if (v.event === 'encounter') xs = x + (1 - eOut((lt - 0.2 - i * 0.15) / 0.4)) * (i % 2 ? 160 : -160);
      if (v.event === 'join' && e === 'jumin') alpha = 0.25 + 0.55 * clamp((lt - 0.6) / 0.8);
      if (v.event === 'hit' && lt > 0.4 && lt < 1.6) xs = x + Math.sin(lt * 30) * 3 * (1 - clamp((lt - 0.4) / 1.2));
      if (v.event === 'spell') { fl = lt > 0.8 ? clamp((lt - 0.8) / 0.4) : 0; alpha = lt > 1.6 ? 1 - clamp((lt - 1.6) / 0.6) : 1; }
      monster(e, xs, y, n > 2 ? 1.25 : 1.6, t + i, alpha, fl);
    });
    if (v.event === 'hit') for (let i = 0; i < 6; i++) { const p = clamp((lt - 0.5 - i * 0.12) / 0.8); if (p > 0 && p < 1) coinPx(LW / 2 - 40 + i * 16, VIEW.y + 20 + p * 90, 3); }
    if (v.event === 'spell') for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + t * 2; const r = 10 + (lt * 40) % 40; sparkle(LW / 2 + Math.cos(a) * r, VIEW.y + 110 + Math.sin(a) * r * 0.6, t + i); }
    if (v.event === 'refund') for (let i = 0; i < 14; i++) { const p = ((lt * 0.6 + i / 14) % 1); coinPx(30 + (i * 53) % 210, VIEW.y + p * 150, 3); }
    if (v.event === 'extra') for (let i = 0; i < 4; i++) { const p = clamp((lt - 0.4 - i * 0.2) / 0.9); if (p > 0 && p < 1) coinPx(LW / 2 - 20 + i * 12, VIEW.y + 150 - p * 140, 3); }
    if (flash) R(0, VIEW.y, LW, VIEW.h, '#ffffff');
  } else {
    // menu-style scenes: starry dark background with soft vignette
    for (let i = 0; i < 70; i++) { const x = (i * 97) % LW, y = (i * 53) % LH; const tw = Math.sin(t * 2 + i) > 0.6; R(x, y, 1, 1, tw ? '#ffffff' : '#555a7a'); }
    if (k === 'levelup') { drawChar(LW / 2, VIEW.y + 130, 'hero', t, { jump: true }); for (let i = 0; i < 10; i++) sparkle(LW / 2 + Math.cos(i + t * 2) * 30, VIEW.y + 110 + Math.sin(i + t * 2) * 22, t + i); }
    if (k === 'months') {
      for (let i = 0; i < 12; i++) { const h = 20 + ((i * 7) % 5) * 6; const p = eBack((lt - 0.1 - i * 0.06) / 0.4); const x = 22 + i * 19, base = VIEW.y + 160;
        for (let j = 0; j < Math.floor(h / 4 * clamp(p)); j++) { R(x, base - j * 4, 12, 3, P.gold); R(x, base - j * 4 + 3, 12, 1, P.gold2); } }
    }
    if (k === 'end') { drawChar(LW / 2 - 14, VIEW.y + 140, 'hero', t, { wave: true }); drawChar(LW / 2 + 14, VIEW.y + 140, 'sage', t, { wave: true }); }
    if (k === 'title') { for (let i = 0; i < 8; i++) sparkle(30 + i * 30, VIEW.y + 40 + Math.sin(t + i) * 10, t + i); }
  }
}
function sparkle(x, y, t) { const on = Math.sin(t * 9) > 0; R(x, y - 2, 1, 5, on ? '#fff6c2' : P.gold); R(x - 2, y, 5, 1, on ? '#fff6c2' : P.gold); }

// ------------------------------------------------------------------ DOM windows
const win = (x, y, w, html, extra = '') => `<div class="rwin" style="left:${x}px;top:${y}px;width:${w}px;${extra}">${html}</div>`;
function overlay(v, lt, D, t, sc, s) {
  let h = '';
  const k = v.kind;
  if (k === 'map' || k === 'battle') h += `<div class="rtag">${spec.series}　${spec.episode}</div>`;
  if (k === 'battle') {
    const hp = { encounter: 1, hit: 1 - 0.35 * clamp((lt - 0.5) / 0.8), join: 0.65, spell: 0.65, refund: 0.65 + 0.25 * clamp((lt - 0.3) / 1.5), extra: 0.9 - 0.12 * clamp((lt - 0.4) / 0.9) }[v.event] ?? 1;
    h += win(170, 250, 330, `<div class="rname">しんじん</div><div class="rbar"><span style="width:${hp * 100}%"></span></div><div class="rsmall">てどり</div>`);
    const names = v.enemies.map((e) => NAMES[e]).join('・');
    if (names) h += win(530, 250, 380, `<div class="rsmall">${names}</div>`, 'text-align:center');
    if (v.event === 'hit' && lt > 0.5) h += `<div class="rpop" style="top:${600 - eOut((lt - 0.5) / 0.6) * 40}px;color:#ff6b5e">－ぜいきん</div>`;
    if (v.event === 'refund' && lt > 0.3) h += `<div class="rpop" style="top:${600 - eOut((lt - 0.3) / 0.6) * 40}px;color:#7dff9a">＋かえってきた！</div>`;
    if (v.event === 'extra' && lt > 0.4) h += `<div class="rpop" style="top:${600 - eOut((lt - 0.4) / 0.6) * 40}px;color:#ff6b5e">－ついか</div>`;
    if (v.event === 'spell' && lt > 0.3) h += `<div class="rpop" style="top:560px;font-size:84px;color:#ffe066;transform:translateX(-50%) scale(${eBack((lt - 0.3) / 0.4)})">${v.spell}！</div>`;
  } else if (k === 'title') {
    const p = eBack((lt - 0.1) / 0.6);
    h += `<div class="rtitle" style="transform:translate(-50%,-50%) scale(${p})"><div class="rt-s">${spec.series}</div><div class="rt-c">${v.chapter}</div><div class="rt-m">${v.title}</div></div>`;
  } else if (k === 'skill') {
    const p = eBack((lt - 0.1) / 0.5);
    h += win(190, 420, 700, `<div class="rsmall" style="color:#ffe066">★ あたらしい しくみ ★</div><div class="rbig">【${v.name}】</div><div class="rsmall">${v.desc}</div>`, `transform:scale(${p});text-align:center`);
  } else if (k === 'status') {
    const rows = [['少ない', 0.25, 0.1], ['ふつう', 0.55, 0.3], ['多い', 0.9, 0.7]];
    h += win(190, 330, 700, `<div class="rsmall" style="color:#ffe066">しょとく と ぜいきん</div>` + rows.map(([n, a, b], i) => {
      const p = eOut((lt - 0.2 - i * 0.3) / 0.6);
      return `<div class="rrow"><span class="rlab">しょとく ${n}</span><div class="rbar2"><span style="width:${a * 100 * p}%;background:#7cc4ff"></span></div></div><div class="rrow"><span class="rlab">→ ぜいきん</span><div class="rbar2"><span style="width:${b * 100 * p}%;background:#ff6b5e"></span></div></div>`;
    }).join(''));
  } else if (k === 'effects') {
    h += win(190, 420, 700, `<div class="rsmall" style="color:#ffe066">げんせんちょうしゅう の こうか</div>` + v.lines.map((l, i) => `<div class="rbig" style="opacity:${eOut((lt - 0.3 - i * 0.5) / 0.3)}">▶ ${l}</div>`).join(''));
  } else if (k === 'months') {
    if (v.labels) h += win(190, 870, 700, `<div class="rsmall" style="display:flex;justify-content:space-between"><span>1月</span><span>…</span><span>12月</span></div>`);
    h += win(190, 300, 700, `<div class="rbig" style="text-align:center">まいつきの ぶん は みこみ</div>`);
  } else if (k === 'items') {
    const cur = Math.min(v.items.length - 1, Math.floor(clamp((lt - 0.4) / (D - 1)) * v.items.length));
    h += win(190, 320, 700, `<div class="rsmall" style="color:#ffe066">どうぐ</div>` + v.items.map((it, i) => `<div class="rmid">${i === cur ? '▶' : '　'} ${it}</div>`).join(''));
  } else if (k === 'levelup') {
    h += win(190, 330, 700, `<div class="rbig" style="text-align:center;color:#ffe066">レベルアップ！</div><div class="rmid" style="text-align:center">${v.stat} ＋1</div>`, `transform:scale(${eBack((lt - 0.1) / 0.5)})`);
  } else if (k === 'end') {
    h += `<div class="rtitle" style="transform:translate(-50%,-50%) scale(${eBack((lt - 0.1) / 0.6)})"><div class="rt-s">${spec.series}</div><div class="rt-m" style="font-size:120px">つづく</div></div>`;
  } else if (v.type === 'disclaimer3d') {
    h += win(190, 420, 700, `<div class="rsmall" style="color:#ffe066">ごちゅうい</div><div class="rmid">情報提供目的です。<br>投資判断はご自身で</div><div class="rsmall" style="color:#9aa6bf">数値は${spec.asof}</div>`);
  }
  // message window with typewriter text
  const chunks = s.chunks; let shown = '';
  for (const c of chunks) {
    if (t < c.start) break;
    const p = clamp((t - c.start) / Math.max(0.15, c.end - c.start)); shown += c.display.slice(0, Math.ceil(c.display.length * p));
  }
  const done = chunks.length && t > chunks[chunks.length - 1].end;
  const name = { hero: 'しんじん', sage: 'せんせい' }[sc.speaker];
  h += `<div class="rmsg">${name ? `<div class="rspk">${name}</div>` : ''}<div class="rtext">${shown}${done && Math.floor(t * 3) % 2 ? '<span class="rcur">▼</span>' : ''}</div></div>`;
  const notes = [];
  if (sc.asof) notes.push(`<span style="color:#ffe066">${typeof sc.asof === 'string' ? sc.asof : spec.asof}</span>`);
  if (sc.note) notes.push(sc.note);
  if (notes.length) h += `<div class="rnote">${notes.join('　')}</div>`;
  ov.innerHTML = h; svg.innerHTML = '';
}

export async function setupRPG(_spec, _tl) {
  spec = _spec; tl = _tl;
  ov = document.getElementById('ov'); svg = document.getElementById('lines');
  cv = document.createElement('canvas'); cv.width = LW; cv.height = LH;
  Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', width: `${LW * S4}px`, height: `${LH * S4}px`, imageRendering: 'pixelated' });
  document.getElementById('c').style.display = 'none';
  document.body.insertBefore(cv, document.getElementById('photo'));
  ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  await document.fonts.load('400 40px "DotGothic16"', spec.scenes.map((s) => s.text + JSON.stringify(s.visual)).join('') + 'しんじんせんせいてどり★あたらしいしくみ【】しょとくとぜいきん少ないふつう多い→げんせんちょうしゅうのこうか▶まいつきのぶんはみこみどうぐレベルアップ！＋1つづくごちゅうい情報提供目的です。投資判断はご自身で数値は時点－＋かえってきた！ついか所得税社会保険料住民税ズレ…？！▼1月12月' + spec.series + spec.asof);
  buildWorld();
  window.renderAt = (t) => {
    const s = tl.scenes.find((x) => t >= x.start && t < x.end) || tl.scenes[tl.scenes.length - 1];
    const i = s.index; const sc = spec.scenes[i]; const v = sc.visual; const lt = t - s.start; const D = s.end - s.start;
    drawScene(v, lt, D, t, sc);
    // scene transition: quick pixel wipe
    if (i > 0 && lt < 0.25) { const p = 1 - lt / 0.25; for (let y = 0; y < LH; y += 8) R(0, y, LW * p, 4, '#101018'); }
    overlay(v, lt, D, t, sc, s);
    return true;
  };
}

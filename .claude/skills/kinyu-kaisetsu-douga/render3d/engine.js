// 3D scene engine for kinyu-kaisetsu-douga (Three.js, rendered in headless Chromium).
// window.renderAt(t) draws the frame at time t (seconds): 3D canvas + DOM overlay
// (subtitles with word highlight, callout labels, titles, notes, PR badge).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const W = 1080, H = 1920;
const DIST_SCALE = 1.7;   // portrait frame is narrow: pull every camera back
const SAFE_L = 162, SAFE_R = 918, SUB_TOP = 210, SUB_BOTTOM = 470, SAFE_B = 1440;
const TITLE_Y = 1235, NOTE_Y = 1392, CALLOUT_MIN_Y = 560, CALLOUT_MAX_Y = 1150;
const C = {
  gold: 0xf2c248, goldDeep: 0xd9a52e, navy: 0x111827, ink: 0x1f2d4f, white: 0xf5f6f9, up: 0x2ecc71,
  down: 0xeb4d4b, blue: 0x4a9df8, teal: 0x2bb3a3, bill: 0xd9ccab, band: 0xf7f3ea, roof: 0x2f4f8f,
  skin: 0xf6d3bb, muted: 0x9aa6bf, wood: 0xa8744f, green: 0x7cc47f, pink: 0xf28fb1,
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const eOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const eBack = (x) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const eInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

let spec, tl, renderer, scene, camera, floor;
const built = new Map();
const ov = document.getElementById('ov');
const svg = document.getElementById('lines');

// ------------------------------------------------------------------ materials
const M = {};
function mat(name) {
  if (M[name]) return M[name];
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const table = {
    gold: () => std({ color: C.gold, metalness: 0.85, roughness: 0.28 }),
    goldDeep: () => std({ color: C.goldDeep, metalness: 0.85, roughness: 0.35 }),
    bill: () => std({ color: C.bill, roughness: 0.75 }),
    band: () => std({ color: C.band, roughness: 0.6 }),
    white: () => std({ color: C.white, roughness: 0.5 }),
    paper: () => std({ color: 0xfbfbfd, roughness: 0.8 }),
    navy: () => std({ color: C.ink, roughness: 0.45, metalness: 0.1 }),
    roof: () => std({ color: C.roof, roughness: 0.5 }),
    blue: () => std({ color: C.blue, roughness: 0.4 }),
    teal: () => std({ color: C.teal, roughness: 0.45 }),
    red: () => std({ color: C.down, roughness: 0.45 }),
    green: () => std({ color: C.up, roughness: 0.45 }),
    grass: () => std({ color: C.green, roughness: 0.9 }),
    wood: () => std({ color: C.wood, roughness: 0.7 }),
    skin: () => std({ color: C.skin, roughness: 0.7 }),
    black: () => std({ color: 0x1a1a22, roughness: 0.4 }),
    window: () => std({ color: 0x9fd3ff, roughness: 0.15, metalness: 0.1, emissive: 0x335577, emissiveIntensity: 0.25 }),
    glass: () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.05,
      metalness: 0, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }),
    glassBlue: () => new THREE.MeshPhysicalMaterial({ color: 0x7fb8ff, transparent: true, opacity: 0.32, roughness: 0.1,
      metalness: 0, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }),
    yellow: () => std({ color: 0xffc727, roughness: 0.4 }),
    pedestal: () => std({ color: 0xf0f2f6, roughness: 0.35 }),
  };
  M[name] = table[name]();
  return M[name];
}
const box = (w, h, d, m, r = 0) => {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, typeof m === 'string' ? mat(m) : m);
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
};
const cyl = (r1, r2, h, m, seg = 40) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), typeof m === 'string' ? mat(m) : m);
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
};
const sph = (r, m, seg = 32) => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg / 2), typeof m === 'string' ? mat(m) : m);
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
};
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

// ------------------------------------------------------------------ props
function coin(r = 0.42) {
  const g = new THREE.Group();
  g.add(cyl(r, r, 0.1, 'gold'));
  const face = cyl(r * 0.78, r * 0.78, 0.104, 'goldDeep'); g.add(face);
  return g;
}
function coinStack(n, r = 0.42) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const c = coin(r); c.position.y = 0.05 + i * 0.105; c.rotation.y = i * 0.7;
    c.position.x = Math.sin(i * 2.1) * 0.015; g.add(c);
  }
  return g;
}
function billBundle() {
  const g = new THREE.Group();
  g.add(box(1.5, 0.34, 0.72, 'bill', 0.04));
  g.add(box(0.3, 0.36, 0.74, 'band'));
  return g;
}
function billPile(layers = 3) {
  const g = new THREE.Group();
  let n = 0;
  for (let L = 0; L < layers; L++) {
    const per = layers - L;
    for (let i = 0; i < per; i++) for (let j = 0; j < 2; j++) {
      const b = billBundle();
      b.position.set((i - (per - 1) / 2) * 1.55, 0.17 + L * 0.36, (j - 0.5) * 0.78);
      b.rotation.y = Math.sin(n * 1.7) * 0.05; n++; g.add(b);
    }
  }
  return g;
}
function house(roofMat = 'roof') {
  const g = new THREE.Group();
  g.add(at(box(1.6, 1.1, 1.3, 'white', 0.03), 0, 0.55, 0));
  const s = new THREE.Shape(); s.moveTo(-0.98, 0); s.lineTo(0.98, 0); s.lineTo(0, 0.78); s.lineTo(-0.98, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: false }), mat(roofMat));
  roof.position.set(0, 1.1, -0.75); roof.castShadow = true; g.add(roof);
  g.add(at(box(0.36, 0.6, 0.05, 'wood'), -0.35, 0.3, 0.66));
  g.add(at(box(0.42, 0.34, 0.05, 'window'), 0.38, 0.62, 0.66));
  g.add(at(box(0.22, 0.45, 0.22, 'navy'), 0.5, 1.6, -0.2));
  return g;
}
function stockCert() {
  const g = new THREE.Group();
  const p = box(1.25, 1.6, 0.06, 'paper', 0.02); p.position.y = 0.8; g.add(p);
  g.add(at(box(1.05, 0.16, 0.07, 'gold'), 0, 1.42, 0));
  const pts = [[-0.45, 0.35], [-0.2, 0.6], [0.0, 0.5], [0.22, 0.85], [0.45, 1.05]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const seg = box(len, 0.06, 0.08, 'green');
    seg.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.02); seg.rotation.z = Math.atan2(y1 - y0, x1 - x0); g.add(seg);
  }
  g.rotation.x = -0.12;
  return g;
}
function pedestal(r = 0.95, h = 0.35) { const p = cyl(r, r * 1.05, h, 'pedestal', 48); p.position.y = h / 2; return p; }
function person(o = {}) {
  const g = new THREE.Group();
  const body = mat(o.body || 'blue');
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 8, 20), body);
  torso.position.y = 0.95; torso.castShadow = true; g.add(torso);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.38, 6, 12), mat('navy'));
    leg.position.set(sx * 0.15, 0.32, 0); leg.castShadow = true; g.add(leg);
  }
  const head = new THREE.Group(); head.position.y = 1.72; g.add(head);
  head.add(sph(0.34, 'skin'));
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.355, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
    new THREE.MeshStandardMaterial({ color: o.hair ?? 0x3b2a20, roughness: 0.6 }));
  hair.rotation.x = -0.35; hair.castShadow = true; head.add(hair);
  for (const sx of [-1, 1]) {
    head.add(at(sph(0.045, 'black', 12), sx * 0.12, 0.02, 0.31));
    const ch = sph(0.05, new THREE.MeshStandardMaterial({ color: 0xf29a9a, roughness: 0.9 }), 12);
    ch.scale.set(1, 0.6, 0.4); head.add(at(ch, sx * 0.2, -0.08, 0.27));
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 16, Math.PI), mat('black'));
  smile.rotation.z = Math.PI; smile.position.set(0, -0.1, 0.32); head.add(smile);
  if (o.tie) {
    const tie = box(0.1, 0.38, 0.04, 'red'); tie.position.set(0, 1.05, 0.33); g.add(tie);
  }
  if (o.glasses) for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 20), mat('black'));
    ring.position.set(sx * 0.12, 0.02, 0.34); head.add(ring);
  }
  const arms = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.42, 1.22, 0); g.add(piv);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.42, 6, 12), body);
    arm.position.y = -0.28; arm.castShadow = true; piv.add(arm);
    piv.add(at(sph(0.11, 'skin', 12), 0, -0.56, 0));
    piv.rotation.z = sx * 0.18; arms.push(piv);
  }
  g.userData = { head, arms, phase: o.phase || 0 };
  g.scale.setScalar(o.scale || 1);
  return g;
}
function animPerson(p, t, pose = 'idle', k = 1) {
  const { head, arms, phase } = p.userData;
  const tt = t + phase;
  head.rotation.z = 0.06 * Math.sin(tt * 1.7);
  head.rotation.y = 0.12 * Math.sin(tt * 0.9);
  let l = 0.18, r = -0.18;
  if (pose === 'wave') { r = -2.6 + 0.35 * Math.sin(tt * 8); }
  else if (pose === 'cheer') { l = 2.7 + 0.2 * Math.sin(tt * 6); r = -2.7 - 0.2 * Math.sin(tt * 6); }
  else if (pose === 'point') { r = -1.9; }
  else if (pose === 'think') { r = -2.4; arms[1].rotation.x = -0.9; }
  else if (pose === 'worry') { l = 0.5; r = -0.5; head.rotation.z = 0.18; }
  arms[0].rotation.z = lerp(0.18, l, k); arms[1].rotation.z = lerp(-0.18, r, k);
  const bob = pose === 'cheer' ? Math.abs(Math.sin(tt * 4)) * 0.15 : 0.03 * Math.sin(tt * 2.2);
  p.position.y = (p.userData.baseY ?? 0) + bob;
}
const PEOPLE = {
  spouse: { body: 'teal', hair: 0x4a2c1d },
  child1: { body: 'blue', hair: 0x222228 },
  child2: { body: 'red', hair: 0x3a2618 },
  guide: { body: 'navy', hair: 0x2a1c14, glasses: true, tie: true },
};
function warningSign() {
  const g = new THREE.Group();
  const tri = cyl(1.15, 1.15, 0.22, 'yellow', 3); tri.rotation.set(-Math.PI / 2, 0, 0); g.add(tri);
  const bar = box(0.18, 0.75, 0.1, 'black', 0.05); bar.position.set(0, 0.12, 0.14); g.add(bar);
  g.add(at(sph(0.11, 'black'), 0, -0.48, 0.14));
  g.position.y = 1.6;
  const out = new THREE.Group(); out.add(g);
  const pole = cyl(0.07, 0.07, 1.0, 'navy'); pole.position.y = 0.5; out.add(pole);
  return out;
}
function glassBox(w = 2.6, h = 2.4, d = 2.0) {
  const g = new THREE.Group();
  const gl = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat('glass')); gl.position.y = h / 2; g.add(gl);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
    new THREE.LineBasicMaterial({ color: C.gold }));
  edges.position.y = h / 2; g.add(edges);
  g.add(at(box(w + 0.2, 0.12, d + 0.2, 'navy', 0.04), 0, 0.06, 0));
  return g;
}
function stairs(n, w = 1.1, step = 0.5, d = 1.6) {
  const g = new THREE.Group(); const steps = [];
  for (let i = 0; i < n; i++) {
    const s = box(w, step * (i + 1), d, new THREE.MeshStandardMaterial({ color: C.white, roughness: 0.4 }), 0.05);
    s.position.set((i - (n - 1) / 2) * w, step * (i + 1) / 2, 0); g.add(s); steps.push(s);
  }
  g.userData.steps = steps; return g;
}
function pieSlice(r, a0, a1, h, color) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.absarc(0, 0, r, a0, a1, false); s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 48 });
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 }));
  m.rotation.x = -Math.PI / 2; m.castShadow = true; m.receiveShadow = true; return m;
}
function giftBox(color = C.down) {
  const g = new THREE.Group();
  g.add(at(box(0.7, 0.55, 0.7, new THREE.MeshStandardMaterial({ color, roughness: 0.45 }), 0.04), 0, 0.275, 0));
  g.add(at(box(0.76, 0.12, 0.76, new THREE.MeshStandardMaterial({ color, roughness: 0.45 }), 0.03), 0, 0.58, 0));
  g.add(at(box(0.12, 0.66, 0.78, 'gold'), 0, 0.33, 0)); g.add(at(box(0.78, 0.66, 0.12, 'gold'), 0, 0.33, 0));
  for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 8, 20), mat('gold')); t.position.set(sx * 0.12, 0.72, 0); t.rotation.y = Math.PI / 2; g.add(t); }
  return g;
}
function umbrella() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: C.down, roughness: 0.5, side: THREE.DoubleSide }));
  top.scale.y = 0.55; top.position.y = 2.2; top.castShadow = true; g.add(top);
  const pole = cyl(0.04, 0.04, 2.3, 'navy'); pole.position.y = 1.4; g.add(pole);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 8, 20, Math.PI), mat('navy')); hook.position.set(0.16, 0.25, 0); hook.rotation.z = Math.PI; g.add(hook);
  g.add(at(sph(0.08, 'gold'), 0, 2.98, 0));
  return g;
}
function calendar() {
  const g = new THREE.Group();
  g.add(at(box(2.0, 2.2, 0.25, 'navy', 0.06), 0, 1.3, 0));
  g.add(at(box(1.8, 0.45, 0.28, 'red', 0.04), 0, 2.1, 0.02));
  for (const sx of [-0.55, 0.55]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 20), mat('gold')); ring.position.set(sx, 2.4, 0.05); g.add(ring); }
  const page = box(1.8, 1.55, 0.04, 'paper', 0.02); page.position.set(0, 1.08, 0.15); g.add(page);
  const flip = new THREE.Group(); flip.position.set(0, 1.86, 0.18); g.add(flip);
  const fp = box(1.8, 1.55, 0.03, 'paper', 0.02); fp.position.y = -0.78; flip.add(fp);
  g.userData = { flip, page };
  return g;
}
function documentPaper() {
  const g = new THREE.Group();
  g.add(at(box(2.2, 0.05, 2.9, 'paper', 0.02), 0, 0.03, 0));
  for (let i = 0; i < 6; i++) g.add(at(box(1.6 - (i % 2) * 0.4, 0.06, 0.05, new THREE.MeshStandardMaterial({ color: 0xb8c1d4 })), -0.1 + (i % 2) * -0.2, 0.06, -0.6 + i * 0.3));
  g.add(at(box(1.8, 0.06, 0.22, 'navy'), 0, 0.06, -1.15));
  return g;
}
function stamp() {
  const g = new THREE.Group();
  g.add(at(cyl(0.42, 0.42, 0.22, 'red'), 0, 0.11, 0));
  g.add(at(cyl(0.16, 0.2, 0.8, 'wood'), 0, 0.62, 0));
  g.add(at(sph(0.24, 'wood'), 0, 1.08, 0));
  return g;
}
function officeBuilding() {
  const g = new THREE.Group();
  g.add(at(box(2.4, 0.25, 1.6, 'pedestal', 0.03), 0, 0.12, 0));
  for (let i = 0; i < 4; i++) g.add(at(cyl(0.12, 0.12, 1.5, 'white', 16), -0.9 + i * 0.6, 1.0, 0.55));
  g.add(at(box(2.2, 1.5, 1.0, 'white', 0.03), 0, 1.0, -0.15));
  const s = new THREE.Shape(); s.moveTo(-1.3, 0); s.lineTo(1.3, 0); s.lineTo(0, 0.6); s.lineTo(-1.3, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 1.7, bevelEnabled: false }), mat('navy'));
  roof.position.set(0, 1.75, -0.85); roof.castShadow = true; g.add(roof);
  return g;
}

// ------------------------------------------------------------------ scene builders
// Each returns { group, cam: {dist, elev, azim, ty}, update(lt, D, t), overlay(lt, D, t) -> items }
const B = {};
const callout = (obj, local, text, o = {}) => ({ kind: 'callout', obj, local, text, ...o });

B.money_hook = (v) => {
  const g = new THREE.Group();
  const pile = billPile(3); g.add(pile);
  const h = house(); h.position.set(-2.2, 0, -2.0); h.scale.setScalar(1.1); g.add(h);
  const coins = [];
  for (let i = 0; i < 8; i++) { const c = coin(0.32); g.add(c); coins.push(c); }
  return {
    group: g, cam: { dist: 13, elev: 20, azim: 18, ty: 1.4 },
    update(lt, D, t) {
      coins.forEach((c, i) => {
        const a = t * 0.8 + i * Math.PI / 4;
        c.position.set(Math.cos(a) * 3.0, 1.6 + 0.6 * Math.sin(a * 2 + i), Math.sin(a) * 2.0);
        c.rotation.set(Math.PI / 2 * Math.sin(t * 2 + i), t * 3 + i, 0);
      });
    },
    overlay(lt) {
      return [
        { kind: 'title', y: 1120, html: v.title, size: 120, color: '#111827', bg: '#f2c248', delay: 0.15 },
        { kind: 'title', y: 1270, html: v.sub, size: 66, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.5 },
      ];
    },
  };
};

B.assets = (v) => {
  const g = new THREE.Group();
  const kinds = { cash: () => billPile(2), house: () => house(), stock: () => stockCert() };
  const items = v.items.map((it, i) => {
    const holder = new THREE.Group(); holder.position.set((i - 1) * 2.4, 0, i === 1 ? -0.6 : 0.3);
    holder.add(pedestal(1.05)); const obj = kinds[it.kind](); obj.position.y = 0.35;
    if (it.kind === 'cash') obj.scale.setScalar(0.62);
    if (it.kind === 'house') obj.scale.setScalar(0.85);
    holder.add(obj); g.add(holder); return { holder, obj, it };
  });
  return {
    group: g, cam: { dist: 13.5, elev: 22, azim: 0, ty: 0.9 },
    update(lt, D, t) {
      items.forEach(({ holder }, i) => { const k = eBack((lt - 0.15 - i * 0.3) / 0.45); holder.scale.setScalar(Math.max(0.001, k)); holder.rotation.y = 0.2 * Math.sin(t * 0.7 + i); });
    },
    overlay() {
      return items.map(({ holder, it }, i) => callout(holder, [0, i === 1 ? 2.6 : 2.2, 0], it.label,
        { dx: 0, dy: -150 - (i === 1 ? 40 : 0), color: [C.gold, C.blue, C.up][i], delay: 0.5 + i * 0.3, size: 40 }));
    },
  };
};

B.section3d = (v) => {
  const g = new THREE.Group();
  g.add(pedestal(1.4, 0.4));
  let prop;
  if (v.prop === 'glass') { prop = glassBox(1.8, 1.7, 1.5); const cs = coinStack(6, 0.4); cs.position.y = 0.12; prop.add(cs); }
  else if (v.prop === 'stairs') { prop = stairs(3, 0.8, 0.45, 1.2); prop.userData.steps.forEach((s, i) => s.material.color.setHex([C.white, C.blue, C.gold][i])); }
  else { prop = warningSign(); }
  prop.position.y = 0.4; g.add(prop);
  return {
    group: g, cam: { dist: 11, elev: 16, azim: 0, ty: 1.4 },
    update(lt, D, t) { prop.rotation.y = 0.6 * Math.sin(t * 0.8); },
    overlay() {
      return [{ kind: 'title', y: 1270, html: `<span style="color:#f2c248;margin-right:18px">${v.num}</span>${v.title}`, size: 92, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.2 }];
    },
  };
};

B.glassbox = (v) => {
  const g = new THREE.Group();
  const gb = glassBox(3.0, 2.6, 2.2); g.add(gb);
  const n = 14; const stacks = [];
  for (let i = 0; i < 6; i++) { const cs = coinStack(n, 0.36); cs.position.set(((i % 3) - 1) * 0.85, 0.12, (Math.floor(i / 3) - 0.5) * 0.85); g.add(cs); stacks.push(cs); }
  const people = [];
  if (v.happy) ['spouse', 'child1', 'child2'].forEach((k, i) => { const p = person({ ...PEOPLE[k], phase: i }); p.position.set((i - 1) * 1.3, 0, 2.2); p.scale.setScalar(0.95); p.userData.baseY = 0; g.add(p); people.push(p); });
  const line = box(3.2, 0.03, 2.4, new THREE.MeshStandardMaterial({ color: C.gold, transparent: true, opacity: 0.45, metalness: 0.5, roughness: 0.3 })); line.position.y = 2.6 * v.fill + 0.12; g.add(line);
  return {
    group: g, cam: { dist: 13, elev: 18, azim: -12, ty: 1.5 },
    update(lt, D, t) {
      const fillH = 2.6 * (v.happy ? 0.62 : v.fill) * eOut(lt / (0.7 * D));
      stacks.forEach((cs) => cs.children.forEach((c, j) => { c.visible = 0.05 + j * 0.105 < fillH; }));
      people.forEach((p) => animPerson(p, t, 'cheer'));
    },
    overlay() {
      return [callout(line, [1.6, 0, 1.2], v.label, { dx: 0, dy: -260, color: C.gold, delay: 0.3, size: 46 }),
        ...(v.happy ? [{ kind: 'title', y: TITLE_Y, html: '相続税 <span style="color:#2ecc71">0円</span>', size: 64, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.6 }] : [])];
    },
  };
};

B.formula_blocks = (v) => {
  const g = new THREE.Group();
  const base = box(2.2, 2.0, 1.6, 'gold', 0.08); base.position.set(-1.2, 1.0, 0); g.add(base);
  const per = []; const people = [];
  const n = v.people || 3;
  for (let i = 0; i < n; i++) {
    const b = box(2.2, 0.42, 1.6, 'blue', 0.06); g.add(b); per.push(b);
    const p = person({ ...PEOPLE[['spouse', 'child1', 'child2'][i % 3]], phase: i * 1.3 });
    p.scale.setScalar(0.9); p.position.set(1.7 + (i - 1) * 1.05, 0, 1.4 - i * 0.2); p.userData.baseY = 0; g.add(p); people.push(p);
  }
  return {
    group: g, cam: { dist: 14, elev: 18, azim: 10, ty: 1.6 },
    update(lt, D, t) {
      per.forEach((b, i) => {
        if (v.phase === 'formula') {
          const k = eBack((lt - 0.4) / 0.5);
          b.position.set(1.6, 0.21 + i * 0.0, -0.4); b.scale.setScalar(i === 0 ? Math.max(0.001, k) : 0.001);
        } else {
          const k = eInOut((lt - 0.2 - i * 0.45) / 0.6);
          b.scale.setScalar(1);
          b.position.set(lerp(1.6, -1.2, k), lerp(0.21, 2.21 + i * 0.44, k) + Math.sin(k * Math.PI) * 0.8, lerp(-0.4, 0, k));
        }
      });
      people.forEach((p, i) => animPerson(p, t, v.phase === 'total' && lt > 0.6 + i * 0.45 ? 'cheer' : 'wave'));
    },
    overlay(lt, D) {
      const items = [callout(base, [0, -0.2, 0.82], v.base, { dx: 0, dy: 0, color: C.gold, delay: 0.2, size: 46 })];
      if (v.phase === 'formula') {
        items.push(callout(per[0], [0, 0.25, 0.8], `${v.per} × 人数`, { dx: 60, dy: -330, color: C.blue, delay: 0.6, size: 46 }));
      } else {
        items.push({ kind: 'title', y: TITLE_Y, html: `合計 <span style="color:#f2c248">${v.total}</span>`, size: 76, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.2 + n * 0.45 + 0.3 });
      }
      return items;
    },
  };
};

B.subtract_cube = (v) => {
  const g = new THREE.Group();
  const L = box(1.85, 2.2, 2.0, 'glassBlue', 0.06); const R = box(2.0, 2.2, 2.0, 'gold', 0.06);
  L.position.set(-1.0, 1.1, 0); R.position.set(0.93, 1.1, 0); g.add(L); g.add(R);
  return {
    group: g, cam: { dist: 13, elev: 20, azim: 14, ty: 1.3 },
    update(lt, D, t) {
      const k = eInOut((lt - 0.6) / 0.7);
      L.position.set(-1.0 - 1.4 * k, 1.1 + 0.4 * Math.sin(k * Math.PI), 0.6 * k); L.rotation.y = 0.25 * k;
      R.position.x = 0.93 - 0.9 * k;
      L.material.opacity = lerp(0.85, 0.3, k);
    },
    overlay(lt) {
      const k = lt > 0.6;
      return k ? [
        callout(L, [0, 1.2, 0], `基礎控除 ${v.minus}`, { dx: -30, dy: -250, color: C.blue, delay: 0.8, size: 40 }),
        callout(R, [0, 1.2, 0], `残り ${v.rest}`, { dx: 60, dy: -420, color: C.gold, delay: 1.1, size: 46 }),
        { kind: 'title', y: TITLE_Y, html: `遺産 ${v.total} − ${v.minus}`, size: 54, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.3 },
      ] : [{ kind: 'title', y: TITLE_Y, html: `遺産 ${v.total}`, size: 64, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.1 }];
    },
  };
};

B.pie = (v) => {
  const g = new THREE.Group();
  const colors = [C.teal, C.blue, C.down];
  let a = Math.PI / 2;
  const slices = v.slices.map((s, i) => {
    const len = s.frac * Math.PI * 2; const m = pieSlice(2.0, a, a + len, 0.6, colors[i]);
    const mid = a + len / 2; a += len;
    const holder = new THREE.Group(); holder.add(m); holder.userData.dir = new THREE.Vector3(Math.cos(mid), 0, -Math.sin(mid)); g.add(holder);
    return { holder, s, mid };
  });
  const people = slices.map(({ s, mid }, i) => {
    const p = person({ ...PEOPLE[['spouse', 'child1', 'child2'][i]], phase: i });
    p.scale.setScalar(0.8); p.position.set(Math.cos(mid) * 3.3, 0, -Math.sin(mid) * 3.3 * 0.8); p.userData.baseY = 0; g.add(p); return p;
  });
  return {
    group: g, cam: { dist: 13.5, elev: 34, azim: 0, ty: 0.6 },
    update(lt, D, t) {
      const k = eOut((lt - 0.3) / 0.6);
      slices.forEach(({ holder }) => holder.position.copy(holder.userData.dir).multiplyScalar(0.35 * k));
      people.forEach((p) => animPerson(p, t, 'wave'));
      g.rotation.y = 0.15 * Math.sin(t * 0.5);
    },
    overlay() {
      return slices.map(({ holder, s }, i) => callout(holder, [holder.userData.dir.x * 1.2, 0.7, holder.userData.dir.z * 1.2],
        v.values ? `${s.label} <span class="val">${s.value}</span>` : `${s.label} ${s.frac === 0.5 ? '1/2' : '1/4'}`,
        { dx: [-120, 140, 110][i], dy: [-280, 200, -330][i], color: colors[i], delay: 0.5 + i * 0.25, size: 42 }));
    },
  };
};

B.rate_stairs = (v) => {
  const g = new THREE.Group();
  const n = v.rates.length; const bars = [];
  const blues = [0xc9dcff, 0xadc9fb, 0x8db3f5, 0x6c9bef, 0x4f83e4, 0x3b6dcc, 0x2d58ad, 0x22458c];
  v.rates.forEach((r, i) => {
    const h = 0.25 + r / 55 * 3.6; const b = box(0.62, h, 1.2, new THREE.MeshStandardMaterial({ color: blues[i], roughness: 0.35 }), 0.04);
    b.position.set((i - (n - 1) / 2) * 0.68, h / 2, 0); b.userData.h = h; g.add(b); bars.push(b);
  });
  return {
    group: g, cam: { dist: 13.5, elev: 14, azim: -16, ty: 1.6 },
    update(lt, D, t) {
      let hi = v.highlight;
      if (hi === 'sweep') hi = Math.min(n - 1, Math.floor(clamp((lt - 0.4) / (0.75 * D)) * n));
      bars.forEach((b, i) => {
        const k = eBack((lt - 0.05 - i * 0.07) / 0.4);
        b.scale.y = Math.max(0.001, k); b.position.y = b.userData.h / 2 * Math.max(0.001, k);
        const on = hi !== null && hi !== undefined && i === hi;
        b.material.color.setHex(on ? C.gold : blues[i]);
        b.material.metalness = on ? 0.6 : 0; b.material.emissive?.setHex(on ? 0x332200 : 0x000000);
      });
    },
    overlay(lt, D) {
      let hi = v.highlight; if (hi === 'sweep') hi = Math.min(n - 1, Math.floor(clamp((lt - 0.4) / (0.75 * D)) * n));
      const items = bars.map((b, i) => ({ kind: 'tag', obj: b, local: [0, b.userData.h / 2 + 0.25, 0], text: `${v.rates[i]}%`, size: 30, delay: 0.3 + i * 0.07, hi: i === hi }));
      if (v.result) items.push({ kind: 'title', y: TITLE_Y, html: v.result, size: 46, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.5 });
      return items;
    },
  };
};

B.coin_stacks = (v) => {
  const g = new THREE.Group();
  const per = 20;
  const stacks = v.stacks.map((s, i) => {
    const n = Math.round(s.value / per); const cs = coinStack(n, 0.5); cs.position.set((i - 1) * 2.0, 0, 0); g.add(cs);
    const p = person({ ...PEOPLE[['spouse', 'child1', 'child2'][i]], phase: i }); p.scale.setScalar(0.8); p.position.set((i - 1) * 2.0, 0, -1.5); p.userData.baseY = 0; g.add(p);
    return { cs, n, s, p };
  });
  return {
    group: g, cam: { dist: 13, elev: 16, azim: 0, ty: 1.4 },
    update(lt, D, t) {
      const mk = v.merge ? eInOut((lt - 0.5) / 0.8) : 0;
      stacks.forEach(({ cs, n, p }, i) => {
        const shown = v.merge ? n : Math.floor(n * eOut((lt - 0.1 - i * 0.2) / 0.9));
        cs.children.forEach((c, j) => { c.visible = j < shown; });
        cs.position.x = lerp((i - 1) * 2.0, 0, mk); cs.position.y = mk * (i === 0 ? 0 : (i === 1 ? stacks[0].n : stacks[0].n + stacks[1].n) * 0.105);
        animPerson(p, t, v.merge ? 'idle' : 'point');
      });
    },
    overlay(lt) {
      if (v.merge) return [{ kind: 'title', y: TITLE_Y, html: v.merge.replace(/(\d[\d,.]*万円)/, '<span style="color:#f2c248">$1</span>'), size: 62, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.9 },
        callout(stacks[0].cs, [0, 3.5, 0], `340 + 145 + 145`, { dx: 0, dy: -200, color: C.gold, delay: 0.4, size: 40 })];
      return stacks.map(({ cs, n, s }, i) => callout(cs, [0, n * 0.105 + 0.1, 0], `${s.label} <span class="val">${s.value}${v.unit}</span>`,
        { dx: 0, dy: i === 1 ? -240 : -140, color: [C.teal, C.blue, C.down][i], delay: 0.6 + i * 0.25, size: 38 }));
    },
  };
};

B.split_pay = (v) => {
  const g = new THREE.Group();
  const piles = v.shares.map((s, i) => { const cs = coinStack(Math.round(16 * s.frac), 0.45); g.add(cs); return cs; });
  const people = v.shares.map((s, i) => { const p = person({ ...PEOPLE[['spouse', 'child1', 'child2'][i]], phase: i }); p.scale.setScalar(0.8); p.position.set((i - 1) * 2.2, 0, -0.8); p.userData.baseY = 0; g.add(p); return p; });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('glassBlue'));
  dome.position.set(-2.2, 0, -0.3); g.add(dome); dome.visible = !!v.shares[0].zero;
  return {
    group: g, cam: { dist: 13, elev: 22, azim: 0, ty: 1.0 },
    update(lt, D, t) {
      const k = eInOut((lt - 0.3) / 0.8);
      let y0 = 0;
      piles.forEach((cs, i) => {
        cs.position.set(lerp(0, (i - 1) * 2.2, k), lerp(2.0 + y0, 0, k), lerp(1.0, 0.6, k)); y0 += cs.children.length * 0.105 * (1 - k);
        if (v.shares[i].zero && lt > 1.2) { const z = eOut((lt - 1.2) / 0.5); cs.scale.setScalar(Math.max(0.001, 1 - z)); }
      });
      people.forEach((p, i) => animPerson(p, t, v.shares[i].zero ? 'cheer' : 'idle'));
      dome.scale.setScalar(v.shares[0].zero ? eBack((lt - 0.9) / 0.4) || 0.001 : 0.001);
    },
    overlay(lt) {
      const items = piles.map((cs, i) => {
        const s = v.shares[i]; const txt = s.zero ? `${s.label} <span style="color:#2ecc71">0円</span>` : (s.value ? `${s.label} <span class="val">${s.value}</span>` : `${s.label} ${s.frac === 0.5 ? '1/2' : '1/4'}`);
        return callout(people[i], [0, 2.4, 0], txt, { dx: 0, dy: i === 1 ? -170 : -120, color: [C.teal, C.blue, C.down][i], delay: 1.0 + i * 0.2, size: 36 });
      });
      items.push({ kind: 'title', y: TITLE_Y, html: v.result ? v.result.replace(/(\d[\d,.]*万円)/, '<span style="color:#f2c248">$1</span>') : `総額 ${v.total} を分担`, size: 58, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.2 });
      return items;
    },
  };
};

B.shield_dome = (v) => {
  const g = new THREE.Group();
  const p = person({ ...PEOPLE.spouse }); p.userData.baseY = 0; g.add(p);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.7, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat('glassBlue')); g.add(dome);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.05, 8, 64), mat('gold')); ring.rotation.x = Math.PI / 2; g.add(ring);
  const drops = [];
  for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 16), mat('red')); c.rotation.x = Math.PI; c.castShadow = true; g.add(c); drops.push(c); }
  return {
    group: g, cam: { dist: 12, elev: 16, azim: 0, ty: 1.3 },
    update(lt, D, t) {
      dome.scale.setScalar(Math.max(0.001, eBack((lt - 0.2) / 0.5)));
      drops.forEach((c, i) => {
        const ph = ((t * 0.9 + i / 7) % 1); const ang = i * 0.9;
        const r = 1.8 * Math.abs(Math.sin(ang)) + 0.2; const yHit = Math.sqrt(Math.max(0, 1.7 * 1.7 - r * r));
        let y = 5 - ph * 6; if (y < yHit) { y = yHit + (yHit - y) * 0.6; c.position.x = Math.cos(ang) * (r + (yHit - (5 - ph * 6)) * 0.8); } else c.position.x = Math.cos(ang) * r;
        c.position.y = y; c.position.z = Math.sin(ang) * r * 0.6;
      });
      animPerson(p, t, 'cheer');
    },
    overlay() { return [callout(dome, [1.2, 1.2, 0], v.label, { dx: 40, dy: -330, color: C.teal, delay: 0.5, size: 44 })]; },
  };
};

B.land = (v) => {
  const g = new THREE.Group();
  const plot = box(4.2, 0.2, 3.4, 'grass', 0.05); plot.position.y = 0.1; g.add(plot);
  for (let i = -2; i <= 2; i++) { g.add(at(box(0.03, 0.22, 3.4, 'white'), i * 0.84, 0.11, 0)); }
  const h = house(); h.position.set(-0.6, 0.2, 0); g.add(h);
  const bar = box(0.7, 3.0, 0.7, 'gold', 0.05); bar.position.set(1.6, 1.7, 0.4); g.add(bar);
  const ghost = box(0.72, 3.0, 0.72, new THREE.MeshStandardMaterial({ color: C.down, transparent: true, opacity: 0.35 }), 0.05); ghost.position.copy(bar.position); g.add(ghost);
  return {
    group: g, cam: { dist: 13, elev: 26, azim: 16, ty: 1.2 },
    update(lt, D, t) {
      const k = eInOut((lt - 0.6) / 0.9);
      const hh = 3.0 * (1 - 0.8 * k); bar.scale.y = hh / 3.0; bar.position.y = 0.2 + hh / 2;
      ghost.material.opacity = 0.35 * k * (1 - clamp((lt - 1.6) / 0.6) * 0.5);
    },
    overlay(lt) {
      return [callout(bar, [0, 1.6, 0], '評価額', { dx: 110, dy: -260, color: C.gold, delay: 0.3, size: 40 }),
        { kind: 'title', y: TITLE_Y, html: v.label.replace(/(\d+%)/, '<span style="color:#eb4d4b">$1</span>'), size: 62, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 1.0 }];
    },
  };
};

B.umbrella = (v) => {
  const g = new THREE.Group();
  const u = umbrella(); g.add(u);
  const pile = billPile(2); pile.scale.setScalar(0.55); pile.position.set(0, 0, 0.3); g.add(pile);
  const drops = [];
  for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 12), mat('red')); c.rotation.x = Math.PI; g.add(c); drops.push(c); }
  return {
    group: g, cam: { dist: 12, elev: 14, azim: -10, ty: 1.6 },
    update(lt, D, t) {
      u.scale.setScalar(Math.max(0.001, eBack((lt - 0.1) / 0.5)));
      drops.forEach((c, i) => {
        const ph = (t * 0.8 + i / 9) % 1; const x = (i - 4) * 0.42; let y = 6 - ph * 5;
        const top = 2.2 + 0.8 * Math.sqrt(Math.max(0, 1 - (x / 1.5) ** 2)) * 0.55;
        if (Math.abs(x) < 1.5 && y < top) { y = top; c.position.x = x * (1 + (top - (6 - ph * 5)) * 0.7); } else c.position.x = x;
        c.position.y = y; c.position.z = 0.2 * Math.sin(i);
      });
    },
    overlay() {
      return [callout(u, [1.3, 2.3, 0], v.label, { dx: 20, dy: -300, color: C.down, delay: 0.4, size: 42 }),
        { kind: 'title', y: TITLE_Y, html: v.sub, size: 56, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.9 }];
    },
  };
};

B.gift_timeline = (v) => {
  const g = new THREE.Group();
  const road = box(4.4, 0.1, 1.2, 'navy', 0.04); road.position.set(-0.4, 0.05, 0); g.add(road);
  const pile = billPile(2); pile.scale.setScalar(0.42); pile.position.set(1.3, 0, 0); g.add(pile);
  const gifts = [];
  for (let i = 0; i < v.years; i++) { const b = giftBox([C.down, C.blue, C.teal, C.gold, C.pink, C.up, C.roof][i % 7]); b.scale.setScalar(0.55); g.add(b); gifts.push(b); }
  return {
    group: g, cam: { dist: 11, elev: 30, azim: 0, ty: 0.5, tx: -0.3 },
    update(lt, D, t) {
      gifts.forEach((b, i) => {
        const x0 = -2.3 + i * 0.47; const k = eInOut((lt - 0.6 - i * 0.18) / 0.5);
        b.position.set(lerp(x0, 1.15 + (i % 2) * 0.3, k), 0.1 + Math.sin(k * Math.PI) * 1.2 + k * (0.3 + Math.floor(i / 2) * 0.4), lerp(0, (i % 3 - 1) * 0.3, k));
        b.rotation.y = k * 3;
      });
    },
    overlay() {
      return [callout(gifts[0], [0, 0.9, 0], `亡くなる前${v.years}年分の贈与`, { dx: 40, dy: -300, color: C.down, delay: 0.2, size: 40 }),
        callout(pile, [0, 1.4, 0], '遺産に加算', { dx: -40, dy: -260, color: C.gold, delay: 1.4, size: 40 })];
    },
  };
};

B.calendar10 = (v) => {
  const g = new THREE.Group();
  const cal = calendar(); g.add(cal);
  const p = person({ ...PEOPLE.child1 }); p.scale.setScalar(0.9); p.position.set(1.8, 0, 0.8); p.userData.baseY = 0; g.add(p);
  return {
    group: g, cam: { dist: 11, elev: 10, azim: -14, ty: 1.4 },
    update(lt, D, t) {
      const prog = clamp((lt - 0.2) / (0.8 * D)) * v.months;
      cal.userData.flip.rotation.x = -(prog % 1) * Math.PI * 0.95;
      animPerson(p, t, 'point');
    },
    overlay(lt, D) {
      const m = Math.max(1, Math.min(v.months, Math.ceil(clamp((lt - 0.2) / (0.8 * D)) * v.months)));
      return [{ kind: 'tag', obj: cal.userData.page, local: [0, 0, 0.1], text: `${m}か月`, size: 96, delay: 0, dark: true, color: m === v.months ? '#eb4d4b' : '#111827' },
        { kind: 'title', y: TITLE_Y, html: `期限は <span style="color:#f2c248">${v.months}か月以内</span>`, size: 62, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.6 }];
    },
  };
};

B.document_stamp = (v) => {
  const g = new THREE.Group();
  const doc = documentPaper(); g.add(doc);
  const st = stamp(); g.add(st);
  return {
    group: g, cam: { dist: 9.5, elev: 52, azim: 8, ty: 0.2 },
    update(lt, D, t) {
      const k = clamp((lt - 0.5) / 0.35);
      const y = k < 0.6 ? lerp(3.0, 0.06, eOut(k / 0.6)) : lerp(0.06, 1.6, eOut((k - 0.6) / 0.4));
      st.position.set(0.5, y, 0.5);
    },
    overlay(lt) {
      const items = [callout(doc, [0, 0.1, -1.15], v.title, { dx: 0, dy: -210, color: C.blue, delay: 0.2, size: 42 })];
      if (lt > 0.72) items.push({ kind: 'stampmark', obj: doc, local: [0.5, 0.06, 0.5], text: v.stamp });
      items.push({ kind: 'title', y: TITLE_Y, html: '申告しないと<span style="color:#eb4d4b">特例は使えない</span>', size: 54, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.9 });
      return items;
    },
  };
};

B.summary3d = (v) => {
  const g = new THREE.Group();
  const h = house(); h.position.set(-1.6, 0, -1); g.add(h);
  const pile = billPile(2); pile.scale.setScalar(0.6); pile.position.set(1.4, 0, -0.6); g.add(pile);
  return {
    group: g, cam: { dist: 12, elev: 20, azim: 0, ty: 1.0 },
    update(lt, D, t) { g.rotation.y = 0.2 * Math.sin(t * 0.4); },
    overlay() { return [{ kind: 'card', y: 1040, tag: 'まとめ', html: v.text.split('\n').join('<br>'), size: 54, delay: 0.15 }]; },
  };
};

B.consult = (v) => {
  const g = new THREE.Group();
  const b = officeBuilding(); b.position.set(1.2, 0, -1.2); g.add(b);
  const adv = person({ ...PEOPLE.guide }); adv.position.set(-1.3, 0, 0.6); adv.userData.baseY = 0; g.add(adv);
  return {
    group: g, cam: { dist: 12.5, elev: 16, azim: 10, ty: 1.3 },
    update(lt, D, t) { animPerson(adv, t, 'wave'); },
    overlay() {
      return [callout(adv, [0, 2.3, 0], v.items[0], { dx: -20, dy: -220, color: C.teal, delay: 0.3, size: 44 }),
        callout(b, [0, 2.4, 0], v.items[1], { dx: 30, dy: -260, color: C.blue, delay: 0.6, size: 44 })];
    },
  };
};

B.disclaimer3d = () => {
  const g = new THREE.Group();
  const c = coin(0.9); c.rotation.x = Math.PI / 2; c.position.y = 2.6; g.add(c);
  return {
    group: g, cam: { dist: 12, elev: 8, azim: 0, ty: 1.6 },
    update(lt, D, t) { c.rotation.z = t * 1.2; },
    overlay() {
      return [{ kind: 'card', y: 1150, tag: 'ご注意', html: '情報提供目的です。<br>投資判断はご自身で', size: 52, delay: 0.15,
        foot: spec.asof ? `数値は${spec.asof}` : '' }];
    },
  };
};

// ------------------------------------------------------------------ setup
function gradientTexture(top, bottom) {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 512;
  const ctx = cv.getContext('2d'); const gr = ctx.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom); ctx.fillStyle = gr; ctx.fillRect(0, 0, 4, 512);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
const THEMES = {
  studio: { top: '#f4f5f8', bottom: '#cdd3dd', floor: 0xdfe3ea, fog: 0xd9dee7 },
  navy: { top: '#0b1634', bottom: '#1b2f63', floor: 0x14254f, fog: 0x15264f },
};

async function init() {
  spec = await (await fetch('/__spec.json')).json();
  tl = await (await fetch('/__timeline.json')).json();
  const th = THEMES[new URLSearchParams(location.search).get('theme') || spec.theme || 'studio'];
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.background = gradientTexture(th.top, th.bottom);
  scene.fog = new THREE.Fog(th.fog, 34, 70);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 200);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8892a6, 0.8); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(5, 10, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6; sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 }); scene.add(sun);
  floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: th.floor, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // preload fonts for every glyph that will appear
  const all = spec.scenes.map((s) => s.text + JSON.stringify(s.visual) + (s.note || '')).join('') + (spec.asof || '') + '0123456789%万円か月以内合計残り遺産基礎控除申告まとめご注意情報提供目的です投資判断はご自身で数値は時点期限';
  const pre = document.getElementById('preload');
  pre.innerHTML = [500, 700, 900].map((w) => `<span style="font-weight:${w}">${all.replace(/[<>&]/g, '')}</span>`).join('');
  await document.fonts.ready;
  for (const w of [500, 700, 900]) await document.fonts.load(`${w} 40px "Noto Sans JP"`, all);
  await document.fonts.ready;
  window.ready = true;
}

function getBuilt(i) {
  if (!built.has(i)) {
    const sc = spec.scenes[i]; const v = sc.visual || {};
    const fn = B[v.type] || B.summary3d;
    const b = fn(v, sc); b.group.visible = false; scene.add(b.group); built.set(i, b);
  }
  return built.get(i);
}
function sceneAt(t) {
  const ss = tl.scenes; for (const s of ss) if (t >= s.start && t < s.end) return s; return ss[ss.length - 1];
}
function camPose(b, lt, D, t) {
  const c = b.cam; const az = (c.azim + 7 * Math.sin(t * 0.22)) * Math.PI / 180;
  const el = (c.elev + 2 * Math.sin(t * 0.17)) * Math.PI / 180;
  const dist = c.dist * DIST_SCALE * (1 - 0.05 * clamp(lt / D));
  const tx = c.tx || 0;
  const target = new THREE.Vector3(tx, c.ty, 0);
  const pos = new THREE.Vector3(tx + Math.sin(az) * Math.cos(el) * dist, c.ty + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
  return { pos, target };
}

// ------------------------------------------------------------------ overlay
function project(obj, local) {
  obj.updateWorldMatrix(true, false);
  const v = new THREE.Vector3(...local).applyMatrix4(obj.matrixWorld).project(camera);
  return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
}
function esc(s) { return String(s); }
function layoutCallouts(items) {
  const boxes = [];
  for (const it of items) {
    if (it.kind !== 'callout') continue;
    const [ax, ay] = project(it.obj, it.local);
    const size = it.size || 40; const w = String(it.text).replace(/<[^>]+>/g, '').length * size * 1.02 + 90; const h = size * 1.75;
    const bx = clamp(ax + (it.dx || 0), SAFE_L + w / 2, SAFE_R - w / 2);
    const by = clamp(ay + (it.dy || -200), CALLOUT_MIN_Y, CALLOUT_MAX_Y);
    it._l = { ax, ay, bx, by, w, h }; boxes.push(it._l);
  }
  for (let iter = 0; iter < 30; iter++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = (a.w + b.w) / 2 + 12 - Math.abs(a.bx - b.bx), oy = (a.h + b.h) / 2 + 12 - Math.abs(a.by - b.by);
      if (ox > 0 && oy > 0) {
        const push = oy / 2 + 1; const s = a.by <= b.by ? -1 : 1;
        a.by = clamp(a.by + s * push, CALLOUT_MIN_Y, CALLOUT_MAX_Y); b.by = clamp(b.by - s * push, CALLOUT_MIN_Y, CALLOUT_MAX_Y); moved = true;
      }
    }
    if (!moved) break;
  }
}
function overlayHTML(items, lt, sceneTl, sc, t) {
  let html = ''; let lines = '';
  layoutCallouts(items);
  for (const it of items) {
    const k = eOut((lt - (it.delay || 0)) / 0.3); if (k <= 0) continue;
    if (it.kind === 'callout') {
      const { ax, ay, bx, by } = it._l; const size = it.size || 40;
      const col = hex(it.color ?? C.gold);
      lines += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="white" stroke-width="4" opacity="${0.9 * k}"/>`;
      lines += `<circle cx="${ax}" cy="${ay}" r="12" fill="${col}" stroke="white" stroke-width="5" opacity="${k}"/>`;
      html += `<div class="callout" style="left:${bx}px;top:${by + (1 - k) * 20}px;font-size:${size}px;opacity:${k}"><span class="dot" style="background:${col}"></span><span>${it.text}</span></div>`;
    } else if (it.kind === 'tag') {
      const [x, y] = project(it.obj, it.local);
      const st = it.dark ? `color:${it.color};font-size:${it.size}px;` : (it.hi ? `background:#f2c248;color:#111827;font-size:${it.size * 1.3}px;` : `background:rgba(17,24,39,0.85);color:#fff;font-size:${it.size}px;`);
      html += `<div class="callout" style="left:${x}px;top:${y}px;opacity:${k};${it.dark ? 'background:none;box-shadow:none;' : ''}${st}padding:6px 14px">${it.text}</div>`;
    } else if (it.kind === 'title') {
      const sz = it.size || 64;
      html += `<div class="title" style="top:${it.y + (1 - k) * 30}px;opacity:${k};font-size:${sz}px;color:${it.color};"><span style="display:inline-block;background:${it.bg};padding:${sz * 0.22}px ${sz * 0.5}px;border-radius:${sz * 0.32}px;box-shadow:0 10px 26px rgba(0,0,0,0.25)">${it.html}</span></div>`;
    } else if (it.kind === 'card') {
      html += `<div class="card" style="top:${it.y}px;transform:translate(0,-50%) scale(${0.9 + 0.1 * k});opacity:${k};font-size:${it.size}px;font-weight:900;line-height:1.5"><span class="tag">${it.tag}</span>${it.html}${it.foot ? `<div style="font-size:32px;color:#9aa6bf;margin-top:18px;font-weight:700">${it.foot}</div>` : ''}</div>`;
    } else if (it.kind === 'stampmark') {
      const [x, y] = project(it.obj, it.local);
      html += `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(-12deg) scale(${lerp(1.6, 1, k)});opacity:${k};border:10px solid #eb4d4b;color:#eb4d4b;border-radius:50%;width:190px;height:190px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:64px">${it.text}</div>`;
    }
  }
  // subtitles
  const chunks = sceneTl.chunks; let active = -1;
  chunks.forEach((c, i) => { if (c.start <= t) active = i; });
  if (chunks.length) {
    const sent = active >= 0 ? chunks[active].sentence : chunks[0].sentence;
    const sc_ = chunks.filter((c) => c.sentence === sent);
    const inner = sc_.map((c) => {
      const on = active >= 0 && c === chunks[active] && t <= c.end + 0.35;
      return `<span class="chunk ${on ? 'on' : (c.start <= t ? 'done' : '')}">${esc(c.display)}</span>`;
    }).join('');
    html += `<div class="sub" id="subbox" style="top:${(SUB_TOP + SUB_BOTTOM) / 2}px;transform:translateY(-50%)">${inner}</div>`;
  }
  // note pill
  const notes = [];
  if (sc.asof) notes.push(`<span style="color:#b07a14">${typeof sc.asof === 'string' ? sc.asof : spec.asof}</span>`);
  if (sc.note) notes.push(sc.note);
  if (notes.length) html += `<div class="note" style="top:${NOTE_Y}px;transform:translateY(-50%)"><span style="background:rgba(255,255,255,0.88);color:#1f2937">${notes.join('　')}</span></div>`;
  if (spec.pr) html += '<div class="pr">PR</div>';
  ov.innerHTML = html; svg.innerHTML = lines;
}

// ------------------------------------------------------------------ frame
window.renderAt = (t) => {
  const s = sceneAt(t); const i = s.index; const lt = t - s.start; const D = s.end - s.start;
  const cur = getBuilt(i);
  for (const [j, b] of built) b.group.visible = j === i || (j === i - 1 && lt < 0.35);
  cur.group.visible = true;
  const pop = eBack(lt / 0.5); cur.group.scale.setScalar(Math.max(0.001, lerp(0.75, 1, pop)));
  cur.update(lt, D, t);
  let pose = camPose(cur, lt, D, t);
  if (i > 0 && lt < 0.6) {
    const ps = tl.scenes[i - 1]; const prev = getBuilt(i - 1); const Dp = ps.end - ps.start;
    if (lt < 0.35) { prev.group.visible = true; prev.group.scale.setScalar(Math.max(0.001, 1 - eOut(lt / 0.3))); prev.update(Dp + lt, Dp, t); }
    const pp = camPose(prev, Dp, Dp, t); const k = eInOut(lt / 0.6);
    pose = { pos: pp.pos.clone().lerp(pose.pos, k), target: pp.target.clone().lerp(pose.target, k) };
  }
  camera.position.copy(pose.pos); camera.lookAt(pose.target);
  // keep the composition centred between the subtitles and the bottom safe line
  camera.setViewOffset(W, H, 0, -40, W, H); camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  overlayHTML(cur.overlay(lt, D, t), lt, s, spec.scenes[i], t);
  return true;
};

init().catch((e) => { window.initError = String(e && e.stack || e); });

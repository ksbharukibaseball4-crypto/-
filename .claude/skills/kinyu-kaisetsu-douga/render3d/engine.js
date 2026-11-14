// 3D scene engine for kinyu-kaisetsu-douga (Three.js, rendered in headless Chromium).
// window.renderAt(t) draws the frame at time t (seconds): 3D canvas + DOM overlay
// (subtitles with word highlight, callout labels, titles, notes, PR badge).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

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

let spec, tl, renderer, scene, camera, floor, composer = null, themeName = 'studio', sunLight = null, hemiLight = null;
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
    pink: () => std({ color: C.pink, roughness: 0.45 }),
    purple: () => std({ color: 0x9b7bd8, roughness: 0.45 }),
    gray: () => std({ color: 0x8c95a6, roughness: 0.4, metalness: 0.3 }),
    steel: () => std({ color: 0x5b6475, roughness: 0.3, metalness: 0.6 }),
    desk: () => std({ color: 0xc89b6d, roughness: 0.6 }),
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
  arms[1].rotation.x = 0;
  if (pose === 'raise') { r = -2.9 + 0.1 * Math.sin(tt * 5); }
  else if (pose === 'surprise') { l = 2.2 + 0.15 * Math.sin(tt * 9); r = -2.2 - 0.15 * Math.sin(tt * 9); head.rotation.z = 0.1 * Math.sin(tt * 9); }
  else if (pose === 'ok') { r = -1.4; arms[1].rotation.x = -0.6; }
  else if (pose === 'wave') { r = -2.6 + 0.35 * Math.sin(tt * 8); }
  else if (pose === 'cheer') { l = 2.7 + 0.2 * Math.sin(tt * 6); r = -2.7 - 0.2 * Math.sin(tt * 6); }
  else if (pose === 'point') { r = -1.9; }
  else if (pose === 'think') { r = -2.4; arms[1].rotation.x = -0.9; }
  else if (pose === 'worry') { l = 0.5; r = -0.5; head.rotation.z = 0.18; }
  arms[0].rotation.z = lerp(0.18, l, k); arms[1].rotation.z = lerp(-0.18, r, k);
  let bob = pose === 'cheer' ? Math.abs(Math.sin(tt * 4)) * 0.15 : 0.03 * Math.sin(tt * 2.2);
  if (pose === 'surprise') bob += Math.abs(Math.sin(tt * 6)) * 0.08;
  if (p.userData.talking) bob += Math.abs(Math.sin(tt * 9)) * 0.05;
  p.position.y = (p.userData.baseY ?? 0) + bob;
}
const PEOPLE = {
  spouse: { body: 'teal', hair: 0x4a2c1d },
  child1: { body: 'blue', hair: 0x222228 },
  child2: { body: 'red', hair: 0x3a2618 },
  guide: { body: 'navy', hair: 0x2a1c14, glasses: true, tie: true },
  teacher: { body: 'navy', hair: 0x2a1c14, glasses: true, tie: true },
  student: { body: 'pink', hair: 0x2a1a12 },
  worker: { body: 'blue', hair: 0x222228, tie: true },
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
      items.push({ kind: 'title', y: TITLE_Y, html: v.caption || '申告しないと<span style="color:#eb4d4b">特例は使えない</span>', size: 54, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.9 });
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

// ------------------------------------------------------------------ school series (classroom set + visuals)
let board = null;   // { tex, ctx, key }
function noiseCanvas(w, h, base, amp) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 60; i++) {
    const a = Math.random() * amp; ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  return cv;
}
function buildSchool() {
  const g = new THREE.Group();
  // wall
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), new THREE.MeshStandardMaterial({ color: 0xf1e7d6, roughness: 0.95 }));
  wall.position.set(0, 9, -6.2); wall.receiveShadow = true; g.add(wall);
  const wains = new THREE.Mesh(new THREE.BoxGeometry(60, 1.6, 0.1), new THREE.MeshStandardMaterial({ color: 0xc29a6b, roughness: 0.7 }));
  wains.position.set(0, 0.8, -6.1); g.add(wains);
  // blackboard
  const frame = box(7.6, 3.6, 0.18, 'wood', 0.04); frame.position.set(0, 3.25, -6.0); g.add(frame);
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 940;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const bmesh = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  bmesh.position.set(0, 3.25, -5.9); g.add(bmesh);
  const tray = box(7.2, 0.08, 0.25, 'wood'); tray.position.set(0, 1.55, -5.8); g.add(tray);
  for (let i = 0; i < 3; i++) { const ch = cyl(0.035, 0.035, 0.3, i ? 'white' : 'yellow', 10); ch.rotation.z = Math.PI / 2; ch.position.set(-2.5 + i * 0.4, 1.62, -5.75); g.add(ch); }
  // clock
  const clk = cyl(0.45, 0.45, 0.08, 'white', 40); clk.rotation.x = Math.PI / 2; clk.position.set(4.8, 5.4, -6.05); g.add(clk);
  const crim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 8, 40), mat('navy')); crim.position.set(4.8, 5.4, -6.0); g.add(crim);
  const hand1 = box(0.04, 0.32, 0.02, 'black'); hand1.position.set(4.8, 5.52, -5.99); g.add(hand1);
  const hand2 = box(0.25, 0.04, 0.02, 'black'); hand2.position.set(4.92, 5.4, -5.99); g.add(hand2);
  // windows (left)
  for (const x of [-6.2, -9.2]) {
    const wf = box(2.2, 2.6, 0.12, 'white'); wf.position.set(x, 4.2, -6.05); g.add(wf);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.4), new THREE.MeshStandardMaterial({ color: 0xbfe3ff, emissive: 0x9fd0ff, emissiveIntensity: 0.35 }));
    gl.position.set(x, 4.2, -5.98); g.add(gl);
  }
  board = { tex, ctx: cv.getContext('2d'), key: '', bg: noiseCanvas(2048, 940, '#2f5a46', 0.05) };
  return g;
}
function drawBoard(lines, prog, key) {
  if (!board || board.key === key) return;
  board.key = key;
  const { ctx } = board; const w = 2048, h = 940;
  ctx.drawImage(board.bg, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.font = '700 46px "Noto Sans JP"'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'center'; ctx.fillText(`${spec.series || ''}　${spec.episode || ''}`, w / 2, 70);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(300, 120); ctx.lineTo(w - 300, 120); ctx.stroke();
  const L = lines && lines.length ? lines : [];
  const n = L.length; const size = n === 1 ? 190 : 150;
  L.forEach((ln, i) => {
    const y = 140 + (h - 140) * (i + 1) / (n + 1);
    ctx.font = `900 ${size}px "Noto Sans JP"`; ctx.textAlign = 'center';
    let f = size; while (ctx.measureText(ln).width > 1400 && f > 60) { f -= 6; ctx.font = `900 ${f}px "Noto Sans JP"`; }
    const tw = ctx.measureText(ln).width;
    const p = clamp(prog * n - i);
    if (p <= 0) return;
    ctx.save(); ctx.beginPath(); ctx.rect(w / 2 - tw / 2 - 10, y - f, (tw + 20) * p, f * 2); ctx.clip();
    ctx.fillStyle = i === 0 && n > 1 ? 'rgba(255,236,150,0.96)' : 'rgba(255,255,255,0.94)';
    ctx.shadowColor = 'rgba(255,255,255,0.35)'; ctx.shadowBlur = 6;
    ctx.fillText(ln, w / 2, y);
    ctx.restore();
  });
  board.tex.needsUpdate = true;
}
function deskSet() {
  const g = new THREE.Group();
  g.add(at(box(1.3, 0.08, 0.8, 'desk', 0.02), 0, 0.82, 0));
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.32, 0.32]) g.add(at(cyl(0.035, 0.035, 0.8, 'steel', 8), sx, 0.4, sz));
  g.add(at(box(0.6, 0.04, 0.45, 'paper'), 0.1, 0.88, 0.05));
  return g;
}
function pointer() { const p = cyl(0.025, 0.035, 1.4, 'wood', 8); p.rotation.z = Math.PI / 2.6; return p; }

B.class = (v, sc) => {
  const g = new THREE.Group();
  const teacher = person({ ...PEOPLE.teacher }); teacher.position.set(-1.7, 0, 0.4); teacher.rotation.y = 0.25; teacher.userData.baseY = 0; g.add(teacher);
  const pt = pointer(); pt.position.set(0.55, 1.2, 0.2); teacher.add(pt);
  const student = person({ ...PEOPLE.student, phase: 1.3 }); student.position.set(1.7, 0, 1.0); student.rotation.y = -0.35; student.scale.setScalar(0.85); student.userData.baseY = 0; g.add(student);
  const desk = deskSet(); desk.position.set(1.7, 0, 1.75); desk.scale.setScalar(0.85); g.add(desk);
  const stu = v.focus === 'student';
  return {
    group: g, cam: stu ? { dist: 10.6, elev: 7, azim: 0, ty: 2.2, tx: 0.1 } : { dist: 11, elev: 7, azim: 4, ty: 2.3, tx: 0 },
    update(lt, D, t) {
      teacher.userData.talking = sc.speaker !== 'student' && lt < D - 0.4;
      student.userData.talking = sc.speaker === 'student' && lt < D - 0.4;
      animPerson(teacher, t, v.tpose || 'point'); animPerson(student, t, v.spose || 'idle');
      pt.visible = (v.tpose || 'point') === 'point';
    },
    board: (lt) => ({ lines: v.board, prog: eOut((lt - 0.15) / 0.9) }),
    overlay() { return []; },
  };
};

B.payslip3d = (v, sc) => {
  const g = new THREE.Group();
  const paper = box(3.0, 3.8, 0.08, 'paper', 0.04); paper.position.set(-0.3, 2.1, 0); paper.rotation.x = -0.08; g.add(paper);
  const head = box(3.0, 0.55, 0.1, 'navy', 0.04); head.position.set(0, 1.6, 0.01); paper.add(head);
  const rows = v.rows || [];
  const rowObjs = rows.map((r, i) => { const y = 0.95 - i * 0.68; const line = box(2.6, 0.03, 0.09, new THREE.MeshStandardMaterial({ color: 0xd0d6e2 })); line.position.set(0, y - 0.3, 0.01); paper.add(line); const anchor = new THREE.Object3D(); anchor.position.set(0, y, 0.06); paper.add(anchor); return anchor; });
  const hl = rows.findIndex((r) => r.hl);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 10, 40), mat('gold')); const glassM = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), mat('glass'));
  const mag = new THREE.Group(); mag.add(ring); mag.add(glassM); const hd = cyl(0.06, 0.07, 0.8, 'navy', 12); hd.position.set(0.48, -0.48, 0); hd.rotation.z = Math.PI / 4; mag.add(hd); g.add(mag);
  const student = person({ ...PEOPLE.student, phase: 0.6 }); student.position.set(1.9, 0, 0.9); student.rotation.y = -0.4; student.scale.setScalar(0.85); student.userData.baseY = 0; g.add(student);
  return {
    group: g, cam: { dist: 11, elev: 8, azim: 6, ty: 2.0, tx: 0.3 },
    update(lt, D, t) {
      const k = eInOut((lt - 0.5) / 0.7);
      const target = hl >= 0 ? new THREE.Vector3(0.7, 0.95 - hl * 0.68, 0.5) : new THREE.Vector3(0, 0, 0.5);
      mag.position.set(lerp(1.8, -0.3 + target.x, k), lerp(3.6, 2.1 + target.y, k), 0.5 + 0.05 * Math.sin(t * 3));
      student.userData.talking = sc.speaker === 'student';
      animPerson(student, t, sc.speaker === 'student' ? 'surprise' : 'think');
    },
    overlay(lt) {
      const items = [{ kind: 'tag', obj: paper, local: [0, 1.6, 0.08], text: v.title || '給与明細', size: 40, delay: 0, dark: true, color: '#ffe28c' }];
      rows.forEach((r, i) => {
        const col = r.color === 'up' ? '#16a34a' : (r.value === '−' ? '#dc2626' : '#111827');
        items.push({ kind: 'tag', obj: rowObjs[i], local: [-0.6, 0, 0], text: `<span style="color:#1f2937">${r.label}</span>`, size: r.hl ? 46 : 40, delay: 0.1 + i * 0.12, dark: true, color: '#1f2937' });
        items.push({ kind: 'tag', obj: rowObjs[i], local: [1.0, 0, 0], text: `<span style="color:${col}">${r.value}</span>`, size: 56, delay: 0.1 + i * 0.12, dark: true, color: col });
      });
      if (hl >= 0) items.push({ kind: 'ring', obj: rowObjs[hl], local: [0.1, 0, 0], w: 640, h: 110, color: rows[hl].color === 'up' ? '#16a34a' : '#dc2626', delay: 0.9 });
      return items;
    },
  };
};

B.income_blocks = (v) => {
  const g = new THREE.Group();
  const total = v.total_v || 100; const parts = v.parts || [];
  const H0 = 3.6; const colors = { expense: C.blue, deduct: C.teal, social: 0x9b7bd8 };
  const pv = parts.map((p) => p.v || total * 0.35);
  const restV = total - pv.reduce((a, b) => a + b, 0) * (v.total_v ? 1 : 1);
  const segs = []; let y = 0;
  const restH = H0 * Math.max(0.12, restV / total);
  const rest = box(1.8, restH, 1.5, 'gold', 0.05); rest.position.set(-0.9, restH / 2, 0); g.add(rest);
  y = restH;
  parts.forEach((p, i) => {
    const h = H0 * pv[i] / total;
    const m = box(1.8, h - 0.04, 1.5, new THREE.MeshStandardMaterial({ color: colors[p.kind] || C.blue, roughness: 0.4, transparent: true, opacity: 1 }), 0.05);
    m.userData = { y0: y + h / 2, h }; m.position.set(-0.9, y + h / 2, 0); g.add(m); segs.push(m); y += h;
  });
  const upto = v.upto ?? parts.length;
  return {
    group: g, cam: { dist: 12, elev: 14, azim: 12, ty: 1.9, tx: 0.2 },
    update(lt, D, t) {
      // parts before `upto-1` are already peeled; the newest peels now
      let stackY = 0;
      segs.forEach((m, i) => {
        const done = i < upto - 1 ? 1 : (i === upto - 1 ? eInOut((lt - 0.5) / 0.9) : 0);
        const tx = 1.5, ty = m.userData.h / 2 + stackY;
        m.position.set(lerp(-0.9, tx, done), lerp(m.userData.y0, ty, done) + Math.sin(done * Math.PI) * 0.6, lerp(0, 0.2, done));
        m.material.opacity = lerp(1, 0.55, done);
        if (done > 0) stackY += m.userData.h + 0.05;
      });
    },
    overlay(lt) {
      const items = [];
      if (!v.total_v) {
        items.push(callout(segs[0], [0, 0, 0.8], parts[0].label, { dx: 0, dy: 0, color: C.blue, delay: 0.3, size: 44 }));
        items.push(callout(rest, [0, 0, 0.8], v.rest || '所得', { dx: 0, dy: 0, color: C.gold, delay: 0.9, size: 44 }));
        items.push({ kind: 'title', y: TITLE_Y, html: `${v.total} − 経費 ＝ <span style="color:#f2c248">${v.rest || '所得'}</span>`, size: 54, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 1.0 });
        return items;
      }
      segs.forEach((m, i) => { if (i < upto) items.push(callout(m, [0.9, 0, 0.75], parts[i].label, { dx: 120, dy: -40 - i * 20, color: m.material.color.getHex(), delay: i === upto - 1 ? 1.0 : 0.1, size: 36 })); });
      items.push(callout(rest, [-0.9, 0, 0.75], v.rest || '残り', { dx: -60, dy: v.rest ? -120 : 60, color: C.gold, delay: v.rest ? 0.3 : 1.3, size: v.rest ? 46 : 36 }));
      items.push({ kind: 'title', y: TITLE_Y, html: v.total, size: 54, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.05 });
      return items;
    },
  };
};

B.progressive = (v) => {
  const g = new THREE.Group();
  const total = v.total; const W0 = 5.0; let x = -W0 / 2; let prev = 0;
  const cols = [0x9fc4ff, 0x5b8de6, 0x2d58ad];
  const blocks = v.brackets.map((b, i) => {
    const w = W0 * (b.upto - prev) / total; const h = 0.3 + b.rate / 20 * 2.4;
    const m = box(w - 0.05, h, 1.4, new THREE.MeshStandardMaterial({ color: cols[i % 3], roughness: 0.35 }), 0.04);
    m.userData = { h, x: x + w / 2 }; m.position.set(x + w / 2, h / 2, 0); g.add(m); x += w; const lo = prev; prev = b.upto; return { m, b, lo };
  });
  const p = person({ ...PEOPLE.student }); p.scale.setScalar(0.55); p.userData.baseY = 0; g.add(p);
  return {
    group: g, cam: { dist: 12, elev: 16, azim: -10, ty: 1.4 },
    update(lt, D, t) {
      blocks.forEach(({ m }, i) => { const k = eBack((lt - 0.2 - i * 0.35) / 0.5); m.scale.y = Math.max(0.001, k); m.position.y = m.userData.h / 2 * Math.max(0.001, k); });
      const k = clamp((lt - 1.0) / (D - 1.4)); const xx = lerp(-2.4, 2.3, k);
      const cur = blocks.find(({ m }) => Math.abs(m.userData.x - xx) <= (m.geometry.parameters.width / 2 + 0.05)) || blocks[blocks.length - 1];
      p.position.set(xx, cur.m.userData.h, 0); p.userData.baseY = cur.m.userData.h; animPerson(p, t, 'cheer');
      p.rotation.y = Math.PI / 2 * 0.6;
    },
    overlay() {
      return blocks.map(({ m, b, lo }, i) => callout(m, [0, m.userData.h / 2, 0.7], `${lo ? `${lo}〜` : ''}${b.upto}万円 <span class="val">${b.rate}%</span>`,
        { dx: [-40, 0, 40][i], dy: -170 - i * 70, color: cols[i % 3], delay: 0.4 + i * 0.35, size: 34 }));
    },
  };
};

B.result_coins = (v) => {
  const g = new THREE.Group();
  const stacks = [5, 3, 4].map((n, i) => { const cs = coinStack(n, 0.5); cs.position.set((i - 1) * 1.15, 0, i === 1 ? 0.5 : 0); g.add(cs); return cs; });
  const p = person({ ...PEOPLE.teacher }); p.position.set(-2.4, 0, -0.4); p.scale.setScalar(0.85); p.userData.baseY = 0; g.add(p);
  return {
    group: g, cam: { dist: 10.5, elev: 14, azim: 0, ty: 1.2 },
    update(lt, D, t) { stacks.forEach((cs, i) => cs.children.forEach((c, j) => { c.visible = j < Math.ceil(cs.children.length * eOut((lt - 0.1 - i * 0.15) / 0.7)); })); animPerson(p, t, 'point'); },
    overlay() {
      return [{ kind: 'title', y: 1060, html: `所得税 <span style="color:#f2c248">${v.value}</span>`, size: 96, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.4 },
        { kind: 'title', y: TITLE_Y, html: v.sub, size: 44, color: '#111827', bg: 'rgba(255,255,255,0.92)', delay: 0.8 }];
    },
  };
};

function companyBldg() {
  const g = new THREE.Group();
  g.add(at(box(1.6, 2.6, 1.4, 'white', 0.04), 0, 1.3, 0));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.add(at(box(0.3, 0.32, 0.05, 'window'), -0.5 + c * 0.5, 0.6 + r * 0.55, 0.71));
  g.add(at(box(1.7, 0.18, 1.5, 'blue', 0.03), 0, 2.68, 0));
  return g;
}
function nationBldg() {
  const b = officeBuilding(); const pole = cyl(0.03, 0.03, 1.2, 'gray', 8); pole.position.set(0.9, 2.6, -0.3); b.add(pole);
  const flag = box(0.55, 0.36, 0.02, 'white'); flag.position.set(1.18, 3.0, -0.3); b.add(flag);
  const sun = cyl(0.1, 0.1, 0.03, 'red', 20); sun.rotation.x = Math.PI / 2; sun.position.set(1.18, 3.0, -0.28); b.add(sun);
  return b;
}
B.flow3d = (v) => {
  const g = new THREE.Group();
  const w = person({ ...PEOPLE.worker }); w.position.set(-2.4, 0, 0.6); w.scale.setScalar(0.8); w.userData.baseY = 0; g.add(w);
  const co = companyBldg(); co.position.set(0, 0, -0.4); co.scale.setScalar(0.8); g.add(co);
  const na = nationBldg(); na.position.set(2.5, 0, -0.6); na.scale.setScalar(0.62); g.add(na);
  const coins = [0, 1, 2].map(() => { const c = coin(0.26); g.add(c); return c; });
  return {
    group: g, cam: { dist: 12.5, elev: 16, azim: 0, ty: 1.3 },
    update(lt, D, t) {
      animPerson(w, t, v.stage === 1 ? 'worry' : 'idle');
      coins.forEach((c, i) => {
        const ph = ((lt - 0.4) * 0.7 + i / 3) % 1; const vis = lt > 0.4;
        const [a, b] = v.stage === 1 ? [[0, 2.4, 0], [-2.4, 1.2, 0.6]] : [[0, 2.4, 0], [2.5, 2.2, -0.4]];
        // stage 1: tax is taken out of the pay at the company; stage 2: company sends it to the nation
        const from = v.stage === 1 ? [-2.4, 1.4, 0.6] : a, to = v.stage === 1 ? [0, 2.2, -0.2] : b;
        c.visible = vis; c.position.set(lerp(from[0], to[0], ph), lerp(from[1], to[1], ph) + Math.sin(ph * Math.PI) * 1.0, lerp(from[2], to[2], ph));
        c.rotation.set(Math.PI / 2, t * 4 + i, 0);
      });
    },
    overlay() {
      return [callout(w, [0, 2.2, 0], 'あなた', { dx: -10, dy: -200, color: C.blue, delay: 0.2, size: 40 }),
        callout(co, [0, 3.0, 0], v.stage === 1 ? '会社が先に引く' : '会社', { dx: 0, dy: -260, color: C.gold, delay: 0.3, size: 40 }),
        callout(na, [0, 2.6, 0], v.stage === 2 ? '国に納める' : '国', { dx: 10, dy: -200, color: C.down, delay: 0.4, size: 40 })];
    },
  };
};

function clockProp() {
  const g = new THREE.Group(); const f = cyl(0.62, 0.62, 0.18, 'white', 40); f.rotation.x = Math.PI / 2; f.position.y = 0.75; g.add(f);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.07, 10, 40), mat('gold')); rim.position.y = 0.75; g.add(rim);
  const h1 = box(0.06, 0.4, 0.04, 'black'); h1.position.set(0, 0.92, 0.11); g.add(h1); const h2 = box(0.3, 0.06, 0.04, 'black'); h2.position.set(0.13, 0.75, 0.11); g.add(h2);
  g.userData.hand = h2; return g;
}
function safeProp() {
  const g = new THREE.Group(); g.add(at(box(1.2, 1.2, 1.1, 'steel', 0.06), 0, 0.6, 0));
  const door = new THREE.Group(); door.position.set(-0.6, 0.6, 0.56); g.add(door);
  const dm = box(1.15, 1.1, 0.08, 'gray', 0.04); dm.position.set(0.58, 0, 0.02); door.add(dm);
  const dial = cyl(0.2, 0.2, 0.08, 'gold', 24); dial.rotation.x = Math.PI / 2; dial.position.set(0.58, 0.1, 0.08); door.add(dial);
  const hnd = box(0.36, 0.06, 0.06, 'gold'); hnd.position.set(0.58, -0.3, 0.09); door.add(hnd);
  g.userData.door = door; return g;
}
function magnifier() {
  const g = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 10, 40), mat('gold')); ring.position.y = 0.95; g.add(ring);
  const gl = new THREE.Mesh(new THREE.CircleGeometry(0.43, 32), mat('glass')); gl.position.y = 0.95; g.add(gl);
  const hd = cyl(0.07, 0.08, 0.7, 'navy', 12); hd.position.set(0.45, 0.4, 0); hd.rotation.z = Math.PI / 4; g.add(hd); return g;
}
B.reasons3 = (v) => {
  const g = new THREE.Group();
  const labels = ['①手間を減らす', '②払い忘れを防ぐ', '③所得をつかむ'];
  const props = [clockProp(), safeProp(), magnifier()];
  const items = props.map((pr, i) => { const h = new THREE.Group(); h.position.set((i - 1) * 2.0, 0, i === 1 ? -0.4 : 0.3); const pd = pedestal(0.8, 0.3); h.add(pd); pr.position.y = 0.3; pr.scale.setScalar(0.8); h.add(pr); g.add(h); return { h, pd, pr }; });
  return {
    group: g, cam: { dist: 12, elev: 18, azim: 0, ty: 1.2 },
    update(lt, D, t) {
      items.forEach(({ h, pd, pr }, i) => {
        const on = v.current === i; const k = v.current == null ? eBack((lt - 0.2 - i * 0.35) / 0.45) : 1;
        h.scale.setScalar(Math.max(0.001, k) * (on ? 1.15 + 0.04 * Math.sin(t * 5) : (v.current == null ? 1 : 0.85)));
        pd.material = mat(on ? 'gold' : 'pedestal'); pr.rotation.y = on ? t * 1.2 : 0.3 * Math.sin(t + i);
        if (pr.userData.hand) pr.userData.hand.rotation.z = -t * 2;
        if (pr.userData.door) pr.userData.door.rotation.y = on ? -1.2 * Math.abs(Math.sin(t * 1.2)) : 0;
      });
    },
    overlay() {
      return items.map(({ h }, i) => callout(h, [0, 1.6, 0], labels[i], { dx: [-30, 0, 30][i], dy: [-170, -300, -170][i], color: v.current === i ? C.gold : C.muted, delay: v.current == null ? 0.4 + i * 0.35 : 0.1, size: v.current === i ? 44 : 32 }));
    },
  };
};

B.crowd = () => {
  const g = new THREE.Group(); const ps = [];
  const bodies = ['blue', 'teal', 'red', 'pink', 'purple', 'navy', 'blue', 'teal', 'red'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const p = person({ body: bodies[r * 3 + c], hair: 0x2a1c14, phase: r * 3 + c }); p.scale.setScalar(0.62); p.position.set((c - 1) * 1.35 + (r % 2) * 0.3, 0, (r - 1) * 1.2); p.userData.baseY = 0; g.add(p); ps.push(p);
    const calc = box(0.32, 0.05, 0.42, 'navy', 0.02); calc.position.set(0.22, 0.8, 0.32); calc.rotation.x = -0.6; p.add(calc);
  }
  return {
    group: g, cam: { dist: 12, elev: 26, azim: 0, ty: 0.9 },
    update(lt, D, t) { ps.forEach((p, i) => animPerson(p, t, 'worry')); },
    overlay(lt) {
      return ps.filter((_, i) => i % 2 === 0).map((p, i) => ({ kind: 'tag', obj: p, local: [0, 2.6 + 0.1 * Math.sin(lt * 4 + i), 0], text: '？', size: 52, delay: 0.2 + i * 0.12, dark: true, color: '#eb4d4b' }))
        .concat([{ kind: 'title', y: TITLE_Y, html: '全員が自分で計算…？', size: 56, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.6 }]);
    },
  };
};

B.safe3d = () => {
  const g = new THREE.Group(); const sf = safeProp(); sf.scale.setScalar(1.5); g.add(sf);
  const coins = [0, 1, 2, 3].map(() => { const c = coin(0.3); g.add(c); return c; });
  return {
    group: g, cam: { dist: 10, elev: 14, azim: 4, ty: 1.2 },
    update(lt, D, t) {
      const open = lt < D - 1.0 ? eOut((lt - 0.1) / 0.4) : 1 - eOut((lt - (D - 1.0)) / 0.4);
      sf.userData.door.rotation.y = -1.6 * open;
      coins.forEach((c, i) => { const k = clamp((lt - 0.5 - i * 0.3) / 0.6); c.visible = k > 0 && k < 1; c.position.set(lerp(-2.2, 0, k), lerp(3.2, 1.0, k) + Math.sin(k * Math.PI) * 0.8, lerp(1.6, 0.4, k)); c.rotation.set(t * 4, t * 3, 0); });
    },
    overlay(lt, D) {
      return [{ kind: 'title', y: TITLE_Y, html: lt < D - 1.0 ? '給料を払う前に<span style="color:#f2c248">先に確保</span>' : '<span style="color:#f2c248">取りこぼしゼロ</span>', size: 56, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.3 }];
    },
  };
};

B.plaque = (v) => {
  const g = new THREE.Group(); g.add(pedestal(1.3, 0.5));
  const pl = box(2.8, 1.8, 0.2, 'wood', 0.06); pl.position.set(0, 1.6, 0); pl.rotation.x = -0.05; g.add(pl);
  const inner = box(2.5, 1.5, 0.22, new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 }), 0.03); inner.position.set(0, 1.6, 0.01); g.add(inner);
  const p = person({ ...PEOPLE.teacher }); p.position.set(-2.0, 0, 0.6); p.scale.setScalar(0.8); p.userData.baseY = 0; g.add(p);
  return {
    group: g, cam: { dist: 10.5, elev: 8, azim: 8, ty: 1.6 },
    update(lt, D, t) { pl.rotation.y = 0.15 * Math.sin(t * 0.7); inner.rotation.y = pl.rotation.y; animPerson(p, t, 'point'); },
    overlay() {
      return [{ kind: 'tag', obj: inner, local: [0, 0.2, 0.15], text: v.title, size: 110, delay: 0.2, dark: true, color: '#7a4a12' },
        { kind: 'tag', obj: inner, local: [0, -0.45, 0.15], text: v.sub, size: 34, delay: 0.5, dark: true, color: '#5a3a14' }];
    },
  };
};

B.adjust = (v) => {
  const g = new THREE.Group();
  const nA = v.mode === 'extra' ? 9 : 13, nB = v.mode === 'extra' ? 11 : 10;
  const A = coinStack(nA, 0.55); A.position.set(-1.3, 0, 0); g.add(A);
  const Bst = coinStack(nB, 0.55); Bst.position.set(1.3, 0, 0); g.add(Bst);
  const outline = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, nB * 0.105, 32, 1, true), new THREE.MeshStandardMaterial({ color: C.gold, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  outline.position.set(1.3, nB * 0.105 / 2, 0); g.add(outline);
  const p = person({ ...PEOPLE.worker }); p.position.set(0, 0, 1.6); p.scale.setScalar(0.75); p.userData.baseY = 0; g.add(p);
  const flyers = [0, 1, 2].map(() => { const c = coin(0.4); g.add(c); return c; });
  return {
    group: g, cam: { dist: 11, elev: 16, azim: 0, ty: 1.2 },
    update(lt, D, t) {
      A.children.forEach((c, j) => { c.visible = j < Math.ceil(nA * eOut((lt - 0.1) / 0.8)); });
      const diff = Math.abs(nA - nB);
      if (v.mode === 'refund') A.children.forEach((c, j) => { if (j >= nB) c.visible = lt < 1.3; });
      flyers.forEach((c, i) => {
        const k = clamp((lt - 1.3 - i * 0.2) / 0.7); c.visible = v.mode !== 'estimate' && k > 0 && k < 1 && i < diff;
        const from = v.mode === 'refund' ? [-1.3, (nB + i) * 0.105, 0] : [0, 1.8, 1.6]; const to = v.mode === 'refund' ? [0, 1.6, 1.6] : [-1.3, (nA + i) * 0.105, 0];
        c.position.set(lerp(from[0], to[0], k), lerp(from[1], to[1], k) + Math.sin(k * Math.PI) * 1.2, lerp(from[2], to[2], k)); c.rotation.set(t * 5, 0, t * 3);
      });
      animPerson(p, t, v.mode === 'refund' ? (lt > 1.6 ? 'cheer' : 'idle') : (v.mode === 'extra' ? (lt > 1.6 ? 'worry' : 'idle') : 'think'));
    },
    overlay(lt) {
      const items = [callout(A, [0, nA * 0.105 + 0.2, 0], '毎月引いた合計（見込み）', { dx: -30, dy: -240, color: C.blue, delay: 0.3, size: 34 }),
        callout(Bst, [0, nB * 0.105 + 0.2, 0], '本当の1年分', { dx: 40, dy: -160, color: C.gold, delay: 0.6, size: 34 })];
      const t2 = v.mode === 'refund' ? '多かった分が<span style="color:#2ecc71">戻る</span>' : v.mode === 'extra' ? '足りない分を<span style="color:#eb4d4b">追加で引く</span>' : '毎月の額は<span style="color:#f2c248">見込み</span>';
      items.push({ kind: 'title', y: TITLE_Y, html: t2, size: 58, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: v.mode === 'estimate' ? 0.6 : 1.4 });
      return items;
    },
  };
};

B.answer_sheet = (v) => {
  const g = new THREE.Group();
  const paper = box(2.8, 0.05, 3.4, 'paper', 0.02); paper.position.set(0, 0.03, 0); g.add(paper);
  for (let i = 0; i < 6; i++) g.add(at(box(2.1, 0.06, 0.04, new THREE.MeshStandardMaterial({ color: 0xbfc7d6 })), 0.1, 0.06, -1.0 + i * 0.42));
  const pen = cyl(0.06, 0.06, 1.4, 'red', 12); g.add(pen);
  return {
    group: g, cam: { dist: 9, elev: 55, azim: 0, ty: 0.2 },
    update(lt, D, t) { const k = clamp((lt - 0.6) / 0.8); const a = k * Math.PI * 2; pen.position.set(0.3 + Math.cos(a) * 0.9, 0.75, 0.3 + Math.sin(a) * 0.9); pen.rotation.set(0.4, 0, 0.5); pen.visible = k < 1; },
    overlay(lt) {
      const k = clamp((lt - 0.6) / 0.8);
      return [{ kind: 'tag', obj: paper, local: [0, 0.05, -1.45], text: v.title, size: 44, delay: 0.1, dark: true, color: '#1f2937' },
        { kind: 'circlemark', obj: paper, local: [0.3, 0.05, 0.3], r: 170, prog: k, delay: 0.6 },
        { kind: 'title', y: TITLE_Y, html: '1年分の<span style="color:#eb4d4b">答え合わせ</span>', size: 60, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 1.3 }];
    },
  };
};

B.calendar_month = (v) => {
  const g = new THREE.Group(); const cal = calendar(); g.add(cal);
  const p = person({ ...PEOPLE.teacher }); p.scale.setScalar(0.85); p.position.set(-1.9, 0, 0.8); p.userData.baseY = 0; g.add(p);
  return {
    group: g, cam: { dist: 10.5, elev: 10, azim: 10, ty: 1.4 },
    update(lt, D, t) { const prog = clamp((lt - 0.2) / 1.2) * 4; cal.userData.flip.rotation.x = -(prog % 1) * Math.PI * 0.95 * (prog < 4 ? 1 : 0); animPerson(p, t, 'point'); },
    overlay(lt) {
      const m = Math.min(v.month, v.month - 4 + Math.floor(clamp((lt - 0.2) / 1.2) * 4) + 1);
      return [{ kind: 'tag', obj: cal.userData.page, local: [0, 0, 0.1], text: `${m}月`, size: 120, delay: 0, dark: true, color: m === v.month ? '#eb4d4b' : '#111827' },
        { kind: 'title', y: TITLE_Y, html: v.label, size: 58, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 1.0 }];
    },
  };
};

B.documents3d = (v) => {
  const g = new THREE.Group();
  const docs = v.docs.map((d, i) => { const p = box(1.5, 2.0, 0.05, 'paper', 0.03); const n = v.docs.length; p.position.set((i - (n - 1) / 2) * 1.6, 1.3, -Math.abs(i - (n - 1) / 2) * 0.3); p.rotation.y = -(i - (n - 1) / 2) * 0.2; g.add(p);
    for (let j = 0; j < 5; j++) { const l = box(1.1, 0.04, 0.06, new THREE.MeshStandardMaterial({ color: 0xc3cad8 })); l.position.set(0, 0.45 - j * 0.25, 0.01); p.add(l); }
    const band = box(1.5, 0.3, 0.06, i === v.hl ? 'gold' : 'navy', 0.02); band.position.set(0, 0.85, 0.01); p.add(band); return p; });
  const s = person({ ...PEOPLE.worker }); s.scale.setScalar(0.75); s.position.set(0, 0, 1.6); s.userData.baseY = 0; g.add(s);
  return {
    group: g, cam: { dist: 11, elev: 12, azim: 0, ty: 1.3 },
    update(lt, D, t) { docs.forEach((d, i) => { const k = eBack((lt - 0.2 - i * 0.25) / 0.4); d.scale.setScalar(Math.max(0.001, k)); d.position.y = 1.3 + (i === v.hl ? 0.3 + 0.08 * Math.sin(t * 4) : 0); }); animPerson(s, t, 'ok'); },
    overlay() { return docs.map((d, i) => callout(d, [0, 1.0, 0.05], v.docs[i], { dx: 0, dy: -200 - (i % 2) * 90, color: i === v.hl ? C.gold : C.blue, delay: 0.4 + i * 0.25, size: i === v.hl ? 38 : 32 })); },
  };
};

B.wall3d = (v) => {
  const g = new THREE.Group(); const bricks = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) {
    const b = box(0.78, 0.36, 0.5, new THREE.MeshStandardMaterial({ color: (r + c) % 3 ? 0xb5614a : 0xa4553f, roughness: 0.8 }), 0.03);
    b.position.set((c - 2) * 0.82 + (r % 2 ? 0.41 : 0), 0.19 + r * 0.38, 0); b.userData.r = r; g.add(b); bricks.push(b);
  }
  const s = person({ ...PEOPLE.student }); s.scale.setScalar(0.8); s.position.set(-0.8, 0, 1.4); s.userData.baseY = 0; g.add(s);
  return {
    group: g, cam: { dist: 11, elev: 10, azim: 14, ty: 1.6 },
    update(lt, D, t) {
      const rows = lerp(6, 8, eInOut((lt - 0.8) / 0.8));
      bricks.forEach((b) => { b.visible = b.userData.r < rows; b.scale.y = b.userData.r < rows - 1 ? 1 : Math.max(0.001, clamp(rows - b.userData.r)); });
      animPerson(s, t, lt > 1.4 ? 'cheer' : 'idle');
    },
    overlay(lt) {
      const up = lt > 1.0;
      return [{ kind: 'title', y: 640, html: up ? `所得税の壁 <span style="color:#2ecc71">${v.value}</span>` : `所得税の壁 ${v.from_label}`, size: 64, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 0.1 },
        ...(up ? [{ kind: 'title', y: TITLE_Y, html: `${v.from_label} → <span style="color:#2ecc71">${v.value}</span>`, size: 54, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 1.1 }] : [])];
    },
  };
};

B.house_doc = () => {
  const g = new THREE.Group(); const h = house(); h.position.set(-1.2, 0, -0.4); g.add(h);
  const d1 = documentPaper(); d1.scale.setScalar(0.6); d1.position.set(1.4, 0.02, 0.6); g.add(d1);
  const p = person({ ...PEOPLE.worker }); p.scale.setScalar(0.75); p.position.set(0.3, 0, 1.4); p.userData.baseY = 0; g.add(p);
  return {
    group: g, cam: { dist: 11, elev: 20, azim: 0, ty: 1.0 },
    update(lt, D, t) { h.rotation.y = 0.2 * Math.sin(t * 0.6); animPerson(p, t, 'point'); },
    overlay() {
      return [callout(h, [0, 2.0, 0], '住宅ローン控除', { dx: -20, dy: -220, color: C.blue, delay: 0.2, size: 40 }),
        callout(d1, [0, 0.1, 0], '1年目は確定申告', { dx: 30, dy: -260, color: C.down, delay: 0.5, size: 40 }),
        { kind: 'title', y: TITLE_Y, html: '2年目からは<span style="color:#f2c248">年末調整</span>でOK', size: 54, color: '#fff', bg: 'rgba(17,24,39,0.92)', delay: 1.0 }];
    },
  };
};


// ------------------------------------------------------------------ photo scenes (user-supplied images, Ken Burns)
// visual: { type: 'photo', src: 'assets/x.png', mode: 'fit'|'crop', from: {cx,cy,w}, to: {cx,cy,w}, zoom: [1, 1.1],
//           y: 900, patches: [{x,y,w,h,html,style}], tags: [{x,y,text}] }
const IMG = {};
function imgSize(src) {
  if (!IMG[src]) { const im = new Image(); im.src = `/__asset/${src}`; IMG[src] = im; }
  return IMG[src];
}
function photoPose(v, k) {
  const im = imgSize(v.src); const iw = im.naturalWidth || 1000, ih = im.naturalHeight || 1000;
  const cy0 = v.y || 900;
  if ((v.mode || 'crop') === 'fit') {
    const z = lerp((v.zoom || [1, 1.08])[0], (v.zoom || [1, 1.08])[1], k); const s = 1080 / iw * z;
    return { s, tx: 540 - iw / 2 * s, ty: cy0 - ih / 2 * s };
  }
  const a = v.from, b = v.to || v.from;
  const cx = lerp(a.cx, b.cx, k), cy = lerp(a.cy, b.cy, k), w = lerp(a.w, b.w, k); const s = 1080 / w;
  return { s, tx: 540 - cx * s, ty: cy0 - cy * s };
}
function photoLayerHTML(v, k, op) {
  const p = photoPose(v, k);
  const patches = (v.patches || []).map((q) => `<div class="chalk" style="left:${q.x}px;top:${q.y}px;width:${q.w}px;height:${q.h}px;${q.style || ''}">${q.html}</div>`).join('');
  return `<div class="layer" style="opacity:${op}"><img class="pbg" src="/__asset/${v.src}"><div class="pwrap" style="transform:translate(${p.tx}px,${p.ty}px) scale(${p.s})"><img src="/__asset/${v.src}">${patches}</div></div>`;
}
const photoEl = document.getElementById('photo');
function renderPhoto(i, lt, D) {
  const v = spec.scenes[i].visual; let html = '';
  if (i > 0 && lt < 0.4 && spec.scenes[i - 1].visual?.type === 'photo') {
    const ps = tl.scenes[i - 1]; html += photoLayerHTML(spec.scenes[i - 1].visual, 1, 1);
  }
  html += photoLayerHTML(v, eInOut(lt / D), i > 0 ? eOut(lt / 0.4) : 1);
  photoEl.innerHTML = html;
}
B.photo = (v) => ({ group: new THREE.Group(), cam: { dist: 10, elev: 10, azim: 0, ty: 1 }, update() {},
  overlay() { return (v.tags || []).map((tg) => ({ kind: 'title', y: tg.y, html: tg.text, size: tg.size || 48, color: tg.color || '#fff', bg: tg.bg || 'rgba(17,24,39,0.88)', delay: tg.delay ?? 0.3 })); } });

// ------------------------------------------------------------------ diorama theme (miniature town on a desk)
const DIO = { town: null, walkers: [], trucks: [], spots: {} };
function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(repeat[0], repeat[1]); }
  return tx;
}
function std2(o) { return new THREE.MeshStandardMaterial(o); }
function tree(s = 1) {
  const g = new THREE.Group();
  g.add(at(cyl(0.05 * s, 0.07 * s, 0.35 * s, 'wood', 8), 0, 0.17 * s, 0));
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 * s, 1), std2({ color: 0x5fae5a, roughness: 0.8, flatShading: true }));
  leaf.position.y = 0.55 * s; leaf.castShadow = true; g.add(leaf);
  return g;
}
function officeTower(color = 0x8fb3e8, floors = 6) {
  const g = new THREE.Group();
  g.add(at(box(1.3, floors * 0.32, 1.1, std2({ color: 0xf2f4f7, roughness: 0.5 }), 0.03), 0, floors * 0.16, 0));
  for (let f = 0; f < floors; f++) for (let c = 0; c < 3; c++) {
    g.add(at(box(0.28, 0.18, 0.04, std2({ color, roughness: 0.2, metalness: 0.2, emissive: 0x223355, emissiveIntensity: 0.15 })), -0.4 + c * 0.4, 0.2 + f * 0.32, 0.56));
  }
  g.add(at(box(1.36, 0.1, 1.16, std2({ color: 0x3b5ba8 }), 0.02), 0, floors * 0.32 + 0.05, 0));
  return g;
}
function govBuilding(roofColor = 0x2f4f8f) {
  const g = new THREE.Group();
  g.add(at(box(1.9, 0.14, 1.2, 'pedestal', 0.02), 0, 0.07, 0));
  for (let i = 0; i < 4; i++) g.add(at(cyl(0.07, 0.07, 0.8, 'white', 12), -0.66 + i * 0.44, 0.54, 0.42));
  g.add(at(box(1.7, 0.8, 0.7, 'white', 0.02), 0, 0.54, -0.12));
  const s = new THREE.Shape(); s.moveTo(-1.0, 0); s.lineTo(1.0, 0); s.lineTo(0, 0.42); s.lineTo(-1.0, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 1.25, bevelEnabled: false }), std2({ color: roofColor, roughness: 0.5 }));
  roof.position.set(0, 0.94, -0.62); roof.castShadow = true; g.add(roof);
  const pole = cyl(0.02, 0.02, 0.8, 'gray', 6); pole.position.set(0.8, 1.3, 0.4); g.add(pole);
  const flag = box(0.32, 0.2, 0.01, 'white'); flag.position.set(0.97, 1.6, 0.4); g.add(flag);
  const sun = cyl(0.055, 0.055, 0.015, 'red', 16); sun.rotation.x = Math.PI / 2; sun.position.set(0.97, 1.6, 0.41); g.add(sun);
  return g;
}
function schoolBldg() {
  const g = new THREE.Group();
  g.add(at(box(2.6, 1.0, 1.0, std2({ color: 0xf3ead7, roughness: 0.6 }), 0.03), 0, 0.5, 0));
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) g.add(at(box(0.28, 0.24, 0.04, 'window'), -1.05 + c * 0.42, 0.3 + r * 0.42, 0.51));
  g.add(at(box(0.6, 1.5, 0.9, std2({ color: 0xf3ead7, roughness: 0.6 }), 0.03), 0, 0.75, 0.08));
  const clk = cyl(0.17, 0.17, 0.04, 'white', 24); clk.rotation.x = Math.PI / 2; clk.position.set(0, 1.25, 0.54); g.add(clk);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 24), mat('navy')); rim.position.set(0, 1.25, 0.56); g.add(rim);
  return g;
}
function miniHouse(color) {
  const h = house(); h.scale.setScalar(0.42);
  h.traverse((o) => { if (o.isMesh && o.material === mat('roof')) o.material = std2({ color, roughness: 0.5 }); });
  return h;
}
function fountain() {
  const g = new THREE.Group();
  g.add(at(cyl(0.6, 0.65, 0.18, 'pedestal', 32), 0, 0.09, 0));
  const water = cyl(0.52, 0.52, 0.05, std2({ color: 0x7cc4ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }), 32); water.position.y = 0.17; g.add(water);
  g.add(at(cyl(0.08, 0.1, 0.45, 'pedestal', 12), 0, 0.32, 0));
  const jet = cyl(0.03, 0.07, 0.4, std2({ color: 0xbfe4ff, transparent: true, opacity: 0.7 }), 12); jet.position.y = 0.72; g.add(jet);
  g.userData.jet = jet; return g;
}
function truck(color = C.down) {
  const g = new THREE.Group();
  g.add(at(box(0.62, 0.32, 0.36, std2({ color: 0xf5f6f9, roughness: 0.4 }), 0.03), -0.12, 0.27, 0));
  g.add(at(box(0.3, 0.3, 0.36, std2({ color, roughness: 0.4 }), 0.04), 0.36, 0.26, 0));
  g.add(at(box(0.04, 0.14, 0.3, 'window'), 0.52, 0.32, 0));
  for (const x of [-0.28, 0.32]) for (const z of [-0.19, 0.19]) { const w = cyl(0.08, 0.08, 0.06, 'black', 14); w.rotation.x = Math.PI / 2; w.position.set(x, 0.09, z); g.add(w); }
  const load = new THREE.Group(); load.position.set(-0.12, 0.45, 0); g.add(load);
  for (let i = 0; i < 3; i++) { const c = coin(0.11); c.position.set(-0.15 + i * 0.15, 0.02, 0); load.add(c); }
  g.userData.load = load; return g;
}
function miniPerson(body, phase = 0) { const p = person({ body, hair: 0x2a1c14, phase }); p.scale.setScalar(0.28); p.userData.baseY = 0.5; return p; }
function signpost(w = 1.6) {
  const g = new THREE.Group();
  for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) g.add(at(cyl(0.04, 0.04, 1.2, 'wood', 8), x, 0.6, 0));
  const b = box(w, 0.6, 0.06, std2({ color: 0xf7f1e3, roughness: 0.8 }), 0.03); b.position.y = 1.15; g.add(b);
  const fr = box(w + 0.08, 0.68, 0.04, 'wood', 0.03); fr.position.set(0, 1.15, -0.03); g.add(fr);
  g.userData.board = b; return g;
}
function balanceScale() {
  const g = new THREE.Group();
  g.add(at(cyl(0.35, 0.4, 0.1, 'goldDeep', 24), 0, 0.05, 0));
  g.add(at(cyl(0.05, 0.05, 1.3, 'gold', 12), 0, 0.7, 0));
  const beam = new THREE.Group(); beam.position.y = 1.35; g.add(beam);
  const bar = box(1.9, 0.06, 0.08, 'gold'); beam.add(bar);
  const pans = [-0.9, 0.9].map((x) => {
    const pg = new THREE.Group(); pg.position.x = x; beam.add(pg);
    pg.add(at(cyl(0.012, 0.012, 0.5, 'gold', 6), 0, -0.25, 0));
    const pan = cyl(0.32, 0.25, 0.05, 'gold', 28); pan.position.y = -0.52; pg.add(pan);
    const cs = coinStack(x < 0 ? 5 : 4, 0.16); cs.position.y = -0.49; pg.add(cs); return pg;
  });
  g.userData = { beam, pans }; return g;
}
function piggy() {
  const g = new THREE.Group(); const pink = std2({ color: 0xf6a9c0, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 20), pink); body.scale.set(1.25, 1, 1); body.position.y = 0.95; body.castShadow = true; g.add(body);
  const snout = cyl(0.3, 0.3, 0.18, pink, 24); snout.rotation.z = Math.PI / 2; snout.position.set(1.15, 0.95, 0); g.add(snout);
  for (const z of [-0.1, 0.1]) g.add(at(sph(0.05, 'black', 10), 1.25, 0.95, z));
  for (const z of [-0.45, 0.45]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 12), pink); e.position.set(0.55, 1.75, z); g.add(e); }
  for (const x of [-0.6, 0.6]) for (const z of [-0.45, 0.45]) g.add(at(cyl(0.16, 0.16, 0.35, pink, 12), x, 0.17, z));
  for (const z of [-0.3, 0.3]) g.add(at(sph(0.07, 'black', 10), 0.85, 1.25, z));
  g.add(at(box(0.5, 0.05, 0.08, 'black'), -0.1, 1.86, 0));
  return g;
}
function bookProp(color) { return box(0.32, 0.08, 0.44, std2({ color, roughness: 0.6 }), 0.02); }

function buildDiorama() {
  const g = new THREE.Group();
  // desk
  const wood = canvasTex(1024, 1024, (c, w, h) => {
    c.fillStyle = '#b98a5c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { c.strokeStyle = `rgba(${90 + Math.random() * 40},${55 + Math.random() * 25},30,${0.08 + Math.random() * 0.12})`; c.lineWidth = 1 + Math.random() * 3; c.beginPath(); const y = Math.random() * h; c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + 10 - Math.random() * 20, w * 0.7, y - 10 + Math.random() * 20, w, y + Math.random() * 6); c.stroke(); }
  }, [4, 4]);
  floor.material = std2({ map: wood, roughness: 0.6 });
  // base
  g.add(at(box(14.4, 0.5, 10.4, std2({ color: 0x6b4a2f, roughness: 0.7 }), 0.06), 0, 0.25, 0));
  const grass = canvasTex(1024, 768, (c, w, h) => {
    c.fillStyle = '#86c06c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${60 + Math.random() * 60},${120 + Math.random() * 60},${50 + Math.random() * 30},0.35)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), std2({ map: grass, roughness: 0.95 })); top.rotation.x = -Math.PI / 2; top.position.y = 0.505; top.receiveShadow = true; g.add(top);
  const road = (x, z, w, d) => { const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std2({ color: 0x5d636e, roughness: 0.9 })); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.51, z); r.receiveShadow = true; g.add(r); };
  road(0, 0.4, 14, 1.1); road(-0.6, -2.55, 1.1, 4.8);
  for (let x = -6.6; x < 6.8; x += 0.7) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.06), std2({ color: 0xf5f5f5 })); d.rotation.x = -Math.PI / 2; d.position.set(x, 0.515, 0.4); g.add(d); }
  const walk = (x, z, w, d) => { const r = box(w, 0.04, d, std2({ color: 0xd9d4c7, roughness: 0.9 })); r.position.set(x, 0.52, z); g.add(r); };
  walk(0, -0.32, 14, 0.3); walk(0, 1.12, 14, 0.3);
  // buildings
  const company = officeTower(); company.position.set(-3.4, 0.5, -2.6); g.add(company);
  const company2 = officeTower(0x9ad1c8, 4); company2.position.set(-5.4, 0.5, -2.4); company2.scale.setScalar(0.9); g.add(company2);
  const taxOffice = govBuilding(); taxOffice.position.set(3.6, 0.5, -2.5); g.add(taxOffice);
  const insOffice = govBuilding(0x2bb3a3); insOffice.position.set(6.0, 0.5, -2.7); insOffice.scale.setScalar(0.75); g.add(insOffice);
  const school = schoolBldg(); school.position.set(1.3, 0.5, -3.6); g.add(school);
  const townHall = govBuilding(0x8a5a2b); townHall.position.set(4.8, 0.5, 2.8); g.add(townHall);
  const houses = [0xd9534f, 0x3b82c4, 0xe0a23b, 0x6aa84f].map((c, i) => { const h = miniHouse(c); h.position.set(-5.8 + i * 1.25, 0.5, 2.6 + (i % 2) * 0.6); h.rotation.y = (i % 2 ? -0.2 : 0.15); g.add(h); return h; });
  const ftn = fountain(); ftn.position.set(1.4, 0.5, 2.9); g.add(ftn);
  // trees
  const tp = [[-6.5, -4.4], [-1.8, -4.3], [-1.6, -1.4], [0.2, -1.4], [2.6, -1.3], [5.0, -4.3], [6.5, -1.3], [-6.6, 4.4], [-2.2, 4.2], [0.3, 2.3], [2.5, 2.2], [0.6, 4.3], [2.6, 4.2], [6.5, 4.4], [3.4, 4.5], [-6.6, -1.3]];
  tp.forEach(([x, z], i) => { const t = tree(0.8 + (i % 3) * 0.15); t.position.set(x, 0.5, z); g.add(t); });
  // ambient life
  const bodies = ['blue', 'teal', 'red', 'pink', 'purple', 'navy', 'blue', 'red', 'teal', 'pink'];
  DIO.walkers = bodies.map((b, i) => { const p = miniPerson(b, i * 0.7); g.add(p); return { p, lane: i % 2 ? -0.32 : 1.12, speed: 0.25 + (i % 4) * 0.06, off: i * 1.4, dir: i % 3 ? 1 : -1 }; });
  DIO.trucks = [C.down, C.blue].map((c, i) => { const tk = truck(c); g.add(tk); return { tk, z: i ? 0.65 : 0.15, speed: 0.9 + i * 0.3, off: i * 6, dir: i ? -1 : 1 }; });
  DIO.spots = { company, taxOffice, insOffice, school, townHall, houses, ftn, front: new THREE.Vector3(0, 0, 6.6) };
  DIO.town = g;
  return g;
}
function animTown(t) {
  DIO.walkers.forEach((w) => {
    const L = 13; const s = ((t * w.speed + w.off) % L + L) % L; const x = w.dir > 0 ? -6.5 + s : 6.5 - s;
    w.p.position.set(x, 0.54, w.lane); w.p.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    w.p.userData.baseY = 0.54; animPerson(w.p, t * 1.5, 'idle'); w.p.position.y += Math.abs(Math.sin(t * 6 + w.off)) * 0.03;
  });
  DIO.trucks.forEach((d) => { const L = 15; const s = ((t * d.speed + d.off) % L + L) % L; d.tk.position.set(d.dir > 0 ? -7 + s : 7 - s, 0.52, d.z); d.tk.rotation.y = d.dir > 0 ? 0 : Math.PI; });
  if (DIO.spots.ftn) DIO.spots.ftn.userData.jet.scale.y = 1 + 0.15 * Math.sin(t * 7);
}
const worldPos = (o, dy = 0) => { const v = new THREE.Vector3(); o.getWorldPosition(v); v.y += dy; return v; };
function anchor(g, v) { const a = new THREE.Object3D(); a.position.copy(v); g.add(a); return a; }
const telopTitle = (html, y = TITLE_Y, size = 56, delay = 0.3) => ({ kind: 'title', y, html, size, color: '#fff', bg: 'rgba(43,30,18,0.88)', delay });

B.dio = (v, sc) => {
  const g = new THREE.Group(); const S = DIO.spots; const act = v.act;
  let cam = { dist: 7, elev: 38, azim: 0, ty: 0.6, tx: 0, tz: 0 };
  let upd = () => {}; let ov = () => [];
  const focus = (o, d = 6.5, el = 38, az = 0, dy = 0.4) => { const p = worldPos(o); cam = { dist: d, elev: el, azim: az, ty: p.y + dy, tx: p.x, tz: p.z }; };
  const coinsFly = (n, from, to, opts = {}) => {
    const cs = [...Array(n)].map(() => { const c = coin(opts.r || 0.14); g.add(c); return c; });
    return (lt, t) => cs.forEach((c, i) => { const ph = ((lt - (opts.delay || 0.3)) * (opts.speed || 0.6) + i / n) % 1; c.visible = lt > (opts.delay || 0.3);
      c.position.set(lerp(from.x, to.x, ph), lerp(from.y, to.y, ph) + Math.sin(ph * Math.PI) * (opts.arc || 1.5), lerp(from.z, to.z, ph)); c.rotation.set(t * 5 + i, t * 3, 0); });
  };
  if (act === 'payslip' || act === 'deduct') {
    const paper = box(2.6, 0.03, 3.2, 'paper', 0.02); paper.position.set(0, 0.02, 6.7); paper.rotation.y = 0.08; g.add(paper);
    const rows = ['給与', '所得税', '住民税', '社会保険料'];
    const rowA = rows.map((r, i) => { const bar = box(2.0, 0.035, 0.05, std2({ color: 0xd0d6e2 })); bar.position.set(0, 0.03, -0.8 + i * 0.6); paper.add(bar); return anchor(paper, new THREE.Vector3(-0.45, 0.05, -1.0 + i * 0.6)); });
    const head = box(2.6, 0.04, 0.4, 'navy'); head.position.set(0, 0.02, -1.4); paper.add(head);
    const p = miniPerson('blue'); p.scale.setScalar(0.5); p.position.set(0.8, 0.05, 7.6); p.rotation.y = -0.4; g.add(p);
    if (act === 'payslip') {
      focus(paper, 5.2, 50, 0, 0.2);
      const f = coinsFly(4, new THREE.Vector3(0.6, 0.2, 6.6), new THREE.Vector3(1.6, 0.05, 5.6), { arc: 0.6, speed: 0.5 });
      upd = (lt, D, t) => { f(lt, t); animPerson(p, t, 'surprise'); };
      ov = () => [{ kind: 'tag', obj: head, local: [0, 0.05, 0], text: '給与明細', size: 34, dark: true, color: '#ffe28c' },
        ...rowA.map((a, i) => ({ kind: 'tag', obj: a, local: [0, 0, 0], text: `<span style="color:#1f2937">${rows[i]}</span> <span style="color:${i ? '#dc2626' : '#16a34a'}">${i ? '−' : '＋'}</span>`, size: 36, delay: 0.1 + i * 0.12, dark: true, color: '#1f2937' }))];
    } else {
      cam = { dist: 11, elev: 40, azim: 0, ty: 0.6, tx: 0.8, tz: 2.4 };
      const f1 = coinsFly(5, new THREE.Vector3(0, 0.3, 6.6), worldPos(S.taxOffice, 0.8), { arc: 2.2, speed: 0.45 });
      const f2 = coinsFly(5, new THREE.Vector3(0.3, 0.3, 6.6), worldPos(S.insOffice, 0.8), { arc: 2.6, speed: 0.4, delay: 0.6 });
      upd = (lt, D, t) => { f1(lt, t); f2(lt, t); animPerson(p, t, 'worry'); };
      ov = () => [callout(S.taxOffice, [0, 1.6, 0], '税金 → 税務署', { dx: -60, dy: -170, color: C.down, delay: 0.5, size: 38 }),
        callout(S.insOffice, [0, 1.6, 0], '社会保険料', { dx: 0, dy: -260, color: C.teal, delay: 0.8, size: 38 })];
    }
  } else if (act === 'juminzei') {
    focus(S.townHall, 6.5, 32, -10, 0.6);
    const sg = signpost(1.4); sg.position.set(5.9, 0.5, 3.6); sg.scale.setScalar(0.8); g.add(sg);
    ov = () => [callout(S.townHall, [0, 1.5, 0], '市区町村（住民税）', { dx: 40, dy: -220, color: C.wood, delay: 0.3, size: 38 }),
      { kind: 'tag', obj: sg.userData.board, local: [0, 0, 0.06], text: '翌年6月〜', size: 40, dark: true, color: '#7a4a12', delay: 0.5 }];
  } else if (act === 'alone') {
    const p = miniPerson('pink'); p.scale.setScalar(0.4); p.position.set(-0.6, 0.52, 1.6); g.add(p);
    focus(p, 5.5, 34, 10, 0.3);
    upd = (lt, D, t) => { p.userData.baseY = 0.52; animPerson(p, t, 'think'); };
    ov = () => [{ kind: 'tag', obj: p, local: [0, 2.6, 0], text: '？', size: 80, delay: 0.3, dark: true, color: '#eb4d4b' }, telopTitle('誰も教えてくれない…', TITLE_Y, 54, 0.6)];
  } else if (act === 'school' || act === 'title' || act === 'end') {
    focus(S.school, act === 'title' ? 8 : 6.5, 30, act === 'end' ? 12 : -8, 0.7);
    const kids = [0, 1, 2].map((i) => { const k = miniPerson(['blue', 'pink', 'teal'][i], i); k.scale.setScalar(0.32); k.position.set(0.6 + i * 0.5, 0.52, -2.6); g.add(k); return k; });
    upd = (lt, D, t) => kids.forEach((k) => { k.userData.baseY = 0.52; animPerson(k, t, act === 'end' ? 'wave' : 'cheer'); });
    if (act === 'title') ov = () => [{ kind: 'bigtitle', y: 1060, series: spec.series, title: v.title || spec.episode, delay: 0.1 }];
    else if (act === 'school') ov = () => [callout(S.school, [0, 1.7, 0], 'お金の授業', { dx: 0, dy: -220, color: C.gold, delay: 0.4, size: 44 })];
    else ov = () => [telopTitle('今日の授業はここまで', TITLE_Y, 56, 0.4)];
  } else if (act === 'define') {
    const base = new THREE.Vector3(-2.6, 0.5, 2.0);
    const stacks = [4, 7, 11].map((n, i) => { const cs = new THREE.Group(); for (let j = 0; j < n; j++) { const c = coin(0.2); c.position.y = 0.04 + j * 0.105; if (j >= n - Math.ceil(n * (0.1 + i * 0.08))) c.children[0].material = mat('red'); cs.add(c); } cs.position.set(base.x + i * 0.9, 0.5, base.z); g.add(cs); return cs; });
    const fig = stacks.map((cs, i) => { const p = miniPerson(['blue', 'teal', 'purple'][i]); p.scale.setScalar(0.36); p.position.set(cs.position.x, 0.52, base.z + 0.6); g.add(p); return p; });
    cam = { dist: 6, elev: 26, azim: 0, ty: 0.9, tx: -1.7, tz: 2.0 };
    upd = (lt, D, t) => { stacks.forEach((cs, i) => cs.children.forEach((c, j) => { c.visible = j < Math.ceil(cs.children.length * eOut((lt - 0.1 - i * 0.2) / 0.8)); })); fig.forEach((p) => { p.userData.baseY = 0.52; animPerson(p, t, 'idle'); }); };
    ov = () => [callout(stacks[2], [0, 1.25, 0], '赤い部分が所得税', { dx: 40, dy: -200, color: C.down, delay: 1.0, size: 38 }), telopTitle('所得が多いほど 税金も多い', TITLE_Y, 50, 0.6)];
  } else if (act === 'selfcalc') {
    const h = S.houses[1]; const p = miniPerson('blue'); p.scale.setScalar(0.4); const hp = worldPos(h); p.position.set(hp.x + 0.6, 0.52, hp.z + 0.9); g.add(p);
    const desk = box(0.5, 0.04, 0.3, 'desk'); desk.position.set(hp.x + 0.6, 0.78, hp.z + 1.15); g.add(desk);
    const calc = box(0.14, 0.03, 0.18, 'navy'); calc.position.set(hp.x + 0.5, 0.81, hp.z + 1.15); g.add(calc);
    focus(p, 5, 30, 14, 0.4);
    upd = (lt, D, t) => { p.userData.baseY = 0.52; animPerson(p, t, 'think'); };
    ov = () => [telopTitle('本来は<span style="color:#ffd84a">自分で計算</span>して申告', TITLE_Y, 50, 0.4), { kind: 'tag', obj: p, local: [0, 2.7, 0], text: '？', size: 60, delay: 0.6, dark: true, color: '#eb4d4b' }];
  } else if (act === 'commuters') {
    focus(S.company, 7.5, 30, 0, 0.6); cam.tz += 1.2;
    const ps = [...Array(8)].map((_, i) => { const p = miniPerson(['blue', 'navy', 'teal', 'red'][i % 4], i); p.scale.setScalar(0.3); g.add(p); return p; });
    upd = (lt, D, t) => ps.forEach((p, i) => { const k = ((lt * 0.25 + i / 8) % 1); const sp = worldPos(S.company); p.position.set(sp.x - 1.2 + (i % 4) * 0.5, 0.52, lerp(1.0, sp.z + 0.8, k)); p.rotation.y = Math.PI; p.userData.baseY = 0.52; animPerson(p, t * 1.4, 'idle'); });
    ov = () => [callout(S.company, [0, 2.2, 0], '会社員がたくさん', { dx: 30, dy: -200, color: C.blue, delay: 0.4, size: 40 })];
  } else if (act === 'truck' || act === 'refund' || act === 'extra') {
    const tk = truck(act === 'refund' ? C.up : (act === 'extra' ? C.down : C.gold)); g.add(tk);
    const a = act === 'refund' ? worldPos(S.taxOffice) : (act === 'extra' ? worldPos(S.houses[2]) : worldPos(S.company));
    const b = act === 'refund' ? worldPos(S.houses[2]) : worldPos(S.taxOffice);
    cam = { dist: 11, elev: 36, azim: 0, ty: 0.7, tx: (a.x + b.x) / 2, tz: 0.6 };
    upd = (lt, D, t) => { const k = clamp((lt - 0.3) / (D - 0.9)); const x = lerp(a.x, b.x, eInOut(k)); tk.position.set(x, 0.53, 0.15); tk.rotation.y = b.x > a.x ? 0 : Math.PI; tk.userData.load.visible = true; };
    const lbl = act === 'truck' ? ['会社', '税務署', '給料から先に引いて納める'] : act === 'refund' ? ['税務署（会社経由）', 'あなた', '取りすぎた分が戻る'] : ['あなた', '税務署（会社経由）', '足りない分を追加で納める'];
    ov = () => [callout(anchor(g, a), [0, 1.8, 0], lbl[0], { dx: 0, dy: -200, color: C.blue, delay: 0.2, size: 36 }),
      callout(anchor(g, b), [0, 1.8, 0], lbl[1], { dx: 0, dy: -240, color: C.down, delay: 0.4, size: 36 }),
      telopTitle(act === 'refund' ? `<span style="color:#7dff9a">${lbl[2]}</span>` : act === 'extra' ? `<span style="color:#ff8a8a">${lbl[2]}</span>` : lbl[2], TITLE_Y, 50, 0.6)];
  } else if (act === 'safe') {
    const sf = safeProp(); sf.scale.setScalar(0.55); const tp = worldPos(S.taxOffice); sf.position.set(tp.x - 1.4, 0.5, tp.z + 1.0); g.add(sf);
    focus(sf, 4.8, 28, -12, 0.3);
    const f = coinsFly(4, new THREE.Vector3(sf.position.x - 1.6, 1.8, sf.position.z + 0.6), new THREE.Vector3(sf.position.x, 0.9, sf.position.z + 0.2), { arc: 0.6, speed: 0.6 });
    upd = (lt, D, t) => { f(lt, t); sf.userData.door.rotation.y = -1.4 * Math.abs(Math.sin(t * 1.3)); };
    ov = () => [telopTitle('取りこぼしゼロ', TITLE_Y, 56, 0.4)];
  } else if (act === 'relax') {
    const ps = [0, 1, 2, 3].map((i) => { const p = miniPerson(['pink', 'blue', 'teal', 'red'][i], i); p.scale.setScalar(0.34); const fp = worldPos(S.ftn); p.position.set(fp.x - 0.9 + i * 0.6, 0.52, fp.z - 0.9); g.add(p); return p; });
    focus(S.ftn, 5.5, 28, -6, 0.5);
    upd = (lt, D, t) => ps.forEach((p) => { p.userData.baseY = 0.52; animPerson(p, t, 'cheer'); });
    ov = () => [telopTitle('計算は会社にお任せ', TITLE_Y, 54, 0.4)];
  } else if (act === 'sign') {
    const sg = signpost(2.2); sg.position.set(-0.6 + 1.6, 0.5, 1.6); g.add(sg);
    focus(sg, 5.2, 18, 0, 0.9);
    upd = (lt) => { sg.scale.setScalar(Math.max(0.001, eBack((lt - 0.1) / 0.5))); };
    ov = () => [{ kind: 'tag', obj: sg.userData.board, local: [0, 0, 0.06], text: v.label, size: 92, dark: true, color: '#3b2a1a', delay: 0.4 }];
  } else if (act === 'spring') {
    focus(S.ftn, 4.6, 26, 8, 0.6);
    const cs = [...Array(6)].map(() => { const c = coin(0.12); g.add(c); return c; });
    const fp = worldPos(S.ftn); const p = miniPerson('navy'); p.scale.setScalar(0.38); p.position.set(fp.x + 0.9, 0.52, fp.z + 0.3); g.add(p);
    upd = (lt, D, t) => { cs.forEach((c, i) => { const ph = (t * 0.7 + i / 6) % 1; const ang = i * 1.05; c.position.set(fp.x + Math.cos(ang) * ph * 0.7, fp.y + 0.9 + Math.sin(ph * Math.PI) * 1.0, fp.z + Math.sin(ang) * ph * 0.7); c.rotation.set(t * 4, i, 0); }); p.userData.baseY = 0.52; animPerson(p, t, 'point'); };
    ov = () => [callout(S.ftn, [0, 1.6, 0], '源泉＝お金が湧く「出どころ」', { dx: -20, dy: -250, color: C.blue, delay: 0.4, size: 38 }), telopTitle('出どころで先に集める', TITLE_Y, 52, 0.8)];
  } else if (act === 'estimate' || act === 'estimate2') {
    const cp = worldPos(S.company); const stacks = [...Array(12)].map((_, i) => { const cs = coinStack(3 + (i * 7) % 4, 0.13); cs.position.set(cp.x - 1.4 + (i % 6) * 0.42, 0.5, cp.z + 1.4 + Math.floor(i / 6) * 0.45); g.add(cs); return cs; });
    cam = { dist: 5.2, elev: 34, azim: 6, ty: 0.8, tx: cp.x - 0.35, tz: cp.z + 1.6 };
    upd = (lt) => stacks.forEach((cs, i) => { cs.scale.setScalar(Math.max(0.001, eBack((lt - 0.1 - i * 0.05) / 0.4))); });
    ov = () => act === 'estimate' ? [telopTitle('毎月の額は<span style="color:#ffd84a">見込み</span>', TITLE_Y, 54, 0.4)]
      : [callout(stacks[0], [0, 0.6, 0], '1月', { dx: -40, dy: -160, color: C.blue, delay: 0.3, size: 32 }), callout(stacks[11], [0, 0.6, 0], '12月', { dx: 40, dy: -160, color: C.blue, delay: 0.5, size: 32 }), telopTitle('1年分を予想して概算', TITLE_Y, 52, 0.6)];
  } else if (act === 'scale' || act === 'recalc') {
    const bs = balanceScale(); bs.position.set(-0.6 + 1.9, 0.5, 2.2); bs.scale.setScalar(0.85); g.add(bs);
    focus(bs, 4.8, 18, 0, 0.8);
    let calcP = null;
    if (act === 'recalc') { calcP = miniPerson('blue'); calcP.scale.setScalar(0.42); calcP.position.set(bs.position.x - 1.3, 0.52, bs.position.z + 0.4); g.add(calcP); }
    upd = (lt, D, t) => { const tilt = act === 'scale' ? 0.22 + 0.04 * Math.sin(t * 2) : lerp(0.22, 0, eInOut((lt - 0.5) / 1.2)); bs.userData.beam.rotation.z = tilt; bs.userData.pans.forEach((p) => { p.rotation.z = -tilt; }); if (calcP) { calcP.userData.baseY = 0.52; animPerson(calcP, t, 'point'); } };
    ov = () => act === 'scale' ? [callout(bs.userData.pans[0], [0, -0.3, 0], '見込み', { dx: -60, dy: -120, color: C.blue, delay: 0.3, size: 36 }), callout(bs.userData.pans[1], [0, -0.3, 0], '正しい1年分', { dx: 60, dy: -160, color: C.gold, delay: 0.5, size: 36 }), telopTitle('12月にズレを発見', TITLE_Y, 54, 0.6)]
      : [telopTitle('1年分をピッタリ計算', TITLE_Y, 54, 0.6)];
  } else if (act === 'insurance') {
    const h1 = S.houses[0], h2 = S.houses[2]; const u = umbrella(); u.scale.setScalar(0.35); const p1 = worldPos(h1); u.position.set(p1.x, 0.6, p1.z); g.add(u);
    cam = { dist: 6.5, elev: 30, azim: 0, ty: 0.7, tx: -4.5, tz: 2.8 };
    upd = (lt, D, t) => { h2.rotation.z = 0.06 * Math.sin(t * 18) * (lt > 0.8 && lt < 2.6 ? 1 : 0); };
    ov = () => [callout(h1, [0, 2.2, 0], '生命保険料', { dx: -20, dy: -220, color: C.down, delay: 0.3, size: 38 }), callout(h2, [0, 2.2, 0], '地震保険料', { dx: 30, dy: -170, color: C.blue, delay: 0.6, size: 38 }), telopTitle('保険料の控除もここで', TITLE_Y, 52, 0.8)];
  } else if (act === 'forget') {
    const hp = worldPos(S.houses[3]); const p = miniPerson('red'); p.scale.setScalar(0.4); p.position.set(hp.x + 0.8, 0.52, hp.z + 0.9); g.add(p);
    const papers = [...Array(5)].map(() => { const q = box(0.22, 0.01, 0.3, 'paper'); g.add(q); return q; });
    focus(p, 5.2, 26, 10, 0.5);
    upd = (lt, D, t) => { papers.forEach((q, i) => { const k = clamp((lt - 0.3 - i * 0.18) / 1.6); q.position.set(p.position.x + k * 2.6 + i * 0.1, 0.9 + Math.sin(k * 6 + i) * 0.3 + k * 1.2, p.position.z - k * 0.8); q.rotation.set(t * 3 + i, t * 2, t + i); }); p.userData.baseY = 0.52; animPerson(p, t, 'worry'); };
    ov = () => [telopTitle('書類の<span style="color:#ff8a8a">出し忘れ</span>に注意', TITLE_Y, 54, 0.5)];
  } else if (act === 'savings') {
    const pg = piggy(); pg.scale.setScalar(0.9); pg.position.set(0, 0, 6.8); pg.rotation.y = -0.5; g.add(pg);
    const books = [0xd9534f, 0x3b82c4, 0x6aa84f, 0xe0a23b].map((c) => { const b = bookProp(c); g.add(b); return b; });
    focus(pg, 6, 22, 0, 0.8);
    upd = (lt, D, t) => books.forEach((b, i) => { const k = clamp((lt - 0.3 - i * 0.4) / 0.7); b.visible = k < 1; b.position.set(-0.1, lerp(3.4, 1.7, k * k), 6.8); b.rotation.set(0, t * 2 + i, k * 1.5); });
    ov = () => [telopTitle('知識を<span style="color:#ffd84a">貯金</span>しよう', TITLE_Y, 56, 0.4)];
  } else if (act === 'next') {
    cam = { dist: 15, elev: 40, azim: -20, ty: 0.6, tx: 0, tz: 0.4 };
    ov = () => [{ kind: 'bigtitle', y: 1100, series: spec.series, title: '次回もお楽しみに', delay: 0.3, small: true }];
  }
  return { group: g, cam, update: (lt, D, t) => { upd(lt, D, t); }, overlay: (lt, D, t) => ov(lt, D, t) };
};

// ------------------------------------------------------------------ voxel (block-style) theme — original textures & characters
const VX = { world: null, meshes: [], snowMesh: null, snowPts: null, clouds: [], walkers: [], spots: {}, plants: null };
const VB = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, LOG: 4, LEAVES: 5, PLANKS: 6, BRICK: 7, WHITE: 8, GLASS: 9, PATH: 10, WATER: 11, ROOFB: 12, ROOFR: 13, GOLD: 14, SAND: 15, SBRICK: 16, ROOFG: 17 };
const VSIZE = { x: 80, y: 30, z: 64 }; const VOFF = { x: 40, z: 32 };
const ATL = { n: 8, px: 16 };
function vRand(i) { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
function makeAtlas() {
  const cv = document.createElement('canvas'); cv.width = ATL.n * ATL.px; cv.height = ATL.n * ATL.px; const c = cv.getContext('2d');
  const tile = (idx, fn) => { const ox = (idx % ATL.n) * ATL.px, oy = Math.floor(idx / ATL.n) * ATL.px; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { c.fillStyle = fn(x, y, vRand(idx * 997 + y * 16 + x)); c.fillRect(ox + x, oy + y, 1, 1); } };
  const sh = (r, g, b, k) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
  tile(0, (x, y, r) => sh(108, 176, 74, 0.86 + r * 0.22));                                                  // grass top
  tile(1, (x, y, r) => (y < 3 + (vRand(x * 7) > 0.5 ? 1 : 0) ? sh(108, 176, 74, 0.85 + r * 0.2) : sh(134, 96, 67, 0.8 + r * 0.3)));   // grass side
  tile(2, (x, y, r) => sh(134, 96, 67, 0.78 + r * 0.32));                                                   // dirt
  tile(3, (x, y, r) => sh(128, 128, 132, 0.8 + r * 0.28));                                                  // stone
  tile(4, (x, y, r) => sh(112, 82, 50, (x % 4 === 0 ? 0.75 : 0.95) + r * 0.12));                            // log side
  tile(5, (x, y, r) => (r > 0.22 ? sh(64, 140, 56, 0.7 + r * 0.4) : 'rgba(0,0,0,0)'));                      // leaves
  tile(6, (x, y, r) => sh(186, 146, 96, ((y % 4 === 3) ? 0.72 : 0.95) + r * 0.1));                          // planks
  tile(7, (x, y, r) => ((y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 7) ? sh(200, 190, 175, 1) : sh(170, 82, 66, 0.88 + r * 0.18)));  // brick
  tile(8, (x, y, r) => sh(236, 232, 222, 0.94 + r * 0.06));                                                 // white (plaster)
  tile(9, (x, y, r) => ((x === 0 || y === 0 || x === 15 || y === 15) ? 'rgb(230,240,248)' : (x + y === 10 || x + y === 12 ? 'rgba(255,255,255,0.6)' : 'rgba(170,215,240,0.35)')));  // glass
  tile(10, (x, y, r) => sh(196, 168, 118, 0.82 + r * 0.26));                                                // path
  tile(11, (x, y, r) => sh(64, 128, 220, 0.85 + r * 0.2));                                                  // water
  tile(12, (x, y, r) => sh(58, 96, 176, (y % 4 === 0 ? 0.75 : 0.95) + r * 0.08));                           // roof blue
  tile(13, (x, y, r) => sh(176, 66, 52, (y % 4 === 0 ? 0.75 : 0.95) + r * 0.08));                           // roof red
  tile(14, (x, y, r) => sh(242, 194, 72, ((x === 0 || y === 0) ? 1.12 : (x === 15 || y === 15) ? 0.75 : 0.95) + r * 0.06));   // gold
  tile(15, (x, y, r) => sh(222, 208, 160, 0.9 + r * 0.14));                                                 // sand
  tile(16, (x, y, r) => ((y % 8 === 7 || (x + (Math.floor(y / 8) % 2) * 8) % 16 === 15) ? sh(90, 90, 96, 1) : sh(150, 150, 156, 0.88 + r * 0.16)));  // stone brick
  tile(17, (x, y, r) => sh(70, 140, 92, (y % 4 === 0 ? 0.75 : 0.95) + r * 0.08));                           // roof green
  tile(18, (x, y, r) => sh(150, 112, 70, 0.8 + 0.2 * Math.abs(Math.sin(Math.hypot(x - 7.5, y - 7.5) * 1.3))));   // log top
  tile(19, (x, y, r) => sh(245, 248, 252, 0.94 + r * 0.06));                                                // snow
  // tall grass (cross plant) & flowers
  tile(20, (x, y, r) => { const blade = (x % 3 === (y % 5 === 0 ? 1 : 0)) && y > 3 + (x * 7) % 6; return blade ? sh(90, 160, 64, 0.8 + r * 0.3) : 'rgba(0,0,0,0)'; });
  tile(21, (x, y, r) => { if (x === 7 && y > 7) return sh(70, 140, 56, 1); if (Math.hypot(x - 7, y - 5) < 3) return Math.hypot(x - 7, y - 5) < 1.2 ? '#ffd23f' : '#f6f0d0'; return 'rgba(0,0,0,0)'; });
  const tx = new THREE.CanvasTexture(cv); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
const FACE_TEX = {   // [top, side, bottom]
  1: [0, 1, 2], 2: [2, 2, 2], 3: [3, 3, 3], 4: [18, 4, 18], 5: [5, 5, 5], 6: [6, 6, 6], 7: [7, 7, 7], 8: [8, 8, 8], 9: [9, 9, 9], 10: [10, 10, 2],
  11: [11, 11, 11], 12: [12, 12, 12], 13: [13, 13, 13], 14: [14, 14, 14], 15: [15, 15, 15], 16: [16, 16, 16], 17: [17, 17, 17],
};
const vIdx = (x, y, z) => ((x + VOFF.x) + VSIZE.x * (y + VSIZE.y * (z + VOFF.z)));
function vGet(x, y, z) { if (x < -VOFF.x || x >= VSIZE.x - VOFF.x || z < -VOFF.z || z >= VSIZE.z - VOFF.z || y < 0 || y >= VSIZE.y) return 0; return VX.world[vIdx(x, y, z)]; }
function vSet(x, y, z, b) { if (x < -VOFF.x || x >= VSIZE.x - VOFF.x || z < -VOFF.z || z >= VSIZE.z - VOFF.z || y < 0 || y >= VSIZE.y) return; VX.world[vIdx(x, y, z)] = b; }
const vFill = (x0, y0, z0, x1, y1, z1, b) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) vSet(x, y, z, b); };
const isOpaque = (b) => b !== 0 && b !== VB.GLASS && b !== VB.LEAVES && b !== VB.WATER;
let GH = null;   // ground height map
function genVoxelWorld() {
  VX.world = new Uint8Array(VSIZE.x * VSIZE.y * VSIZE.z); GH = {};
  for (let x = -VOFF.x; x < VSIZE.x - VOFF.x; x++) for (let z = -VOFF.z; z < VSIZE.z - VOFF.z; z++) {
    let h = 3;
    const hill = Math.max(0, (-z - 14)) * 0.55 + Math.sin(x * 0.18) * 1.6 + Math.cos(x * 0.07 + z * 0.11) * 1.4;   // mountains behind
    const side = Math.max(0, Math.abs(x) - 26) * 0.5;
    h += Math.max(0, Math.round(hill + (z < 0 ? side : 0)));
    if (z > 21) h = 3;
    h = Math.min(h, 22); GH[`${x},${z}`] = h;
    for (let y = 0; y < h; y++) vSet(x, y, z, y < h - 4 ? VB.STONE : (y < h - 1 ? VB.DIRT : VB.GRASS));
    if (h > 12 && vRand(x * 31 + z) > 0.8) vSet(x, h - 1, z, VB.STONE);
  }
  const g0 = 3;   // village ground level (top surface at y=3)
  // flatten village area
  for (let x = -24; x <= 24; x++) for (let z = -13; z <= 21; z++) { for (let y = g0; y < VSIZE.y; y++) vSet(x, y, z, 0); vSet(x, g0 - 1, z, VB.GRASS); GH[`${x},${z}`] = g0; }
  // roads
  vFill(-24, g0 - 1, 4, 24, g0 - 1, 6, VB.PATH); vFill(-1, g0 - 1, -12, 1, g0 - 1, 21, VB.PATH);
  // pond
  for (let x = 15; x <= 22; x++) for (let z = 14; z <= 20; z++) if (Math.hypot((x - 18.5) / 3.5, (z - 17) / 3) < 1) { vSet(x, g0 - 1, z, VB.WATER); vSet(x, g0 - 2, z, VB.SAND); }
  const bld = (x0, z0, w, d, h, wall, roof, glassRows = true) => {
    vFill(x0, g0, z0, x0 + w - 1, g0 + h - 1, z0 + d - 1, wall);
    vFill(x0 + 1, g0, z0 + 1, x0 + w - 2, g0 + h - 1, z0 + d - 2, 0);
    if (glassRows) for (let y = g0 + 1; y < g0 + h - 1; y += 2) for (let x = x0 + 1; x < x0 + w - 1; x += 2) { vSet(x, y, z0 + d - 1, VB.GLASS); vSet(x, y, z0, VB.GLASS); }
    for (let i = 0; i <= Math.floor(Math.min(w, d) / 2); i++) vFill(x0 - 1 + i, g0 + h + i, z0 - 1 + (roof === VB.WHITE ? 0 : i), x0 + w - i, g0 + h + i, z0 + d - (roof === VB.WHITE ? 1 : i), roof);
    vFill(x0 + Math.floor(w / 2), g0, z0 + d - 1, x0 + Math.floor(w / 2), g0 + 1, z0 + d - 1, 0);   // door
  };
  // company tower (stone brick + glass)
  vFill(-16, g0, -10, -9, g0 + 15, -4, VB.SBRICK); vFill(-15, g0, -9, -10, g0 + 15, -5, 0);
  for (let y = g0 + 1; y < g0 + 15; y++) for (let x = -15; x <= -10; x++) if (y % 3 !== 0) vSet(x, y, -4, VB.GLASS);
  for (let y = g0 + 1; y < g0 + 15; y++) for (let z = -9; z <= -5; z++) if (y % 3 !== 0) vSet(-9, y, z, VB.GLASS);
  vFill(-13, g0, -4, -12, g0 + 1, -4, 0); vFill(-17, g0 + 16, -11, -8, g0 + 16, -3, VB.SBRICK);
  // tax office (white with blue roof, columns)
  bld(8, -11, 12, 7, 5, VB.WHITE, VB.ROOFB, false);
  for (let x = 8; x <= 19; x += 2) vFill(x, g0, -3, x, g0 + 4, -3, VB.WHITE);
  vFill(7, g0 + 5, -4, 20, g0 + 5, -3, VB.WHITE);
  vFill(19, g0 + 6, -10, 19, g0 + 12, -10, VB.LOG);
  // school (brick, green roof)
  bld(-6, -13, 13, 6, 5, VB.BRICK, VB.ROOFG);
  vFill(-1, g0 + 5, -10, 1, g0 + 8, -8, VB.BRICK);
  // town hall (planks/brick, red roof)
  bld(9, 9, 9, 6, 4, VB.PLANKS, VB.ROOFR);
  // houses
  [[-20, 9, VB.ROOFR], [-14, 11, VB.ROOFB], [-8, 9, VB.ROOFG], [-20, 15, VB.ROOFB]].forEach(([x, z, r]) => bld(x, z, 5, 5, 3, VB.PLANKS, r));
  // fountain
  for (let x = 4; x <= 10; x++) for (let z = 13; z <= 19; z++) { const d = Math.hypot(x - 7, z - 16); if (d < 3.6) vSet(x, g0, z, d > 2.6 ? VB.SBRICK : VB.WATER); }
  vFill(7, g0, 16, 7, g0 + 2, 16, VB.SBRICK);
  // trees
  const tree = (x, z, h = 5) => { const gy = GH[`${x},${z}`] ?? g0; for (let y = gy; y < gy + h; y++) vSet(x, y, z, VB.LOG);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 1; dy++) if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) < 4 && vRand(x * 9 + dx * 3 + dz * 5 + dy) > 0.12) { if (vGet(x + dx, gy + h - 1 + dy, z + dz) === 0) vSet(x + dx, gy + h - 1 + dy, z + dz, VB.LEAVES); }
    vSet(x, gy + h + 1, z, VB.LEAVES); };
  [[-22, -2], [-19, 1], [22, -1], [23, 8], [-23, 19], [21, 2]].forEach(([x, z], i) => tree(x, z, 4 + (i % 3)));
  for (let i = 0; i < 60; i++) { const x = Math.floor(vRand(i * 3.1) * 76) - 38, z = Math.floor(vRand(i * 7.7) * 16) - 30; if (Math.abs(x) < 26 && z > -14) continue; tree(x, z, 4 + (i % 3)); }
  for (let i = 0; i < 10; i++) { const x = (i % 2 ? 1 : -1) * (27 + Math.floor(vRand(i * 5.3 + 1) * 10)), z = Math.floor(vRand(i * 2.9 + 2) * 30) - 4; tree(x, z, 4 + (i % 3)); }
  VX.spots = { stage: [0, g0, 27], front: [-6, g0, 26], front2: [8, g0, 26], home: [-12, g0, 13], company: [-12, g0, -2], tax: [14, g0, -1], school: [0, g0, -6], town: [13, g0, 15], fountain: [7, g0, 16], cross: [0, g0, 5], field: [5, g0, 9], hill: [-4, 10, -22] };
}
function meshVoxels(atlas) {
  // faces are grouped per 16x16 column chunk so the camera and the shadow camera can cull what they don't see
  const groups = {};
  const grpOf = (x, z, k) => { const key = `${Math.floor((x + VOFF.x) / 16)},${Math.floor((z + VOFF.z) / 16)},${k}`; return groups[key] || (groups[key] = { k, p: [], n: [], uv: [], c: [], i: [] }); };
  const DIRS = [
    { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], f: 0, sh: 1.0 }, { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], f: 2, sh: 0.5 },
    { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], f: 1, sh: 0.82 }, { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], f: 1, sh: 0.82 },
    { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], f: 1, sh: 0.92 }, { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], f: 1, sh: 0.7 },
  ];
  const tsz = 1 / ATL.n; const occ = (x, y, z) => (isOpaque(vGet(x, y, z)) ? 1 : 0);
  for (let x = -VOFF.x; x < VSIZE.x - VOFF.x; x++) for (let y = 0; y < VSIZE.y; y++) for (let z = -VOFF.z; z < VSIZE.z - VOFF.z; z++) {
    const b = vGet(x, y, z); if (!b) continue;
    const grp = grpOf(x, z, b === VB.WATER ? 'water' : (b === VB.LEAVES || b === VB.GLASS ? 'cut' : 'solid'));
    for (const D of DIRS) {
      const nb = vGet(x + D.d[0], y + D.d[1], z + D.d[2]);
      if (isOpaque(nb) || (nb === b && b !== VB.LEAVES)) continue;
      if (b === VB.WATER && D.d[1] !== 1) continue;
      const tIdx = FACE_TEX[b][D.f]; const u0 = (tIdx % ATL.n) * tsz, v0 = 1 - (Math.floor(tIdx / ATL.n) + 1) * tsz;
      const base = grp.p.length / 3;
      const uvs = [[u0, v0], [u0 + tsz, v0], [u0 + tsz, v0 + tsz], [u0, v0 + tsz]];
      const aos = D.c.map((cc) => {
        // ambient occlusion from the 3 neighbours around this corner in the face's outer layer
        const ox = x + D.d[0], oy = y + D.d[1], oz = z + D.d[2];
        const sx = cc[0] ? 1 : -1, sy = cc[1] ? 1 : -1, sz = cc[2] ? 1 : -1;
        let a, bb, cr;
        if (D.d[1] !== 0) { a = occ(ox + sx, oy, oz); bb = occ(ox, oy, oz + sz); cr = occ(ox + sx, oy, oz + sz); }
        else if (D.d[0] !== 0) { a = occ(ox, oy + sy, oz); bb = occ(ox, oy, oz + sz); cr = occ(ox, oy + sy, oz + sz); }
        else { a = occ(ox + sx, oy, oz); bb = occ(ox, oy + sy, oz); cr = occ(ox + sx, oy + sy, oz); }
        const lvl = a && bb ? 0 : 3 - (a + bb + cr); return [0.5, 0.66, 0.82, 1.0][lvl];
      });
      D.c.forEach((cc, k) => { grp.p.push(x + cc[0], y + cc[1] - (b === VB.WATER ? 0.12 : 0), z + cc[2]); grp.n.push(...D.d); grp.uv.push(...uvs[k]); const s = D.sh * aos[k]; grp.c.push(s, s, s); });
      if (aos[0] + aos[2] > aos[1] + aos[3]) grp.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else grp.i.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
  }
  const out = []; const mats = {};
  const matFor = (k) => mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.92, metalness: 0,
    transparent: k === 'water', opacity: k === 'water' ? 0.82 : 1, alphaTest: k === 'cut' ? 0.5 : 0, side: k === 'cut' ? THREE.DoubleSide : THREE.FrontSide }));
  for (const g of Object.values(groups)) { const k = g.k; if (!g.i.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c, 3)); geo.setIndex(g.i);
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, matFor(k)); mesh.castShadow = k !== 'water'; mesh.receiveShadow = true; out.push(mesh);
  }
  return out;
}
function plantsMesh(atlas) {
  const p = [], uv = [], idx = [], nrm = []; const tsz = 1 / ATL.n;
  for (let x = -VOFF.x; x < VSIZE.x - VOFF.x; x++) for (let z = -VOFF.z; z < VSIZE.z - VOFF.z; z++) {
    const h = GH[`${x},${z}`]; if (h === undefined || vGet(x, h - 1, z) !== VB.GRASS || vGet(x, h, z) !== 0) continue;
    const r = vRand(x * 13.1 + z * 7.3); if (r < 0.72) continue;
    const t = r > 0.97 ? 21 : 20; const u0 = (t % ATL.n) * tsz, v0 = 1 - (Math.floor(t / ATL.n) + 1) * tsz;
    const cx = x + 0.5 + (vRand(x + z * 3) - 0.5) * 0.4, cz = z + 0.5 + (vRand(z + x * 5) - 0.5) * 0.4, hh = 0.75 + vRand(x * z) * 0.35;
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const dx = Math.cos(a) * 0.45, dz = Math.sin(a) * 0.45; const b = p.length / 3;
      p.push(cx - dx, h, cz - dz, cx + dx, h, cz + dz, cx + dx, h + hh, cz + dz, cx - dx, h + hh, cz - dz);
      uv.push(u0, v0, u0 + tsz, v0, u0 + tsz, v0 + tsz, u0, v0 + tsz); nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setIndex(idx);
  const m = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
  m.onBeforeCompile = (sh) => { sh.uniforms.uTime = { value: 0 }; VX.plantShader = sh;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float sway = (position.y - floor(position.y)) * 0.12 * sin(uTime * 1.8 + position.x * 0.7 + position.z * 0.5);\n transformed.x += sway; transformed.z += sway * 0.6;'); };
  const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; return mesh;
}
function snowLayer() {
  const p = [], idx = []; for (let x = -VOFF.x; x < VSIZE.x - VOFF.x; x++) for (let z = -VOFF.z; z < VSIZE.z - VOFF.z; z++) {
    let y = VSIZE.y - 1; while (y > 0 && !vGet(x, y, z)) y--; const b = vGet(x, y, z); if (!b || b === VB.WATER || b === VB.GLASS) continue;
    const yy = y + 1.02; const k = p.length / 3; p.push(x, yy, z, x + 1, yy, z, x + 1, yy, z + 1, x, yy, z + 1); idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.9 })); m.receiveShadow = true; m.visible = false; return m;
}
function cloudSprite(seed) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const c = cv.getContext('2d');
  for (let i = 0; i < 26; i++) { const x = 90 + vRand(seed * 31 + i) * 330, y = 120 + (vRand(seed * 17 + i) - 0.5) * 70, r = 40 + vRand(seed * 7 + i) * 60;
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(250,250,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 512, 256); }
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, fog: false })); s.scale.set(60, 30, 1); return s;
}
// ---- block characters (original look)
function faceTex(skin, eye, extra) {
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8; const c = cv.getContext('2d');
  c.fillStyle = skin; c.fillRect(0, 0, 8, 8); c.fillStyle = extra.hair; c.fillRect(0, 0, 8, 2); c.fillRect(0, 2, 1, 2); c.fillRect(7, 2, 1, 2);
  c.fillStyle = '#fff'; c.fillRect(1, 4, 2, 1); c.fillRect(5, 4, 2, 1); c.fillStyle = eye; c.fillRect(2, 4, 1, 1); c.fillRect(5, 4, 1, 1);
  if (extra.glasses) { c.fillStyle = '#222'; c.fillRect(1, 3, 6, 1); }
  c.fillStyle = '#b5654f'; c.fillRect(3, 6, 2, 1);
  const tx = new THREE.CanvasTexture(cv); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
function blockPerson(o = {}) {
  const g = new THREE.Group(); const lam = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const skin = o.skin || '#f0c8a0'; const shirt = lam(o.shirt || 0x3a6fd8), pants = lam(o.pants || 0x27375f), skinM = lam(skin);
  const part = (w, h, d, m, x, y, z, pivotY) => { const piv = new THREE.Group(); piv.position.set(x, pivotY ?? y, z); const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.y = pivotY !== undefined ? y - pivotY : 0; mesh.castShadow = true; piv.add(mesh); g.add(piv); return piv; };
  const legL = part(0.25, 0.75, 0.25, pants, -0.125, 0.375, 0, 0.75), legR = part(0.25, 0.75, 0.25, pants, 0.125, 0.375, 0, 0.75);
  part(0.5, 0.75, 0.25, shirt, 0, 1.125, 0);
  if (o.tie) { const tie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.02), lam(0xd23b3b)); tie.position.set(0, 1.25, 0.135); g.add(tie); }
  const armL = part(0.22, 0.75, 0.22, o.sleeve === false ? skinM : shirt, -0.36, 1.125, 0, 1.45), armR = part(0.22, 0.75, 0.22, o.sleeve === false ? skinM : shirt, 0.36, 1.125, 0, 1.45);
  const headM = [skinM, skinM, lam(o.hair || '#4a2c1a'), skinM, new THREE.MeshStandardMaterial({ map: faceTex(skin, '#2a2a3a', { hair: o.hair || '#4a2c1a', glasses: o.glasses }), roughness: 0.85 }), lam(o.hair || '#4a2c1a')];
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headM); head.position.y = 1.75; head.castShadow = true; g.add(head);
  g.userData = { legL, legR, armL, armR, head };
  return g;
}
function animBlock(p, t, mode = 'idle', ph = 0) {
  const u = p.userData; const s = mode === 'walk' ? Math.sin(t * 8 + ph) * 0.6 : 0;
  u.legL.rotation.x = s; u.legR.rotation.x = -s; u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
  if (mode === 'wave') u.armR.rotation.z = 2.6 + 0.3 * Math.sin(t * 8 + ph);
  else if (mode === 'cheer') { u.armR.rotation.z = 2.8; u.armL.rotation.z = -2.8; }
  else if (mode === 'point') { u.armR.rotation.x = -1.4; }
  else { u.armR.rotation.z = 0; u.armL.rotation.z = 0; }
  u.head.rotation.y = 0.25 * Math.sin(t * 0.8 + ph); u.head.rotation.x = mode === 'sad' ? 0.35 : 0;
  if (mode === 'cheer') p.position.y = (p.userData.baseY || 0) + Math.abs(Math.sin(t * 5 + ph)) * 0.25;
}
const LOOKS = {
  hero: { shirt: 0xf5f5f5, pants: 0x27375f, tie: true, hair: '#3a2416' },
  v1: { shirt: 0xe07a5f, pants: 0x3d405b, hair: '#2a1c14' }, v2: { shirt: 0x81b29a, pants: 0x3d405b, hair: '#6b3e1f' },
  v3: { shirt: 0xf2cc8f, pants: 0x4a4e69, hair: '#1f1f1f' }, v4: { shirt: 0x8e6cc9, pants: 0x22223b, hair: '#5a3a22' },
  worker: { shirt: 0x2f3e5c, pants: 0x1e2433, tie: true, hair: '#222' },
};
function vxCoin() { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0xf2c248, metalness: 0.8, roughness: 0.3 })); c.castShadow = true; c.rotation.x = Math.PI / 2; return c; }
function vxSign(w = 3) {
  const g = new THREE.Group(); const wood = new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.8 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), wood); post.position.y = 0.8; post.castShadow = true; g.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 0.15), new THREE.MeshStandardMaterial({ color: 0xc89b6d, roughness: 0.8 })); board.position.y = 2.0; board.castShadow = true; g.add(board);
  g.userData.board = board; return g;
}
function buildVoxel() {
  const g = new THREE.Group(); genVoxelWorld();
  const atlas = makeAtlas(); meshVoxels(atlas).forEach((m) => g.add(m)); VX.plants = plantsMesh(atlas); g.add(VX.plants);
  VX.snowMesh = snowLayer(); g.add(VX.snowMesh);
  const sp = new THREE.BufferGeometry(); const arr = []; for (let i = 0; i < 1500; i++) arr.push((vRand(i) - 0.5) * 70, vRand(i * 3) * 30, (vRand(i * 7) - 0.5) * 60);
  sp.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  VX.snowPts = new THREE.Points(sp, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.9 })); VX.snowPts.visible = false; g.add(VX.snowPts);
  for (let i = 0; i < 7; i++) { const c = cloudSprite(i + 1); c.position.set(-60 + i * 22, 38 + (i % 3) * 5, -60 + (i % 2) * 20); g.add(c); VX.clouds.push(c); }
  const looks = ['v1', 'v2', 'v3', 'v4', 'worker', 'v1', 'v3', 'v2'];
  VX.walkers = looks.map((l, i) => { const p = blockPerson(LOOKS[l]); p.scale.setScalar(0.9); g.add(p); return { p, lane: i % 2 ? 4.6 : 6.4, speed: 1.0 + (i % 3) * 0.25, off: i * 6, dir: i % 3 ? 1 : -1 }; });
  return g;
}
function animVoxel(t, snow) {
  if (VX.plantShader) VX.plantShader.uniforms.uTime.value = t;
  VX.clouds.forEach((c, i) => { c.position.x = ((-60 + i * 22 + t * 0.6) + 80) % 160 - 80; });
  VX.walkers.forEach((w) => { const L = 46; const s = ((t * w.speed + w.off) % L + L) % L; const x = w.dir > 0 ? -23 + s : 23 - s;
    w.p.position.set(x, 3, w.lane); w.p.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2; animBlock(w.p, t, 'walk', w.off); });
  VX.snowMesh.visible = !!snow; VX.snowPts.visible = !!snow;
  if (snow) { const a = VX.snowPts.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = (vRand(i * 3) * 30 - t * (1.2 + vRand(i) * 0.8)) % 30; if (y < 0) y += 30; a.setY(i, y); } a.needsUpdate = true; }
}

B.vx = (v, sc) => {
  const g = new THREE.Group(); const S = VX.spots; const act = v.act;
  const P3 = (k, dx = 0, dy = 0, dz = 0) => new THREE.Vector3(S[k][0] + dx, S[k][1] + dy, S[k][2] + dz);
  let cam = { dist: 12, elev: 18, azim: 0, ty: 4, tx: 0, tz: 6 }; let upd = () => {}; let ov = () => [];
  const look = (p, d, el, az, dy = 1.5) => { cam = { dist: d, elev: el, azim: az, ty: p.y + dy, tx: p.x, tz: p.z }; };
  const person = (lk, pos, ry = 0) => { const p = blockPerson(LOOKS[lk]); p.position.copy(pos); p.rotation.y = ry; p.userData.baseY = pos.y; g.add(p); return p; };
  const coins = (n) => [...Array(n)].map(() => { const c = vxCoin(); g.add(c); return c; });
  const fly = (cs, a, b, lt, t, o = {}) => cs.forEach((c, i) => { const ph = ((lt - (o.delay ?? 0.3)) * (o.speed ?? 0.5) + i / cs.length) % 1; c.visible = lt > (o.delay ?? 0.3);
    c.position.set(lerp(a.x, b.x, ph), lerp(a.y, b.y, ph) + Math.sin(ph * Math.PI) * (o.arc ?? 3), lerp(a.z, b.z, ph)); c.rotation.set(Math.PI / 2, 0, t * 4 + i); });
  const anchorAt = (pos) => { const o = new THREE.Object3D(); o.position.copy(pos); g.add(o); return o; };
  const tt = (html, y = TITLE_Y, size = 52, delay = 0.3) => ({ kind: 'title', y, html, size, color: '#fff', bg: 'rgba(20,24,32,0.82)', delay });
  if (act === 'title' || act === 'title_ep') {
    cam = { dist: 34, elev: 22, azim: -20, ty: 6, tx: 0, tz: 2 };
    if (act === 'title_ep') cam = { dist: 22, elev: 14, azim: 25, ty: 5, tx: 0, tz: -4 };
    ov = () => [{ kind: 'bigtitle', y: 1100, series: act === 'title' ? '' : spec.series, title: v.title, delay: 0.2, small: act === 'title' }];
  } else if (act === 'payday') {
    const hero = person('hero', P3('front', 0, 0, 0), 0.2);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.03), new THREE.MeshStandardMaterial({ color: 0xffffff })); paper.position.set(0.4, 1.25, 0.35); hero.add(paper);
    const c1 = coins(4), c2 = coins(4);
    look(hero.position, 6, 8, 18, 1.3);
    upd = (lt, D, t) => { animBlock(hero, t, lt > 2.0 ? 'sad' : 'idle'); if (lt > 1.5) { fly(c1, hero.position.clone().add(new THREE.Vector3(0.4, 1.6, 0.4)), P3('tax', 0, 5, -3), lt - 1.5, t, { arc: 4, speed: 0.4 }); fly(c2, hero.position.clone().add(new THREE.Vector3(0.4, 1.6, 0.4)), P3('town', 0, 4, -1), lt - 1.7, t, { arc: 3, speed: 0.4 }); } };
    ov = (lt) => lt > 1.6 ? [callout(anchorAt(P3('tax', 0, 6, -3)), [0, 0, 0], '税金', { dx: 0, dy: -150, color: C.down, delay: 1.8, size: 40 }), callout(anchorAt(P3('town', 0, 5, -1)), [0, 0, 0], '社会保険料', { dx: 0, dy: -150, color: C.teal, delay: 2.0, size: 40 })] : [tt('はじめての給料！', TITLE_Y, 54, 0.3)];
  } else if (act === 'juminzei') {
    look(P3('town', 0, 0, 0), 14, 16, -20, 2); const sg = vxSign(3.4); sg.position.copy(P3('town', -3, 0, 7)); g.add(sg);
    ov = () => [{ kind: 'tag', obj: sg.userData.board, local: [0, 0, 0.1], text: '住民税', size: 64, dark: true, color: '#3b2a1a', delay: 0.3 }, tt('1年後から 住民税も', TITLE_Y, 52, 0.6)];
  } else if (act === 'alone') {
    const hero = person('hero', P3('field', 0, 0, 0), 0.2); look(hero.position, 7, 8, 30, 1.3);
    upd = (lt, D, t) => animBlock(hero, t, 'sad');
    ov = () => [{ kind: 'tag', obj: hero, local: [0, 2.6, 0], text: '？', size: 90, dark: true, color: '#eb4d4b', delay: 0.3 }];
  } else if (act === 'school') {
    look(P3('school', 0, 0, 0), 18, 14, 10, 4);
    const kids = ['v1', 'v2', 'v3', 'v4'].map((l, i) => person(l, P3('school', -3 + i * 2, 0, 6), Math.PI));
    upd = (lt, D, t) => kids.forEach((k, i) => { k.position.z = S.school[2] + 6 - ((lt * 0.8 + i * 0.4) % 4); animBlock(k, t, 'walk', i); });
    ov = () => [callout(anchorAt(P3('school', 0, 9, 0)), [0, 0, 0], 'お金の授業', { dx: 0, dy: -150, color: C.gold, delay: 0.3, size: 44 })];
  } else if (act === 'define') {
    const heights = [2, 4, 7]; const towers = [];
    heights.forEach((h, i) => { const x = -2.6 + i * 2.6; const tw = new THREE.Group(); tw.position.copy(P3('stage', x + 0.7, 0, 0));
      const nTax = Math.max(1, Math.round(h * (0.12 + i * 0.1)));
      for (let j = 0; j < h; j++) { const top = j >= h - nTax; const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: top ? 0xe0473c : 0xf2c248, metalness: top ? 0.1 : 0.55, roughness: 0.4 })); b.position.y = 0.45 + j * 0.92; b.castShadow = true; b.receiveShadow = true; tw.add(b); }
      g.add(tw); towers.push(tw); person(['v1', 'v2', 'v3'][i], P3('stage', x - 0.6, 0, 0.3), 0); });
    look(P3('stage', 0.9, 0, 0), 15, 9, 0, 3.0); cam.drift = 2.5;
    upd = (lt) => towers.forEach((tw, i) => tw.children.forEach((b, j) => { b.visible = j < Math.ceil(tw.children.length * eOut((lt - 0.2 - i * 0.35) / 1.0)); }));
    ov = () => [callout(towers[2], [0, 6.7, 0], '赤い部分＝税金', { dx: -60, dy: -110, color: C.down, delay: 1.4, size: 38 })];
  } else if (act === 'selfcalc') {
    const hero = person('hero', P3('front', 0, 0, 0), -0.4);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.8 })); desk.position.copy(P3('front', 1.5, 0.45, 0.5)); desk.castShadow = true; g.add(desk);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.7), new THREE.MeshStandardMaterial({ color: 0xffffff })); paper.position.copy(P3('front', 1.4, 0.92, 0.5)); g.add(paper);
    look(hero.position.clone().add(new THREE.Vector3(0.7, 0, 0)), 5.5, 12, 20, 1.6);
    upd = (lt, D, t) => animBlock(hero, t, 'point');
    ov = () => [tt('自分で申告・計算', TITLE_Y, 52, 0.4)];
  } else if (act === 'commuters') {
    look(P3('company', 0, 0, 0), 22, 14, 12, 6);
    const ps = [...Array(10)].map((_, i) => person(['worker', 'v1', 'worker', 'v3'][i % 4], P3('company', 0, 0, 8), Math.PI));
    upd = (lt, D, t) => ps.forEach((p, i) => { const k = (lt * 0.18 + i / 10) % 1; p.position.set(S.company[0] - 2 + (i % 3) * 1.2, S.company[1], lerp(S.company[2] + 9, S.company[2] - 1, k)); animBlock(p, t, 'walk', i); });
    ov = () => [callout(anchorAt(P3('company', 0, 14, -4)), [0, 0, 0], '会社', { dx: 40, dy: -120, color: C.blue, delay: 0.3, size: 44 })];
  } else if (act === 'company') {
    const sCo = vxSign(2.0); sCo.position.copy(P3('stage', -2.7, 0, -0.5)); g.add(sCo);
    const sKu = vxSign(2.0); sKu.position.copy(P3('stage', 2.7, 0, -0.5)); g.add(sKu);
    const hero = person('hero', P3('stage', 0, 0, 1.6), 0);
    const cart = new THREE.Group(); const box_ = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 })); box_.position.y = 0.6; box_.castShadow = true; cart.add(box_);
    for (let i = 0; i < 3; i++) { const c = vxCoin(); c.rotation.set(0, 0, 0); c.position.set(-0.35 + i * 0.35, 1.0, 0); cart.add(c); }
    for (const x of [-0.42, 0.42]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x333333 })); w.rotation.x = Math.PI / 2; w.position.set(x, 0.24, 0.5); cart.add(w); }
    g.add(cart); const pay = coins(3);
    look(P3('stage', 0.3, 0, 0), 15, 9, 0, 2.0); cam.drift = 2.5;
    upd = (lt, D, t) => { const k = clamp((lt - 1.2) / (D - 1.8)); cart.position.copy(P3('stage', lerp(-2.4, 2.4, eInOut(k)), 0, 0.2)); animBlock(hero, t, 'idle');
      fly(pay, P3('stage', -2.4, 2.2, -0.3), hero.position.clone().add(new THREE.Vector3(0, 1.8, 0)), lt, t, { arc: 1.5, speed: 0.55, delay: 0.4 }); };
    ov = () => [{ kind: 'tag', obj: sCo.userData.board, local: [0, 0, 0.1], text: '会社', size: 64, dark: true, color: '#3b2a1a', delay: 0.1 },
      { kind: 'tag', obj: sKu.userData.board, local: [0, 0, 0.1], text: '国', size: 64, dark: true, color: '#3b2a1a', delay: 0.2 },
      callout(hero, [0, 2.2, 0], '残りが給与', { dx: 0, dy: -150, color: C.blue, delay: 0.8, size: 36 }),
      callout(cart, [0, 1.3, 0], '先に引いた税金', { dx: 0, dy: 160, color: C.gold, delay: 1.4, size: 36 })];
  } else if (act === 'vault') {
    const vault = new THREE.Group(); const vb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x7b8494, metalness: 0.6, roughness: 0.35 })); vb.position.y = 1.1; vb.castShadow = true; vault.add(vb);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.08), new THREE.MeshStandardMaterial({ color: 0x5b6475, metalness: 0.6, roughness: 0.35 })); door.position.set(0, 1.1, 1.12); vault.add(door);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 20), new THREE.MeshStandardMaterial({ color: 0xf2c248, metalness: 0.8, roughness: 0.3 })); dial.rotation.x = Math.PI / 2; dial.position.set(0, 1.2, 1.2); vault.add(dial);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1a22 })); slot.position.set(0, 2.21, 0); vault.add(slot);
    vault.position.copy(P3('stage', 0, 0, 0)); g.add(vault); const cs = coins(4);
    look(P3('stage', 0, 0, 0), 9, 10, 0, 1.8); cam.drift = 2.5;
    upd = (lt, D, t) => { dial.rotation.y = t; cs.forEach((c, i) => { const ph = ((lt - 0.3) * 0.7 + i / 4) % 1; c.visible = lt > 0.3; c.position.copy(P3('stage', 0, lerp(5.5, 2.2, ph * ph), 0)); c.rotation.set(0, t * 3 + i, 0); c.scale.setScalar(ph > 0.95 ? 0.001 : 1); }); };
    ov = () => [];
  } else if (act === 'relax') {
    const ps = ['v1', 'v2', 'v3', 'hero'].map((l, i) => person(l, P3('fountain', -3 + i * 2, 0, 5), 0));
    look(P3('fountain', 0, 0, 2), 13, 12, -10, 1.8);
    upd = (lt, D, t) => ps.forEach((p, i) => animBlock(p, t, 'cheer', i));
    ov = () => [tt('納税者の負担が減る', TITLE_Y, 52, 0.4)];
  } else if (act === 'sign' || act === 'sign_nenmatsu') {
    const sg = vxSign(5); sg.position.copy(P3('cross', 3.5, 0, 3)); sg.scale.setScalar(1.2); g.add(sg);
    look(sg.position, 9, 10, -8, 2.2);
    upd = (lt) => { sg.scale.setScalar(1.2 * Math.max(0.001, eBack((lt - 0.1) / 0.5))); };
    ov = () => [{ kind: 'tag', obj: sg.userData.board, local: [0, 0, 0.1], text: v.label, size: 96, dark: true, color: '#3b2a1a', delay: 0.4 }];
  } else if (act === 'spring') {
    look(P3('fountain', 0, 0, 0), 9, 18, 15, 1.5); const cs = coins(8);
    upd = (lt, D, t) => cs.forEach((c, i) => { const ph = (t * 0.6 + i / 8) % 1; const a = i * 0.8; c.position.set(S.fountain[0] + 0.5 + Math.cos(a) * ph * 2.5, S.fountain[1] + 3 + Math.sin(ph * Math.PI) * 3, S.fountain[2] + 0.5 + Math.sin(a) * ph * 2.5); c.rotation.set(Math.PI / 2, 0, t * 4 + i); });
    ov = () => [callout(anchorAt(P3('fountain', 0.5, 3, 0.5)), [0, 0, 0], '源＝お金が湧く出どころ', { dx: 0, dy: -200, color: C.blue, delay: 0.4, size: 40 })];
  } else if (act === 'months') {
    const hs = [3, 4, 3, 5, 4, 3, 4, 6, 4, 3, 5, 7]; const cols = hs.map((h, i) => { const tw = new THREE.Group(); tw.position.copy(P3('stage', -3.3 + i * 0.6, 0, 0));
      for (let j = 0; j < h; j++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.48), new THREE.MeshStandardMaterial({ color: 0xf2c248, metalness: 0.55, roughness: 0.35 })); b.position.y = 0.23 + j * 0.46; b.castShadow = true; tw.add(b); } g.add(tw); return tw; });
    look(P3('stage', 0.2, 0, 0), 14, 10, 0, 1.4); cam.drift = 2.5;
    upd = (lt) => cols.forEach((tw, i) => { tw.scale.y = Math.max(0.001, eBack((lt - 0.1 - i * 0.06) / 0.4)); });
    ov = () => [{ kind: 'tag', obj: cols[0], local: [0, -0.4, 0.6], text: '1月', size: 34, delay: 0.5 }, { kind: 'tag', obj: cols[11], local: [0, -0.4, 0.6], text: '12月', size: 34, delay: 0.7 }];
  } else if (act === 'december' || act === 'recalc' || act === 'refund' || act === 'extra') {
    const hero = person('hero', P3('front', 0, 0, 0), 0.3); const cs = coins(4);
    look(hero.position, 6, 8, 14, 1.3);
    if (act === 'december') { cam = { dist: 24, elev: 20, azim: -10, ty: 6, tx: -2, tz: 4 }; }
    upd = (lt, D, t) => { animBlock(hero, t, act === 'refund' ? 'cheer' : (act === 'extra' ? 'sad' : 'idle'));
      if (act === 'refund') fly(cs, P3('tax', 0, 4, 0), hero.position.clone().add(new THREE.Vector3(0, 1.8, 0)), lt, t, { arc: 4, speed: 0.4 });
      if (act === 'extra') fly(cs, hero.position.clone().add(new THREE.Vector3(0, 1.8, 0)), P3('tax', 0, 4, 0), lt, t, { arc: 4, speed: 0.4 }); };
    ov = () => act === 'december' ? [tt('12月', 700, 90, 0.2)]
      : act === 'recalc' ? [tt('1年分を正確に計算', TITLE_Y, 52, 0.4)]
      : act === 'refund' ? [tt('取りすぎた分は<span style="color:#7dff9a">返ってくる</span>', TITLE_Y, 50, 0.4)]
      : [tt('足りない分は<span style="color:#ff8a8a">改めて徴収</span>', TITLE_Y, 50, 0.4)];
  } else if (act === 'insurance') {
    const hero = person('hero', P3('front', 0, 0, 0), 0.2);
    const cert = (dx, color) => { const g2 = new THREE.Group(); const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), new THREE.MeshStandardMaterial({ color: 0x8a5a2b })); post.position.y = 0.6; g2.add(post);
      const bd = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.08), new THREE.MeshStandardMaterial({ color: 0xfbfaf5, roughness: 0.9 })); bd.position.y = 2.0; bd.castShadow = true; g2.add(bd);
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.1), new THREE.MeshStandardMaterial({ color })); band.position.y = 2.8; g2.add(band);
      g2.position.copy(P3('front', dx, 0, -1.2)); g.add(g2); g2.userData.bd = bd; return g2; };
    const c1 = cert(-1.9, 0xe0473c), c2 = cert(1.9, 0x3a6fd8);
    look(P3('front', 0, 0, -0.5), 11, 8, 0, 1.7); cam.drift = 2.5;
    upd = (lt, D, t) => { animBlock(hero, t, 'point'); [c1, c2].forEach((c, i) => { c.scale.setScalar(Math.max(0.001, eBack((lt - 0.2 - i * 0.3) / 0.5))); c.rotation.y = 0.15 * Math.sin(t + i); }); };
    ov = () => [{ kind: 'tag', obj: c1.userData.bd, local: [0, 0, 0.06], text: '生命保険料<br>控除証明書', size: 34, dark: true, color: '#1f2937', delay: 0.4 },
      { kind: 'tag', obj: c2.userData.bd, local: [0, 0, 0.06], text: '地震保険料<br>控除証明書', size: 34, dark: true, color: '#1f2937', delay: 0.7 }, tt('各種控除を まとめて整理', TITLE_Y, 50, 0.9)];
  } else if (act === 'forget') {
    const hero = person('hero', P3('front', 0, 0, 0), 0.3); const papers = [...Array(6)].map(() => { const q = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.7), new THREE.MeshStandardMaterial({ color: 0xffffff })); q.castShadow = true; g.add(q); return q; });
    look(hero.position, 6.5, 8, 22, 1.3);
    upd = (lt, D, t) => { animBlock(hero, t, 'sad'); papers.forEach((q, i) => { const k = ((lt * 0.35 + i / 6) % 1); q.position.set(hero.position.x + 0.5 + k * 9, hero.position.y + 1.5 + k * 4 + Math.sin(k * 8 + i) * 0.6, hero.position.z - k * 3); q.rotation.set(t * 3 + i, t * 2, t + i); }); };
    ov = () => [tt('書類の出し忘れに注意', TITLE_Y, 52, 0.4)];
  } else if (act === 'books') {
    const box_ = new THREE.Group(); const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.75 });
    const bx = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.4), wood); bx.position.y = 0.6; bx.castShadow = true; box_.add(bx);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 1.45), new THREE.MeshStandardMaterial({ color: 0xf2c248, metalness: 0.7, roughness: 0.3 })); trim.position.y = 1.1; box_.add(trim);
    box_.position.copy(P3('front2', 0, 0, 0)); g.add(box_); const books = [0xd9534f, 0x3b82c4, 0x6aa84f, 0xe0a23b, 0x8e6cc9].map((c) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.9), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })); b.castShadow = true; g.add(b); return b; });
    const hero = person('hero', P3('front2', -2.2, 0, 0.8), 0.6); look(box_.position.clone().add(new THREE.Vector3(-1, 0, 0)), 7, 10, 10, 1.6);
    upd = (lt, D, t) => { animBlock(hero, t, 'cheer'); books.forEach((b, i) => { const k = clamp((lt - 0.3 - i * 0.4) / 0.6); b.visible = k > 0 && k < 1; b.position.set(box_.position.x, box_.position.y + lerp(5, 1.2, k * k), box_.position.z); b.rotation.set(0, t * 2 + i, k); }); };
    ov = () => [tt('知識を<span style="color:#ffd84a">蓄えよう</span>', TITLE_Y, 56, 0.4)];
  } else if (act === 'sunset') {
    const hero = person('hero', P3('cross', -1, 0, 7), 0); look(hero.position, 26, 14, -20, 3);
    upd = (lt, D, t) => animBlock(hero, t, 'wave');
    ov = (lt, D) => lt > D - 3.2 ? [{ kind: 'bigtitle', y: 1100, series: spec.series, title: '次回もお楽しみに', delay: D - 3.2, small: true }] : [tt('今日の授業はここまで', TITLE_Y, 54, 0.3)];
  }
  return { group: g, cam, snow: ['december', 'recalc', 'refund', 'extra', 'sign_nenmatsu', 'insurance', 'forget'].includes(act), sunset: act === 'sunset',
    update: (lt, D, t) => upd(lt, D, t), overlay: (lt, D, t) => ov(lt, D, t) };
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
  school: { top: '#f3ead9', bottom: '#e8dcc6', floor: 0xc9a47a, fog: 0xefe5d3, set: 'school' },
  diorama: { top: '#efe8dc', bottom: '#cbbda6', floor: 0xb98a5c, fog: 0xd8ccb8, set: 'diorama' },
  voxel: { top: '#5f9ee6', bottom: '#dfeaf3', floor: 0x6cb04a, fog: 0xd3e3ef, set: 'voxel' },
};

async function init() {
  spec = await (await fetch('/__spec.json')).json();
  tl = await (await fetch('/__timeline.json')).json();
  themeName = new URLSearchParams(location.search).get('theme') || spec.theme || 'studio';
  if (themeName === 'rpg') {
    const m = await import('./rpg.js'); await m.setupRPG(spec, tl);
    await document.fonts.ready; window.ready = true; return;
  }
  const th = THEMES[themeName];
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
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8892a6, 0.8); scene.add(hemi); hemiLight = hemi;
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sunLight = sun; sun.position.set(5, 10, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6; sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 }); scene.add(sun);
  floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: th.floor, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  if (th.set === 'school') scene.add(buildSchool());
  if (th.set === 'voxel') {
    scene.add(buildVoxel()); floor.visible = false;
    scene.fog = new THREE.Fog(th.fog, 45, 150); camera.fov = 40; camera.far = 170; camera.updateProjectionMatrix();
    sun.color.setHex(0xfff0d8); sun.intensity = 3.0; sun.shadow.radius = 4; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120 }); sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun.target); hemi.color.setHex(0xcfe6ff); hemi.groundColor.setHex(0x6b5a40); hemi.intensity = 1.0; scene.environmentIntensity = 0.35;
    renderer.toneMappingExposure = 1.08;
    // performance: render at 0.8x and let CSS upscale; shadows only around the camera target
    renderer.setPixelRatio(0.72); renderer.setSize(W, H, false); sun.shadow.mapSize.set(1280, 1280);
  }
  if (th.set === 'diorama') {
    scene.add(buildDiorama());
    scene.fog = new THREE.Fog(th.fog, 30, 75);
    sun.color.setHex(0xfff1dc); sun.intensity = 2.6; sun.position.set(6, 12, 8);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const hP = new ShaderPass(HorizontalTiltShiftShader); hP.uniforms.h.value = 9 / W; hP.uniforms.r.value = 0.47; composer.addPass(hP);
    const vP = new ShaderPass(VerticalTiltShiftShader); vP.uniforms.v.value = 9 / H; vP.uniforms.r.value = 0.47; composer.addPass(vP);
    composer.addPass(new OutputPass());
    renderer.domElement.style.filter = 'saturate(1.18) contrast(1.04)';
  }
  // preload fonts for every glyph that will appear
  const all = spec.scenes.map((s) => s.text + JSON.stringify(s.visual) + (s.note || '')).join('') + (spec.asof || '') + (spec.series || '') + (spec.episode || '') + '先生生徒あなた会社国手間払い忘れ所得をつかむ答え合わせ見込み本当の1年分戻る追加で引く全員が自分で計算確保取りこぼしゼロ壁住宅ローン控除確定申告目年末調整OK給与明細？！' + '0123456789%万円か月以内合計残り遺産基礎控除申告まとめご注意情報提供目的です投資判断はご自身で数値は時点期限';
  const pre = document.getElementById('preload');
  pre.innerHTML = [500, 700, 900].map((w) => `<span style="font-weight:${w}">${all.replace(/[<>&]/g, '')}</span>`).join('');
  await document.fonts.ready;
  for (const w of [500, 700, 900]) await document.fonts.load(`${w} 40px "Noto Sans JP"`, all);
  await document.fonts.ready;
  const srcs = [...new Set(spec.scenes.filter((s) => s.visual?.type === 'photo').map((s) => s.visual.src))];
  await Promise.all(srcs.map((src) => new Promise((res) => { const im = imgSize(src); if (im.complete && im.naturalWidth) res(); else { im.onload = res; im.onerror = res; } })));
  for (const f of ['900 40px "Zen Maru Gothic"', '700 40px "Zen Maru Gothic"', '400 40px "Dela Gothic One"']) await document.fonts.load(f, all + (spec.series || '') + '次回もお楽しみに生徒先生');
  await document.fonts.load('600 30px "Klee One"', all + '会社国税務署従業員給料税金を納める引いた残りみなさん');
  window.ready = true;
}

// voxel: raise the camera until nothing blocks the line of sight to the target (checked over the whole drift range)
function vxClearCam(c) {
  const blocked = (el, az, dist) => {
    const tx = c.tx || 0, tz = c.tz || 0; const e = el * Math.PI / 180, a = az * Math.PI / 180;
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    for (let d = 2.0; d < dist; d += 0.4) { const x = tx + dir.x * d, y = c.ty + dir.y * d, z = tz + dir.z * d; if (vGet(Math.floor(x), Math.floor(y), Math.floor(z))) return true; }
    return false;
  };
  for (let k = 0; k < 24; k++) {
    let ok = true;
    for (const az of [c.azim - 7, c.azim, c.azim + 7]) for (const de of [-2, 2]) if (blocked(c.elev * 0.65 + de, az, c.dist * 1.6)) ok = false;
    if (ok) return;
    c.elev += 4; if (c.elev > 80) { c.dist *= 0.85; c.elev = 30; }
  }
}
function groupStart(i) { let j = i; while (j > 0 && spec.scenes[j].visual?.cont) j--; return j; }
function getBuilt(i) {
  if (spec.scenes[i].visual?.cont) { const g0 = groupStart(i); const b = getBuilt(g0); built.set(i, b); return b; }
  if (!built.has(i)) {
    const sc = spec.scenes[i]; const v = sc.visual || {};
    const fn = B[v.type] || B.summary3d;
    const b = fn(v, sc); b.group.visible = false; scene.add(b.group); built.set(i, b);
    if (themeName === 'voxel' && v.type === 'vx') vxClearCam(b.cam);
  }
  return built.get(i);
}
function sceneAt(t) {
  const ss = tl.scenes; for (const s of ss) if (t >= s.start && t < s.end) return s; return ss[ss.length - 1];
}
function camPose(b, lt, D, t) {
  const c = b.cam; const az = (c.azim + (c.drift ?? 7) * Math.sin(t * 0.22)) * Math.PI / 180;
  const el = ((themeName === 'voxel' ? c.elev * 0.65 : c.elev) + 2 * Math.sin(t * 0.17)) * Math.PI / 180;
  const dist = c.dist * (themeName === 'voxel' ? 1.6 : DIST_SCALE) * (1 - 0.05 * clamp(lt / D));
  const tx = c.tx || 0, tz = c.tz || 0;
  const target = new THREE.Vector3(tx, c.ty, tz);
  const pos = new THREE.Vector3(tx + Math.sin(az) * Math.cos(el) * dist, c.ty + Math.sin(el) * dist, tz + Math.cos(az) * Math.cos(el) * dist);
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
    } else if (it.kind === 'bigtitle') {
      const sc2 = eBack((lt - (it.delay || 0)) / 0.5);
      html += `<div class="bigtitle" style="top:${it.y}px;opacity:${k};transform:translate(-50%,-50%) scale(${it.small ? 0.7 * sc2 : sc2}) rotate(-4deg)">
        <div class="bt-series">${it.series || ''}</div><div class="bt-main" style="font-size:${Math.min(210, Math.floor(1500 / String(it.title).length))}px">${it.title}</div></div>`;
    } else if (it.kind === 'ring') {
      const [x, y] = project(it.obj, it.local);
      html += `<div style="position:absolute;left:${x}px;top:${y}px;width:${it.w}px;height:${it.h}px;transform:translate(-50%,-50%) scale(${lerp(1.3, 1, k)});opacity:${k};border:8px solid ${it.color};border-radius:${it.h / 2}px;box-shadow:0 0 18px ${it.color}88"></div>`;
    } else if (it.kind === 'circlemark') {
      const [x, y] = project(it.obj, it.local); const r = it.r; const c = 2 * Math.PI * r;
      lines += `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#eb4d4b" stroke-width="22" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - it.prog)}" transform="rotate(-90 ${x} ${y})" opacity="0.92"/>`;
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
    if (spec.sub_style === 'telop') {
      const inner2 = sc_.map((c) => {
        const on = active >= 0 && c === chunks[active] && t <= c.end + 0.35;
        const pop = on ? 1 + 0.12 * (1 - eOut((t - c.start) / 0.18)) : 1;
        return `<span class="tchunk ${on ? 'on' : (c.start <= t ? 'done' : '')}" style="transform:scale(${on ? pop : 1})">${esc(c.display)}</span>`;
      }).join('');
      const who = sc.speaker === 'student' ? '<span class="tspk" style="background:#f28fb1">生徒</span>' : (sc.speaker === 'teacher' ? '<span class="tspk" style="background:#2bb3a3">先生</span>' : '');
      const longest = Math.max(...sc_.map((c) => c.display.length)); const total = sc_.reduce((n, c) => n + c.display.length, 0);
      const fs = Math.min(74, Math.floor(760 / (longest + 0.6)), Math.floor(1500 / (total + 2)));
      html += `<div class="telop" style="top:${(SUB_TOP + SUB_BOTTOM) / 2}px;--fs:${fs}px">${who}<div>${inner2}</div></div>`;
    }
    const spk = sc.speaker === 'student' ? '<div class="spk" style="background:#f28fb1;color:#111827">生徒</div>'
      : (sc.speaker === 'teacher' ? '<div class="spk" style="background:#2bb3a3;color:#fff">先生</div>' : '');
    const border = sc.speaker === 'student' ? 'border:5px solid #f28fb1;' : '';
    if (spec.sub_style !== 'telop') html += `<div class="sub" id="subbox" style="top:${(SUB_TOP + SUB_BOTTOM) / 2}px;transform:translateY(-50%);${border}">${spk}${inner}</div>`;
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
  const s = sceneAt(t); const i = s.index;
  const g0 = groupStart(i); let gEnd = i; while (gEnd + 1 < spec.scenes.length && spec.scenes[gEnd + 1].visual?.cont) gEnd++;
  const lt = t - tl.scenes[g0].start; const D = tl.scenes[gEnd].end - tl.scenes[g0].start;
  const cur = getBuilt(i);
  if (themeName === 'voxel') {
    animVoxel(t, cur.snow);
    const sunset = cur.sunset ? clamp(lt / 2) : 0;
    sunLight.color.setRGB(1, lerp(0.94, 0.62, sunset), lerp(0.85, 0.42, sunset)); sunLight.intensity = lerp(3.0, 2.2, sunset);
    scene.fog.color.setRGB(lerp(0.83, 0.98, sunset), lerp(0.89, 0.78, sunset), lerp(0.94, 0.66, sunset));
  }
  for (const [j, b] of built) b.group.visible = j === i || (j === i - 1 && lt < 0.35);
  cur.group.visible = true;
  const fixedWorld = (themeName === 'diorama' && spec.scenes[i].visual?.type === 'dio') || (themeName === 'voxel' && spec.scenes[i].visual?.type === 'vx');
  const pop = eBack(lt / 0.5); cur.group.scale.setScalar(fixedWorld ? 1 : Math.max(0.001, lerp(0.75, 1, pop)));
  if (DIO.town) animTown(t);
  cur.update(lt, D, t);
  let pose = camPose(cur, lt, D, t);
  if (g0 > 0 && lt < (themeName === 'diorama' || themeName === 'voxel' ? 0.9 : 0.6)) {
    const pg = groupStart(g0 - 1); const prev = getBuilt(g0 - 1); const Dp = tl.scenes[g0 - 1].end - tl.scenes[pg].start;
    if (lt < 0.35 && !fixedWorld) { prev.group.visible = true; prev.group.scale.setScalar(Math.max(0.001, 1 - eOut(lt / 0.3))); prev.update(Dp + lt, Dp, t); }
    else if (fixedWorld) prev.group.visible = false;
    const pp = camPose(prev, Dp, Dp, t); const k = eInOut(lt / (fixedWorld ? 0.9 : 0.6));
    pose = { pos: pp.pos.clone().lerp(pose.pos, k), target: pp.target.clone().lerp(pose.target, k) };
  }
  camera.position.copy(pose.pos); camera.lookAt(pose.target);
  if (themeName === 'voxel') { sunLight.target.position.copy(pose.target); sunLight.position.copy(pose.target).add(new THREE.Vector3(30, 42, 22)); }
  // keep the composition centred between the subtitles and the bottom safe line
  camera.setViewOffset(W, H, 0, -40, W, H); camera.updateProjectionMatrix();
  const isPhoto = spec.scenes[i].visual?.type === 'photo';
  photoEl.style.display = isPhoto ? 'block' : 'none';
  renderer.domElement.style.visibility = isPhoto ? 'hidden' : 'visible';
  if (isPhoto) { renderPhoto(i, lt, D); overlayHTML(cur.overlay(lt, D, t), lt, s, spec.scenes[i], t); return true; }
  if (board) {
    const bd = cur.board ? cur.board(lt) : null;
    drawBoard(bd ? bd.lines : null, bd ? bd.prog : 1, `${i}:${bd ? Math.round(clamp(bd.prog) * 30) : 'x'}`);
  }
  if (composer) composer.render(); else renderer.render(scene, camera);
  overlayHTML(cur.overlay(lt, D, t), lt, s, spec.scenes[i], t);
  return true;
};

init().catch((e) => { window.initError = String(e && e.stack || e); });

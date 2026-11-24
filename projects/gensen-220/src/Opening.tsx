import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, Easing, staticFile, useCurrentFrame } from 'remotion';
import { FPS, openingShots, Shot } from './timeline';
import { loadFonts } from './fonts';
import imgs from '../public/img/available.json';

loadFonts();
const C = { ink: '#14171d', paper: '#f4efe4', red: '#c8402f', gold: '#c9a24a', navy: '#1d2940', mute: '#8a8f99' };
const SANS = '"Noto Sans JP", sans-serif', MIN = '"Shippori Mincho", serif';
const ease = Easing.bezier(0.33, 0, 0.2, 1);
const ramp = (f: number, a: number, b: number, from = 0, to = 1) => interpolate(f, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
const sec = (s: number) => Math.round(s * FPS);

// ---------- shared overlays ----------
const Subtitle: React.FC<{ text: string; dur: number }> = ({ text, dur }) => {
  const f = useCurrentFrame(); const o = Math.min(ramp(f, 0, 6), 1 - ramp(f, dur - 6, dur));
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 72 }}>
      <div style={{ opacity: o, fontFamily: SANS, fontWeight: 700, fontSize: 42, color: '#fff', letterSpacing: '0.04em', textShadow: '0 2px 10px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9)', maxWidth: 1500, textAlign: 'center', lineHeight: 1.45 }}>{text}</div>
    </AbsoluteFill>
  );
};
const KIND: Record<string, { label: string; color: string }> = { zukai: { label: '図解', color: '#6f87b8' }, shiryo: { label: '史料', color: '#b08a3e' }, saigen: { label: '再現イメージ', color: '#a0524a' } };
const Tag: React.FC<{ kind: keyof typeof KIND; credit?: string; src?: string; dur: number }> = ({ kind, credit, src, dur }) => {
  const f = useCurrentFrame(); const o = Math.min(ramp(f, 4, 14), 1 - ramp(f, dur - 8, dur)) * 0.92; const k = KIND[kind];
  return (
    <>
      <div style={{ position: 'absolute', left: 48, top: 40, opacity: o, display: 'flex', gap: 12, alignItems: 'center', fontFamily: SANS, fontSize: 20, fontWeight: 700, color: '#f3efe6' }}>
        <span style={{ border: `1.5px solid ${k.color}`, color: '#fff', background: `${k.color}cc`, padding: '3px 12px', borderRadius: 4, letterSpacing: '0.1em' }}>{k.label}</span>
        {credit ? <span style={{ textShadow: '0 1px 6px rgba(0,0,0,.8)', fontWeight: 500 }}>{credit}</span> : null}
      </div>
      {src ? <div style={{ position: 'absolute', right: 48, top: 44, opacity: o * 0.8, fontFamily: SANS, fontSize: 18, fontWeight: 500, color: '#e8e2d4', textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>出典 {src}</div> : null}
    </>
  );
};
const Grain: React.FC<{ amount: number }> = ({ amount }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ backgroundImage: `url(${staticFile('tex/grain.png')})`, backgroundSize: '960px 540px', backgroundPosition: `${(f * 137) % 960}px ${(f * 71) % 540}px`, mixBlendMode: 'overlay', opacity: amount }} />;
};
const Paper: React.FC<{ amount: number }> = ({ amount }) => (
  <AbsoluteFill style={{ backgroundImage: `url(${staticFile('tex/paper.png')})`, backgroundSize: 'cover', mixBlendMode: 'multiply', opacity: amount }} />
);

// ---------- O1–O5: the modern payslip, then time runs backwards ----------
const ROWS: [string, number, 'pay' | 'ded' | 'tax'][] = [['基本給', 330, 'pay'], ['時間外手当', 120, 'pay'], ['健康保険料', 120, 'ded'], ['厚生年金保険料', 190, 'ded'], ['雇用保険料', 40, 'ded'], ['所得税', 70, 'tax'], ['住民税', 100, 'ded']];
const Payslip: React.FC<{ dim: number; focus: number; mark: number }> = ({ dim, focus, mark }) => (
  <svg width={760} height={900} viewBox="0 0 760 900">
    <defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="24" stdDeviation="28" floodColor="#000" floodOpacity="0.45" /></filter></defs>
    <rect x="20" y="20" width="720" height="860" rx="10" fill="#fbf9f4" filter="url(#sh)" />
    <text x="70" y="110" fontFamily={MIN} fontWeight={800} fontSize="46" fill={C.ink}>給 与 明 細</text>
    <text x="690" y="108" textAnchor="end" fontFamily={SANS} fontWeight={500} fontSize="22" fill={C.mute}>2026年11月分（例）</text>
    <line x1="70" y1="140" x2="690" y2="140" stroke={C.ink} strokeWidth="2" />
    <text x="70" y="196" fontFamily={SANS} fontWeight={700} fontSize="22" fill={C.mute} letterSpacing="4">支給</text>
    <text x="70" y="452" fontFamily={SANS} fontWeight={700} fontSize="22" fill={C.mute} letterSpacing="4">控除</text>
    {ROWS.map(([name, w, k], i) => {
      const y = i < 2 ? 250 + i * 70 : 506 + (i - 2) * 66; const isTax = k === 'tax';
      const op = isTax ? 1 : 1 - dim * 0.65 - focus * 0.25;
      return (
        <g key={name} opacity={op}>
          {isTax ? <rect x="58" y={y - 40} width={644 * mark} height="56" rx="6" fill={C.red} opacity={0.12} /> : null}
          <text x="80" y={y} fontFamily={SANS} fontWeight={700} fontSize="30" fill={isTax ? (mark > 0 ? C.red : C.ink) : C.ink}>{name}</text>
          <rect x={680 - w} y={y - 18} width={w} height="12" rx="6" fill={k === 'pay' ? '#c9cfd9' : isTax ? C.red : '#7d8db0'} />
          <line x1="70" y1={y + 22} x2="690" y2={y + 22} stroke="#e8e2d6" strokeWidth="1.5" />
        </g>
      );
    })}
    {/* red pen underline on the income-tax row */}
    <path d="M 74 858 L 74 858" />
    <path d={`M 76 ${506 + 3 * 66 + 12} q 160 8 300 0`} stroke={C.red} strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="320" strokeDashoffset={320 * (1 - mark)} />
    <text x="70" y="842" fontFamily={SANS} fontWeight={700} fontSize="26" fill={C.ink} opacity={1 - dim * 0.6}>差引支給額</text>
    <rect x="430" y="822" width="250" height="14" rx="7" fill={C.navy} opacity={1 - dim * 0.6} />
  </svg>
);
const Icon: React.FC<{ kind: 'calc' | 'office'; label: string; show: number; cross: number }> = ({ kind, label, show, cross }) => (
  <div style={{ opacity: show, transform: `translateY(${(1 - show) * 30}px)`, textAlign: 'center', width: 300 }}>
    <svg width="190" height="190" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="56" fill="#fbf9f4" />
      {kind === 'calc' ? <g fill="none" stroke={C.navy} strokeWidth="4" strokeLinejoin="round"><rect x="36" y="24" width="48" height="72" rx="6" /><rect x="44" y="32" width="32" height="14" /><path d="M46 60h4M58 60h4M70 60h4M46 72h4M58 72h4M70 72h4M46 84h4M58 84h4M70 84h4" /></g>
        : <g fill="none" stroke={C.navy} strokeWidth="4" strokeLinejoin="round"><path d="M24 50 L60 28 L96 50 Z" /><path d="M32 56v30M48 56v30M72 56v30M88 56v30M22 92h76" /></g>}
      <path d="M30 30 L90 90 M90 30 L30 90" stroke="#9aa0aa" strokeWidth="8" strokeLinecap="round" strokeDasharray="90" strokeDashoffset={90 * (1 - cross)} />
    </svg>
    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 32, color: '#f3efe6', marginTop: 10, textDecoration: cross > 0.6 ? 'line-through' : 'none', textDecorationColor: '#9aa0aa' }}>{label}</div>
  </div>
);
const Flow: React.FC<{ t: number; show: number }> = ({ t, show }) => {
  // company -> you (gold coins), tax part (red) arcs up to the state
  const coin = (i: number) => { const k = Math.min(1, Math.max(0, (t - 0.25 - i * 0.12) / 1.2)); return ease(k); };
  const tax = Math.min(1, Math.max(0, (t - 1.2) / 1.5)); const te = ease(tax);
  const ax = 150, bx = 620, cx = 1050; const arc = (k: number) => ({ x: bx + (cx - bx) * k, y: 330 - Math.sin(k * Math.PI) * 190 });
  const node = (x: number, label: string, red = false, kind = 'b') => (
    <g transform={`translate(${x},330)`}>
      <circle r="78" fill="#fbf9f4" />
      {kind === 'b' ? <g fill="none" stroke={C.navy} strokeWidth="5" strokeLinejoin="round" transform="translate(-30,-38)"><rect x="6" y="4" width="48" height="70" /><path d="M16 18h10M34 18h10M16 34h10M34 34h10M16 50h10M34 50h10M26 74V62h8v12" /></g>
        : kind === 'p' ? <g fill="none" stroke={C.navy} strokeWidth="5" strokeLinecap="round"><circle cx="0" cy="-16" r="14" /><path d="M-26 34c4-20 14-28 26-28s22 8 26 28" /></g>
          : <g fill="none" stroke={C.red} strokeWidth="5" strokeLinejoin="round"><path d="M-40 -8 L0 -34 L40 -8 Z" /><path d="M-30 -2v30M-12 -2v30M12 -2v30M30 -2v30M-42 34h84" /></g>}
      <text y="128" textAnchor="middle" fontFamily={SANS} fontWeight={700} fontSize="32" fill={red ? '#f0a597' : '#f3efe6'}>{label}</text>
    </g>
  );
  const p = arc(te);
  return (
    <svg width={1200} height={560} viewBox="0 0 1200 560" style={{ opacity: show }}>
      <path d={`M ${ax + 90} 330 L ${bx - 90} 330`} stroke={C.gold} strokeWidth="4" strokeDasharray="10 12" opacity={ramp(t * 30, 0, 12)} />
      <path d={`M ${bx} 250 Q ${(bx + cx) / 2} ${330 - 380} ${cx} 250`} stroke={C.red} strokeWidth="4" fill="none" strokeDasharray="10 12" opacity={ramp(t * 30, 30, 45)} />
      {node(ax, '会社')}{node(bx, 'あなた', false, 'p')}{node(cx, '国', true, 'g')}
      {[0, 1, 2].map((i) => { const k = coin(i); return <circle key={i} cx={ax + 90 + (bx - ax - 200) * k + i * 18} cy={318 + i * 4} r="22" fill={C.gold} stroke="#a7843a" strokeWidth="3" opacity={k > 0 && k < 1 ? 1 : 0} />; })}
      {tax > 0 && tax < 1 ? <circle cx={p.x} cy={p.y - 80} r="24" fill={C.red} stroke="#8e2a1f" strokeWidth="3" /> : null}
      <text x={(bx + cx) / 2} y="90" textAnchor="middle" fontFamily={SANS} fontWeight={700} fontSize="30" fill="#f0a597" opacity={ramp(t * 30, 36, 50)}>先に差し引いて納める</text>
    </svg>
  );
};
const Modern: React.FC<{ shots: Shot[] }> = ({ shots }) => {
  const f = useCurrentFrame(); const [o1, o2, o3, o4, o5] = shots; const at = (s: Shot) => f - (s.from - o1.from);
  const t2 = at(o2), t3 = at(o3), t4 = at(o4), t5 = at(o5);
  const zoom = interpolate(f, [0, o5.from - o1.from], [1.0, 1.06], { extrapolateRight: 'clamp' });
  const focus = ramp(t2, 0, 20); const mark = ramp(t2, sec(1.2), sec(2.0));
  const slide = ramp(t3, 0, 24); const icons = ramp(t3, 10, 30) * (1 - ramp(t4, 0, 14)); const cross1 = ramp(t3, sec(1.3), sec(1.8)), cross2 = ramp(t3, sec(2.6), sec(3.1));
  const flow = ramp(t4, 6, 24) * (1 - ramp(t5, 0, 18));
  const fade = ramp(t5, 0, 20); const word = ramp(t5, 8, 30);
  const sepia = ramp(t5, sec(1.2), o5.dur); // time runs backwards
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 40%, #2a2e36 0%, #14161b 70%)', filter: `sepia(${sepia * 0.9}) saturate(${1 - sepia * 0.3})` }}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: ramp(f, 0, 24) * (1 - fade) * (1 - ramp(t4, 0, 16)) }}>
        <div style={{ transform: `translateX(${-420 * slide}px) scale(${0.84 * zoom * (1 - 0.2 * slide)}) rotate(${-2 + slide * 1}deg)`, marginTop: -60 }}>
          <Payslip dim={Math.max(slide, ramp(t4, 0, 10))} focus={focus} mark={mark} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 40, paddingRight: 140, opacity: icons }}>
        <Icon kind="calc" label="自分で計算" show={ramp(t3, 10, 26)} cross={cross1} />
        <Icon kind="office" label="税務署で納付" show={ramp(t3, 26, 42)} cross={cross2} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', marginTop: -60 }}>
        <Flow t={Math.max(0, t4) / FPS} show={flow} />
      </AbsoluteFill>
      {/* the word that survives the rewind */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <svg width="900" height="900" viewBox="-450 -450 900 900" style={{ position: 'absolute', opacity: word * 0.35 }}>
          <circle r="380" fill="none" stroke="#d9c8a0" strokeWidth="2" />
          {Array.from({ length: 60 }, (_, i) => <line key={i} x1="0" y1="-380" x2="0" y2={i % 5 ? -365 : -345} stroke="#d9c8a0" strokeWidth={i % 5 ? 2 : 4} transform={`rotate(${i * 6})`} />)}
          <line x1="0" y1="0" x2="0" y2="-300" stroke="#d9c8a0" strokeWidth="6" transform={`rotate(${-t5 * 9})`} />
          <line x1="0" y1="0" x2="0" y2="-200" stroke="#d9c8a0" strokeWidth="8" transform={`rotate(${-t5 * 0.75})`} />
        </svg>
        <div style={{ opacity: word, fontFamily: MIN, fontWeight: 800, fontSize: 150, color: '#f3ead6', letterSpacing: '0.12em', textShadow: '0 4px 30px rgba(0,0,0,.6)', transform: `scale(${1.06 - 0.06 * word})` }}>源泉徴収</div>
      </AbsoluteFill>
      <Paper amount={sepia * 0.85} />
      <Grain amount={0.06 + sepia * 0.12} />
    </AbsoluteFill>
  );
};

// ---------- O6: London (layered parallax) ----------
const Print: React.FC<{ src: string; dur: number; bands?: [number, number, number][]; zoom: [number, number]; origin: string; pan?: [number, number] }> = ({ src, dur, bands, zoom, origin, pan = [0, 0] }) => {
  const f = useCurrentFrame(); const k = interpolate(f, [0, dur], [0, 1], { extrapolateRight: 'clamp' }); const z = zoom[0] + (zoom[1] - zoom[0]) * k;
  const px = pan[0] + (pan[1] - pan[0]) * k;
  const layer = (top: number, bottom: number, speed: number, i: number) => {
    const mask = `linear-gradient(180deg, transparent ${top - 6}%, #000 ${top}%, #000 ${bottom}%, transparent ${bottom + 6}%)`;
    return <AbsoluteFill key={i} style={{ WebkitMaskImage: mask, maskImage: mask, transform: `translateX(${px * speed}px)` }}><Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></AbsoluteFill>;
  };
  return (
    <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: origin }}>
      {bands ? <><AbsoluteFill><Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></AbsoluteFill>{bands.map(([a, b, s], i) => layer(a, b, s, i))}</>
        : <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </AbsoluteFill>
  );
};
const Fallback: React.FC<{ title: string }> = ({ title }) => (
  <AbsoluteFill style={{ background: '#2b2318', justifyContent: 'center', alignItems: 'center', fontFamily: MIN, fontSize: 48, color: '#e7d9b8' }}>{title}（画像取得待ち）</AbsoluteFill>
);

// ---------- O8: title ----------
const Title: React.FC<{ dur: number; lineFrom: number }> = ({ dur, lineFrom }) => {
  const f = useCurrentFrame(); const years = ['1799', '1803', '1887', '1899', '1940', '1947', '2026'];
  const a = ramp(f, lineFrom + 6, lineFrom + 30), b = ramp(f, lineFrom + sec(2.6), lineFrom + sec(3.4)); const rule = ramp(f, lineFrom + sec(2.2), lineFrom + sec(3.2));
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, #3a2f22 0%, #1a140d 75%)' }}>
      <AbsoluteFill style={{ justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: 220, transform: `translateX(${600 - f * 2.2}px)`, fontFamily: MIN, fontWeight: 800, fontSize: 190, color: '#c9a24a', opacity: 0.09, whiteSpace: 'nowrap' }}>{years.map((y) => <span key={y}>{y}</span>)}</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
        <div style={{ opacity: a, transform: `translateY(${(1 - a) * 18}px)`, fontFamily: MIN, fontWeight: 800, fontSize: 82, color: '#f3ead6', letterSpacing: '0.06em', textShadow: '0 4px 24px rgba(0,0,0,.6)' }}>あなたの給料から税金が引かれる理由</div>
        <div style={{ width: 900 * rule, height: 2, background: '#c9a24a', margin: '34px 0 30px', opacity: 0.8 }} />
        <div style={{ opacity: b, fontFamily: MIN, fontWeight: 800, fontSize: 54, color: '#d8b766', letterSpacing: '0.3em' }}>源泉徴収 220年の歴史</div>
      </AbsoluteFill>
      <Paper amount={0.75} />
      <Grain amount={0.14} />
    </AbsoluteFill>
  );
};

export const Opening: React.FC = () => {
  const { shots } = openingShots(); const S = Object.fromEntries(shots.map((s) => [s.key, s])) as Record<string, Shot>;
  const modernFrom = S.O1.from, modernDur = S.O5.from + S.O5.dur - S.O1.from;
  const L = imgs as Record<string, boolean>;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Sequence from={modernFrom} durationInFrames={modernDur}><Modern shots={shots} /></Sequence>
      <Sequence from={S.O6.from} durationInFrames={S.O6.dur + 12}>
        <AbsoluteFill style={{ opacity: 1 }}>
          {L.london ? <Print src="img/london.jpg" dur={S.O6.dur} zoom={[1.08, 1.16]} origin="55% 55%" pan={[40, -60]} bands={[[0, 42, 0.3], [36, 70, 0.7], [64, 100, 1.2]]} /> : <Fallback title="ロンドン 1809年" />}
          <Paper amount={0.35} /><Grain amount={0.1} />
        </AbsoluteFill>
        <Tag kind="shiryo" credit="トマス・ローランドソン《A View of London from the Thames》1809年／メトロポリタン美術館（CC0）" dur={S.O6.dur} />
      </Sequence>
      <Sequence from={S.O7.from} durationInFrames={S.O7.dur + 12}>
        <AbsoluteFill>
          {L.plumpudding ? <Print src="img/plumpudding.jpg" dur={S.O7.dur} zoom={[1.02, 1.5]} origin="28% 42%" /> : <Fallback title="ギルレイ 1805年" />}
          <AbsoluteFill style={{ background: 'linear-gradient(100deg, transparent 30%, rgba(255,236,190,.18) 45%, transparent 60%)', transform: `translateX(${0}px)` }} />
          <Paper amount={0.3} /><Grain amount={0.1} />
        </AbsoluteFill>
        <Tag kind="shiryo" credit="ジェイムズ・ギルレイ《The Plumb-pudding in danger》1805年／メトロポリタン美術館（CC0）　左：ピット　右：ナポレオン" dur={S.O7.dur} />
      </Sequence>
      <Sequence from={S.O8.from} durationInFrames={S.O8.dur}><Title dur={S.O8.dur} lineFrom={S.O8.lineFrom ?? 0} /></Sequence>
      {/* crossfades between historical shots */}
      {[S.O6.from, S.O7.from, S.O8.from].map((t, i) => (
        <Sequence key={i} from={t - 6} durationInFrames={18}><Dip /></Sequence>
      ))}
      {/* labels for the modern part */}
      {['O1', 'O2', 'O3', 'O4', 'O5'].map((k) => <Sequence key={k} from={S[k].from} durationInFrames={S[k].dur}><Tag kind="zukai" src={S[k].line?.src || undefined} dur={S[k].dur} /></Sequence>)}
      {/* narration + subtitles */}
      {shots.filter((s) => s.line).map((s) => (
        <Sequence key={s.key + 'n'} from={s.from + (s.lineFrom ?? 0)} durationInFrames={Math.round(s.line!.dur * FPS) + 8}>
          <Audio src={staticFile(`audio/${s.line!.id}.wav`)} />
          <Subtitle text={s.line!.text} dur={Math.round(s.line!.dur * FPS) + 8} />
        </Sequence>
      ))}
      {/* sound design (no music) */}
      <Sequence from={S.O1.from}><Audio src={staticFile('sfx/paper.wav')} volume={0.5} /></Sequence>
      <Sequence from={S.O2.from + (S.O2.lineFrom ?? 0) + sec(1.2)}><Audio src={staticFile('sfx/pen.wav')} volume={0.45} /></Sequence>
      <Sequence from={S.O3.from + sec(1.3)}><Audio src={staticFile('sfx/xmark.wav')} volume={0.35} /></Sequence>
      <Sequence from={S.O3.from + sec(2.6)}><Audio src={staticFile('sfx/xmark.wav')} volume={0.35} /></Sequence>
      <Sequence from={S.O4.from + sec(0.3)}><Audio src={staticFile('sfx/coins.wav')} volume={0.4} /></Sequence>
      <Sequence from={S.O5.from + sec(1.0)}><Audio src={staticFile('sfx/rewind.wav')} volume={0.5} /></Sequence>
      <Sequence from={S.O6.from} durationInFrames={S.O6.dur + S.O7.dur}><Audio src={staticFile('sfx/wind.wav')} volume={0.35} loop /></Sequence>
      <Sequence from={S.O7.from + sec(0.6)}><Audio src={staticFile('sfx/cannon.wav')} volume={0.55} /></Sequence>
      <Sequence from={S.O8.from + (S.O8.lineFrom ?? 0) + sec(2.6)}><Audio src={staticFile('sfx/stamp.wav')} volume={0.45} /></Sequence>
      <Sequence from={S.O8.from + (S.O8.lineFrom ?? 0) + sec(2.6)}><Audio src={staticFile('sfx/boom.wav')} volume={0.35} /></Sequence>
    </AbsoluteFill>
  );
};
const Dip: React.FC = () => { const f = useCurrentFrame(); return <AbsoluteFill style={{ background: '#000', opacity: interpolate(f, [0, 6, 12, 18], [0, 1, 1, 0]) }} />; };

// Builds shot timings from the real VOICEVOX durations (public/timing.json).
import timing from '../public/timing.json';
export const FPS = 30;
export type Line = { id: string; text: string; tag: string; src: string; dur: number };
export type Shot = { key: string; from: number; dur: number; line?: Line; lineFrom?: number };

// Opening plan: per-line lead-in gaps and extra picture-only holds (seconds).
const OPENING: { key: string; line?: number; lead?: number; hold?: number }[] = [
  { key: 'O1', line: 0, lead: 0.8, hold: 0.6 },
  { key: 'O2', line: 1, lead: 0.3, hold: 0.8 },
  { key: 'O3', line: 2, lead: 0.3, hold: 0.8 },
  { key: 'O4', line: 3, lead: 0.3, hold: 1.4 },
  { key: 'O5', line: 4, lead: 0.3, hold: 1.6 },
  { key: 'O6', line: 5, lead: 3.2, hold: 0.6 },   // London: picture first, then narration
  { key: 'O7', hold: 6.0 },                        // Gillray: picture + cannon, no narration
  { key: 'O8', line: 6, lead: 1.2, hold: 5.0 },   // title
];
export function openingShots(): { shots: Shot[]; total: number } {
  const lines = (timing as Record<string, Line[]>)['0'];
  let t = 0; const shots: Shot[] = [];
  for (const p of OPENING) {
    const ln = p.line !== undefined ? lines[p.line] : undefined;
    const dur = (p.lead ?? 0) + (ln ? ln.dur : 0) + (p.hold ?? 0);
    shots.push({ key: p.key, from: Math.round(t * FPS), dur: Math.round(dur * FPS), line: ln, lineFrom: Math.round((p.lead ?? 0) * FPS) });
    t += dur;
  }
  return { shots, total: Math.round(t * FPS) };
}

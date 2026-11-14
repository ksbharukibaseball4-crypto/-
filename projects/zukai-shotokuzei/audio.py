import json, sys, wave, subprocess
import numpy as np
sys.path.insert(0, '/home/user/-/.claude/skills/kinyu-kaisetsu-douga/scripts')
import sfx as A, sfx_more as B
TL = json.load(open('timeline.json')); ST = [s['start'] for s in TL['scenes']]; DUR = TL['duration']
mix = np.zeros(int((DUR + 2) * A.SR), np.float32); used = set()
def put(t, x, g=0.7, name=None):
    i = int(max(0, t) * A.SR); n = min(len(x), len(mix) - i); mix[i:i + n] += x[:n] * g
    if name: used.add(name)
def cue(scenes, fn):
    S = [ST[i] - ST[scenes[0]] for i in scenes]; t0 = ST[scenes[0]]; fn(lambda dt, x, g=0.7, n=None: put(t0 + dt, x, g, n), S)
PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349]
cue([0], lambda p, S: [p(0.0, B.reverse_swell(660, 0.6), .5, 'reverse'), p(0.15, B.pop(600), .6, 'pop'), p(0.55, B.glass(1319), .5, 'glass'), p(0.6, A.chord(), .45, 'chord'), p(1.3, B.swoop_up(0.45), .5, 'swoop_up'), p(1.8, B.kalimba(1047), .6, 'kalimba')])
cue([1, 2, 3], lambda p, S: [p(0.05, A.whoosh(0.35, 1), .6, 'whoosh'), p(0.3, B.pop(520), .6), p(0.7, B.snap(), .6, 'snap'), p(S[1] - 0.3, B.paper_slide(0.5), .6, 'paper'),
    *[p(S[1] + i * 0.18, B.click(i + 1), .55, 'click') for i in range(5)], p(S[2] + 0.2, B.scribble(0.55), .6, 'scribble'), p(S[2] + 0.9, B.pluck(392), .6, 'pluck'), p(S[2] + 1.2, A.woodblock(950), .5, 'woodblock')])
cue([4], lambda p, S: [p(0.0, A.swish(2), .55, 'swish'), p(0.3, B.paper_slide(0.7, 3), .35), p(0.4, B.pop(480), .6), p(1.1, B.pop(820), .6), p(1.4, B.paper_slide(0.4, 4), .5), p(1.9, B.ding(), .5, 'ding'), p(2.2, A.tick(), .4, 'tick')])
cue([5], lambda p, S: [p(0.1, B.heartbeat(), .8, 'heartbeat'), *[p(0.8 + i * 0.6, B.pop(900 + i * 140, 0.09), .55) for i in range(3)], p(2.4, B.tape_stop(0.6), .5, 'tape_stop')])
cue([6, 7], lambda p, S: [p(0.05, A.whoosh(0.4, 4), .6), p(0.4, A.page(5), .6, 'page'), p(0.9, B.swoop_up(0.5), .35), p(S[1] + 0.1, B.pluck(523), .6), p(S[1] + 0.12, A.bell(1047), .25, 'bell'), p(S[1] + 1.4, B.pluck(659), .6), p(S[1] + 1.42, A.bell(1319), .25)])
cue([8, 9], lambda p, S: [p(0.05, B.click(9), .6), p(0.6, B.boom(), .7, 'boom'), p(0.62, A.stamp(), .45, 'stamp'), p(1.3, B.swoop_up(0.6), .4), p(S[1] + 0.2, B.pop(700), .6), p(S[1] + 0.25, B.shutter(), .5, 'shutter')])
cue([10, 11], lambda p, S: [p(0.05, A.swish(5), .5), *[p(0.5 + i * 0.25, A.marimba(f), .6, 'marimba') for i, f in enumerate([523, 659, 784])], p(S[1], B.pop(600), .6),
    *[p(S[1] + 0.5 + i * 0.25, A.coin(1.0 + i * 0.12), .5, 'coin') for i in range(3)], p(S[1] + 1.6, A.register(), .5, 'register')])
cue([12, 13], lambda p, S: [p(0.05, A.whoosh(0.3, 6), .5), p(0.3, A.page(7), .6), p(1.0, B.tick_roll(9, 0.05), .5, 'tick_roll'), p(1.7, A.coin(0.9), .55), *[p(0.8 + i * 0.7, A.woodblock(1200 + i * 200), .4) for i in range(2)], p(S[1] + 0.4, B.soft_error(), .55, 'soft_error')])
cue([14, 15], lambda p, S: [p(0.05, A.swish(8), .5), *[p(0.2 + i * 0.03, B.click(i + 20), .25) for i in range(27)], p(S[1] + 0.2, B.swoop_up(0.5), .45), *[p(S[1] + 0.25 + k * 0.1, B.kalimba(f), .35) for k, f in enumerate([784, 988, 1175])], p(S[1] + 0.5, B.pluck(587), .5)])
cue([16, 17, 18], lambda p, S: [p(0.05, A.whoosh(0.35, 9), .55), *[p(0.3 + i * 0.3, A.bubble(380 + i * 90), .55, 'bubble') for i in range(3)], p(S[1], A.swish(10), .4),
    p(S[1] + 0.3, A.coin(1.0), .55), p(S[1] + 0.55, A.coin(1.15), .55), p(S[1] + 0.9, B.swoop_up(0.7), .45), p(S[1] + 1.0, B.snap(14), .6), p(S[1] + 2.9, A.stamp(), .55), p(S[2] + 0.1, A.register(), .5)])
cue([19, 20], lambda p, S: [p(0.05, A.swish(11), .5), p(0.3, A.thud(3), .6, 'thud'), p(0.35, B.glass(1047), .45), p(S[1] + 0.1, B.success(), .55, 'success')])
cue([21, 22, 23, 24], lambda p, S: [p(0.2, B.paper_slide(0.5, 9), .55), p(S[1], B.boom(), .75), p(S[1] + 0.02, A.stamp(), .5), *[p(S[2] + 0.3 + i * 0.16, A.bubble(520 + i * 120), .5) for i in range(3)], p(S[2] + 0.7, B.kalimba(880), .55), p(S[3] + 0.3, A.whoosh(0.3, 12), .55)])
cue([25, 26, 27, 28, 29], lambda p, S: [p(0.05, A.swish(13), .5), *[p(0.3 + i * 0.08, A.marimba(PENTA[i] / 2), .32) for i in range(12)], p(S[1] + 0.2, B.scribble(0.7, 9), .55), p(S[1] + 0.4, B.pluck(440), .45),
    p(S[2] + 0.1, B.pop(760), .6), p(S[3], B.paper_slide(0.5, 11), .5), p(S[3] + 0.3, B.tick_roll(7), .45), p(S[3] + 1.2, A.alert(), .4, 'alert'), p(S[4] + 0.2, B.swoop_down(0.5), .5, 'swoop_down'), p(S[4] + 0.6, B.soft_error(), .45)])
cue([30, 31, 32], lambda p, S: [p(0.05, A.whoosh(0.3, 14), .5), p(0.3, B.tick_roll(38, 0.05), .35), p(2.2, B.ding(), .5), p(S[1], B.swoop_down(0.45), .45), p(S[1] + 0.3, B.success(), .5), p(S[2], B.swoop_up(0.45), .45), p(S[2] + 0.3, A.register(), .5)])
cue([33], lambda p, S: [p(0.1, B.click(30), .6), p(0.4, B.boom(), .75), p(0.42, A.stamp(), .5), p(1.2, B.pop(640), .6), p(1.25, A.page(15), .45)])
cue([34, 35, 36], lambda p, S: [p(0.05, A.swish(16), .5), *[p(0.3 + i * 0.35, B.paper_slide(0.4, 20 + i), .55) for i in range(3)], p(S[1] + 0.2, A.whoosh(0.4, 17), .45), p(S[1] + 0.6, B.click(40), .6), p(S[2] + 0.1, B.tick_roll(10), .45), p(S[2] + 0.6, B.ding(), .5)])
cue([37, 38, 39, 40], lambda p, S: [p(0.3, A.alert(), .45), p(S[1], B.pop(560), .6), p(S[1] + 0.6, A.coin(1.0), .55), p(S[1] + 0.7, B.swoop_up(0.6), .4), p(S[2] + 0.2, B.soft_error(), .6), p(S[2] + 0.22, A.thud(5), .55), p(S[2] + 0.4, B.swoop_down(0.6), .45),
    *[p(S[3] + 0.2 + i * 0.3, A.woodblock(700 + i * 180), .55) for i in range(3)], p(S[3] + 1.0, B.success(), .5), p(S[3] + 1.2, B.glass(1568), .4)])
cue([41, 42, 43], lambda p, S: [p(0.1, B.chime_down(), .5, 'chime'), p(S[1] + 0.1, B.kalimba(784), .55), p(S[2] + 0.1, A.chord(), .45), p(S[2] + 0.15, A.sparkle(), .5, 'sparkle')])
cue([44], lambda p, S: [p(0.1, A.page(21), .5)])
mix = np.clip(mix[:int(DUR * A.SR)], -1, 1)
with wave.open('audio.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(A.SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('sound types used:', len(used), sorted(used))

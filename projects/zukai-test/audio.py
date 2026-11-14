import numpy as np, wave, sys, subprocess
sys.path.insert(0, '/home/user/-/.claude/skills/kinyu-kaisetsu-douga/scripts'); import sfx
mix = np.zeros(int(16 * sfx.SR), np.float32)
def put(t, x, g=1.0):
    i = int(t * sfx.SR); n = min(len(x), len(mix) - i); mix[i:i + n] += x[:n] * g
put(0.1, sfx.whoosh(0.4), 0.7)
for i in range(6): put(0.75 + i * 0.16, sfx.typekey(i), 0.6)
put(2.0, sfx.swish(2), 0.6); put(2.8, sfx.marimba(784), 0.8)
put(5.0, sfx.whoosh(0.35, 2), 0.7)
for i, d in enumerate([0.3, 0.5, 0.7]): put(5 + d, sfx.bubble(420 + i * 60), 0.6)
put(6.2, sfx.coin(1.0), 0.6); put(6.45, sfx.coin(1.1), 0.6); put(7.3, sfx.coin(0.8), 0.6); put(7.6, sfx.bell(), 0.5); put(9.1, sfx.thud(), 0.5)
put(10.0, sfx.whoosh(0.4, 3), 0.7)
for i, f in enumerate([523, 587, 659, 698, 784, 880, 988]): put(10.6 + i * 0.22, sfx.marimba(f), 0.7)
put(13.0, sfx.chord(), 0.6)
mix = np.clip(mix, -1, 1)
with wave.open('a.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sfx.SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
for m in ['h', 'v']:
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f'{m}.mp4', '-i', 'a.wav', '-af', 'loudnorm=I=-18:TP=-1.5', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', '15', f'zukai_{m}.mp4'], check=True)
print('ok')

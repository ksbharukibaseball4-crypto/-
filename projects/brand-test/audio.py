import numpy as np, wave, sys, subprocess
sys.path.insert(0, '/home/user/-/.claude/skills/kinyu-kaisetsu-douga/scripts'); import sfx as A, sfx_more as B
SR = A.SR
def logo(outro=False):
    x = np.zeros(int((3.2 if outro else 2.6) * SR), np.float32)
    def put(t, y, g): i = int(t * SR); n = min(len(y), len(x) - i); x[i:i + n] += y[:n] * g
    put(0.0, B.reverse_swell(784, 0.5), .5); put(0.1, B.swoop_up(0.5), .3)
    for k, f in enumerate([784, 1047, 1319]): put(0.4 + k * 0.14, B.kalimba(f, 1.4), .7)   # 3-note sound logo (G-C-E)
    put(0.4, B.boom(1.2), .55); put(0.95, A.sparkle(), .4)
    if outro: put(1.5, B.pop(700), .6); put(1.55, A.chord((1047, 1319, 1568), 1.4), .4)
    return x
full = np.frombuffer(wave.open('/home/user/-/out/zk/audio.wav').readframes(10**9), np.int16).astype(np.float32) / 32767
main = full[int(49.0 * SR):int(63.6 * SR)].copy(); fade = int(0.3 * SR); main[:fade] *= np.linspace(0, 1, fade); main[-fade:] *= np.linspace(1, 0, fade)
mix = np.concatenate([logo(), main, logo(True)])
with wave.open('a.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
for m in ['h', 'v']:
    open(f'list_{m}.txt', 'w').write(''.join(f"file '{p}_{m}.mp4'\n" for p in ['intro', 'main', 'outro']))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'list_{m}.txt', '-i', 'a.wav', '-map', '0:v', '-map', '1:a', '-af', 'loudnorm=I=-18:TP=-1.5',
                    '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', f'brand_{m}.mp4'], check=True)
print('ok')

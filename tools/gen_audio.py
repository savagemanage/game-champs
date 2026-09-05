#!/usr/bin/env python3
"""
gen_audio.py - Original synthesized SFX + music for WIREWORK.

All audio here is ORIGINAL, synthesized procedurally with the Python standard
library (no samples, no third-party audio, no IP). Output is 16-bit PCM WAV at
22.05kHz mono, which every modern browser (and Phaser's WebAudio backend) plays
natively. WAV keeps the pipeline dependency-free (no ffmpeg required).

SFX: grapple_fire, wire_attach, swing_whoosh, slash, hit, enemy_death,
     citizen_scream, ui_click.
Music: one looping ambient/action bed (music_loop).

Run:  python3 tools/gen_audio.py
Out:  public/assets/audio/*.wav
"""

import math
import os
import struct
import wave
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUD = os.path.join(ROOT, "public", "assets", "audio")
os.makedirs(AUD, exist_ok=True)

RATE = 22050


def write_wav(name, samples):
    """samples: list of floats in [-1, 1]."""
    path = os.path.join(AUD, name)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = bytearray()
        for s in samples:
            v = int(max(-1.0, min(1.0, s)) * 32767)
            frames += struct.pack("<h", v)
        w.writeframes(bytes(frames))
    print(name, f"{len(samples)/RATE:.2f}s", f"{os.path.getsize(path)} bytes")


def env(i, n, attack=0.01, release=0.2):
    """Simple attack/decay envelope, value in [0,1]."""
    a = int(n * attack)
    r = int(n * release)
    if i < a:
        return i / max(1, a)
    if i > n - r:
        return max(0.0, (n - i) / max(1, r))
    return 1.0


def tone(freq, dur, vol=0.5, wave_fn=math.sin):
    n = int(RATE * dur)
    return [vol * wave_fn(2 * math.pi * freq * i / RATE) * env(i, n) for i in range(n)]


def sweep(f0, f1, dur, vol=0.5, wave_fn=math.sin):
    n = int(RATE * dur)
    out = []
    phase = 0.0
    for i in range(n):
        f = f0 + (f1 - f0) * (i / n)
        phase += 2 * math.pi * f / RATE
        out.append(vol * wave_fn(phase) * env(i, n))
    return out


def noise(dur, vol=0.5, lp=1.0):
    n = int(RATE * dur)
    out = []
    prev = 0.0
    for i in range(n):
        s = random.uniform(-1, 1)
        prev = prev + lp * (s - prev)   # 1-pole low-pass
        out.append(vol * prev * env(i, n, attack=0.005, release=0.4))
    return out


def mix(*layers):
    n = max(len(l) for l in layers)
    out = [0.0] * n
    for l in layers:
        for i, s in enumerate(l):
            out[i] += s
    return out


def saw(x):
    return 2 * (x / (2 * math.pi) - math.floor(0.5 + x / (2 * math.pi)))


def square(x):
    return 1.0 if math.sin(x) >= 0 else -1.0


# --------------------------------------------------------------------------
# SFX
# --------------------------------------------------------------------------
def sfx_grapple_fire():
    # metallic launch: quick upward pitched click + noise burst
    s = mix(sweep(300, 1200, 0.12, 0.4, saw), noise(0.12, 0.25, 0.3))
    write_wav("grapple_fire.wav", s)


def sfx_wire_attach():
    # sharp "chunk" of the hook biting: short low click + tick
    s = mix(tone(140, 0.06, 0.5, square), noise(0.05, 0.3, 0.6))
    write_wav("wire_attach.wav", s)


def sfx_swing_whoosh():
    # airy filtered noise that rises and falls
    n = int(RATE * 0.4)
    out = []
    prev = 0.0
    for i in range(n):
        t = i / n
        lp = 0.05 + 0.3 * math.sin(math.pi * t)
        s = random.uniform(-1, 1)
        prev = prev + lp * (s - prev)
        out.append(0.5 * prev * math.sin(math.pi * t))
    write_wav("swing_whoosh.wav", out)


def sfx_slash():
    # bright fast whoosh + high tick
    s = mix(sweep(1800, 400, 0.14, 0.35), noise(0.14, 0.3, 0.5))
    write_wav("slash.wav", s)


def sfx_hit():
    # meaty impact: low thud + noise
    s = mix(sweep(220, 60, 0.16, 0.6), noise(0.1, 0.3, 0.2))
    write_wav("hit.wav", s)


def sfx_enemy_death():
    # descending groan with steam-ish noise tail
    s = mix(sweep(200, 50, 0.6, 0.5, saw), noise(0.6, 0.25, 0.08))
    write_wav("enemy_death.wav", s)


def sfx_citizen_scream():
    # vocal-ish frightened cry: vibrato tone dropping
    n = int(RATE * 0.5)
    out = []
    for i in range(n):
        t = i / n
        vib = 1 + 0.04 * math.sin(2 * math.pi * 11 * t)
        f = (720 - 240 * t) * vib
        out.append(0.4 * math.sin(2 * math.pi * f * i / RATE) * env(i, n, 0.02, 0.35))
    write_wav("citizen_scream.wav", out)


def sfx_ui_click():
    s = mix(tone(880, 0.04, 0.35, square), tone(1320, 0.03, 0.2))
    write_wav("ui_click.wav", s)


# --------------------------------------------------------------------------
# MUSIC: a seamless looping bed. Minor-key arpeggio pad + soft pulse.
# --------------------------------------------------------------------------
def music_loop():
    bpm = 96
    beat = 60.0 / bpm
    bars = 8
    total = beat * 4 * bars          # 8 bars of 4/4
    n = int(RATE * total)
    out = [0.0] * n

    # A minor progression: Am - F - C - G (one chord per 2 bars)
    chords = [
        [220.00, 261.63, 329.63],    # Am
        [174.61, 220.00, 261.63],    # F
        [261.63, 329.63, 392.00],    # C
        [196.00, 246.94, 293.66],    # G
    ]
    seg = n // len(chords)

    # pad layer
    for ci, chord in enumerate(chords):
        start = ci * seg
        for i in range(seg):
            gi = start + i
            if gi >= n:
                break
            t = i / seg
            amp = 0.10 * (0.6 + 0.4 * math.sin(math.pi * t))
            s = 0.0
            for f in chord:
                s += math.sin(2 * math.pi * f * gi / RATE)
                s += 0.3 * saw(2 * math.pi * (f / 2) * gi / RATE)
            out[gi] += amp * s / len(chord)

    # arpeggio (plucks) - 8th notes cycling chord tones
    step = beat / 2
    steps = int(total / step)
    for si in range(steps):
        chord = chords[(si // 4) % len(chords)]
        f = chord[si % 3] * 2
        start = int(si * step * RATE)
        dur = int(step * RATE * 0.9)
        for i in range(dur):
            gi = start + i
            if gi >= n:
                break
            out[gi] += 0.14 * math.sin(2 * math.pi * f * i / RATE) * env(i, dur, 0.01, 0.6)

    # soft kick pulse on each beat
    beats = int(total / beat)
    for bi in range(beats):
        start = int(bi * beat * RATE)
        dur = int(0.12 * RATE)
        for i in range(dur):
            gi = start + i
            if gi >= n:
                break
            f = 90 * (1 - i / dur) + 45
            out[gi] += 0.25 * math.sin(2 * math.pi * f * i / RATE) * env(i, dur, 0.005, 0.7)

    # normalize to avoid clipping
    peak = max(abs(s) for s in out) or 1.0
    out = [0.85 * s / peak for s in out]
    write_wav("music_loop.wav", out)


if __name__ == "__main__":
    random.seed(1234)   # deterministic output for reproducible builds
    sfx_grapple_fire()
    sfx_wire_attach()
    sfx_swing_whoosh()
    sfx_slash()
    sfx_hit()
    sfx_enemy_death()
    sfx_citizen_scream()
    sfx_ui_click()
    music_loop()
    print("\nAll original audio synthesized (WAV, 22.05kHz mono).")

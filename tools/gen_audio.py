#!/usr/bin/env python3
"""
gen_audio.py - Original synthesized SFX + music for KINGDOM RISE.

All audio here is ORIGINAL, synthesized procedurally with the Python standard
library (no samples, no third-party audio, no IP). Output is 16-bit PCM WAV at
22.05kHz mono, which every modern browser (and Phaser's WebAudio backend) plays
natively. WAV keeps the pipeline dependency-free (no ffmpeg / numpy required).

SFX: ui_click, build_complete, train_complete, battle_hit, victory, defeat.
Music: one looping medieval ambient/strategy bed (music_loop).

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


def seq(*parts):
    """Concatenate sample lists (for melodic jingles)."""
    out = []
    for p in parts:
        out.extend(p)
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
def sfx_ui_click():
    s = mix(tone(880, 0.04, 0.35, square), tone(1320, 0.03, 0.2))
    write_wav("ui_click.wav", s)


def sfx_build_complete():
    # a bright rising two-note chime with a little hammer tick (construction done)
    s = seq(tone(523.25, 0.12, 0.4), tone(783.99, 0.22, 0.4))  # C5 -> G5
    s = mix(s, noise(0.06, 0.2, 0.6))
    write_wav("build_complete.wav", s)


def sfx_train_complete():
    # a short martial fanfare (troops ready): three ascending notes
    s = seq(tone(440.00, 0.10, 0.4, saw), tone(587.33, 0.10, 0.4, saw), tone(880.00, 0.20, 0.4, saw))
    write_wav("train_complete.wav", s)


def sfx_battle_hit():
    # meaty melee impact: low thud + short noise
    s = mix(sweep(240, 60, 0.16, 0.6), noise(0.1, 0.3, 0.2))
    write_wav("battle_hit.wav", s)


def sfx_victory():
    # triumphant major fanfare (C - E - G - C octave)
    s = seq(
        tone(523.25, 0.16, 0.4, saw),
        tone(659.25, 0.16, 0.4, saw),
        tone(783.99, 0.16, 0.4, saw),
        tone(1046.50, 0.40, 0.45, saw),
    )
    write_wav("victory.wav", s)


def sfx_defeat():
    # somber descending minor cadence (A - F - D low)
    s = seq(
        tone(440.00, 0.24, 0.4),
        tone(349.23, 0.24, 0.4),
        tone(293.66, 0.50, 0.45, saw),
    )
    s = mix(s, noise(0.4, 0.12, 0.05))
    write_wav("defeat.wav", s)


# --------------------------------------------------------------------------
# MUSIC: a seamless looping medieval strategy bed. Minor-key pad + lute-ish
# arpeggio + soft heartbeat pulse.
# --------------------------------------------------------------------------
def music_loop():
    bpm = 84
    beat = 60.0 / bpm
    bars = 8
    total = beat * 4 * bars          # 8 bars of 4/4
    n = int(RATE * total)
    out = [0.0] * n

    # D minor progression: Dm - Bb - F - C (one chord per 2 bars) - stately.
    chords = [
        [146.83, 174.61, 220.00],    # Dm
        [116.54, 174.61, 233.08],    # Bb
        [174.61, 220.00, 261.63],    # F
        [130.81, 164.81, 196.00],    # C
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
                s += 0.25 * saw(2 * math.pi * (f / 2) * gi / RATE)
            out[gi] += amp * s / len(chord)

    # lute-ish arpeggio (plucks) - 8th notes cycling chord tones an octave up
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
            out[gi] += 0.13 * saw(2 * math.pi * f * i / RATE) * env(i, dur, 0.01, 0.6)

    # soft heartbeat pulse on each beat
    beats = int(total / beat)
    for bi in range(beats):
        start = int(bi * beat * RATE)
        dur = int(0.12 * RATE)
        for i in range(dur):
            gi = start + i
            if gi >= n:
                break
            f = 84 * (1 - i / dur) + 42
            out[gi] += 0.22 * math.sin(2 * math.pi * f * i / RATE) * env(i, dur, 0.005, 0.7)

    # normalize to avoid clipping
    peak = max(abs(s) for s in out) or 1.0
    out = [0.85 * s / peak for s in out]
    write_wav("music_loop.wav", out)


if __name__ == "__main__":
    random.seed(1234)   # deterministic output for reproducible builds
    sfx_ui_click()
    sfx_build_complete()
    sfx_train_complete()
    sfx_battle_hit()
    sfx_victory()
    sfx_defeat()
    music_loop()
    print("\nAll original audio synthesized (WAV, 22.05kHz mono).")

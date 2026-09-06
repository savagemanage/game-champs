#!/usr/bin/env python3
"""
gen_audio.py - Original synthesized SFX + music for FROSTHOLD: LAST EMBER.

All audio here is ORIGINAL, synthesized procedurally with the Python standard
library (no samples, no third-party audio, no IP). Frosthold: Last Ember
(서리성채: 마지막 불씨) is an ORIGINAL frozen-survival city-builder merely
INSPIRED BY the genre - it uses NO "Whiteout Survival" (or any third-party)
sounds or music. Output is 16-bit PCM WAV at 22.05kHz mono, which every modern
browser (and Phaser's WebAudio backend) plays natively. WAV keeps the pipeline
dependency-free (no ffmpeg / numpy required).

The palette evokes cold survival: sparse, minor-key tones over a low wind bed
synthesized from the noise() generator, warmed by a single ember-bright note
where the moment calls for hope (build/train/victory).

SFX: ui_click, build_complete, train_complete, battle_hit, victory, defeat.
Music: one looping frozen-survival ambient bed (music_loop) - a sparse minor
pad with a soft wind layer and a slow ember-pulse.

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


def wind(dur, vol=0.5, lp=0.06, gust=0.35):
    """A low, breathy wind bed: heavily low-passed noise slowly amplitude-
    modulated by a gust LFO. Deterministic (uses the seeded RNG)."""
    n = int(RATE * dur)
    out = []
    prev = 0.0
    for i in range(n):
        s = random.uniform(-1, 1)
        prev = prev + lp * (s - prev)   # steep 1-pole low-pass -> rumble
        lfo = 1.0 - gust + gust * (0.5 + 0.5 * math.sin(2 * math.pi * 0.15 * i / RATE))
        out.append(vol * prev * lfo)
    return out


def seq(*parts):
    """Concatenate sample lists (for melodic motifs)."""
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
# SFX - cold and glassy, with a warm ember note where the moment is hopeful.
# --------------------------------------------------------------------------
def sfx_ui_click():
    # a crisp glassy tick, like frost cracking under a fingertip
    s = mix(tone(1046.50, 0.035, 0.30), tone(1568.0, 0.025, 0.18))
    write_wav("ui_click.wav", s)


def sfx_build_complete():
    # two icy chime notes rising to a warm ember note (the hearth is stoked)
    s = seq(tone(587.33, 0.12, 0.38), tone(880.00, 0.20, 0.40))  # D5 -> A5
    s = mix(s, noise(0.05, 0.14, 0.5))
    write_wav("build_complete.wav", s)


def sfx_train_complete():
    # three ascending glassy notes - survivors ready at the War Camp
    s = seq(tone(493.88, 0.10, 0.38), tone(659.25, 0.10, 0.38), tone(987.77, 0.20, 0.40))
    write_wav("train_complete.wav", s)


def sfx_battle_hit():
    # a cold, dull impact: low ice thud + a short frosty crack
    s = mix(sweep(220, 55, 0.16, 0.6), noise(0.09, 0.28, 0.35))
    write_wav("battle_hit.wav", s)


def sfx_victory():
    # a rising minor-to-major lift: the cold breaks, the Ember holds
    s = seq(
        tone(523.25, 0.16, 0.38, saw),   # C5
        tone(622.25, 0.16, 0.38, saw),   # Eb5
        tone(783.99, 0.16, 0.40, saw),   # G5
        tone(1046.50, 0.42, 0.44),       # C6 (pure, warm)
    )
    write_wav("victory.wav", s)


def sfx_defeat():
    # a sinking minor cadence over a gust of wind (the Ember gutters out)
    s = seq(
        tone(392.00, 0.24, 0.38),        # G4
        tone(311.13, 0.24, 0.38),        # Eb4
        tone(233.08, 0.52, 0.42, saw),   # Bb3
    )
    s = mix(s, wind(len(s) / RATE, 0.16, lp=0.05, gust=0.5))
    write_wav("defeat.wav", s)


# --------------------------------------------------------------------------
# MUSIC: a seamless looping frozen-survival bed. A sparse minor pad over a low
# wind layer, with a slow ember-pulse standing in for the hearth heartbeat.
# --------------------------------------------------------------------------
def music_loop():
    bpm = 72
    beat = 60.0 / bpm
    bars = 8
    total = beat * 4 * bars          # 8 bars of 4/4 (sparser, colder tempo)
    n = int(RATE * total)
    out = [0.0] * n

    # A natural-minor progression: Am - F - Dm - E (one chord per 2 bars).
    chords = [
        [110.00, 130.81, 164.81],    # Am
        [87.31, 130.81, 174.61],     # F
        [73.42, 110.00, 146.83],     # Dm
        [82.41, 103.83, 164.81],     # E
    ]
    seg = n // len(chords)

    # sustained pad layer (softer/breathier than the old lute bed)
    for ci, chord in enumerate(chords):
        start = ci * seg
        for i in range(seg):
            gi = start + i
            if gi >= n:
                break
            t = i / seg
            amp = 0.09 * (0.55 + 0.45 * math.sin(math.pi * t))
            s = 0.0
            for f in chord:
                s += math.sin(2 * math.pi * f * gi / RATE)
                s += 0.18 * math.sin(2 * math.pi * (f * 2) * gi / RATE)  # airy octave
            out[gi] += amp * s / len(chord)

    # sparse ember-bright bell (a single high note every 2 beats, letting the
    # cold air breathe between hits)
    step = beat * 2
    steps = int(total / step)
    for si in range(steps):
        chord = chords[(si // 2) % len(chords)]
        f = chord[si % 3] * 4
        start = int(si * step * RATE)
        dur = int(beat * RATE * 1.2)
        for i in range(dur):
            gi = start + i
            if gi >= n:
                break
            out[gi] += 0.10 * math.sin(2 * math.pi * f * i / RATE) * env(i, dur, 0.02, 0.85)

    # slow ember-pulse (a soft low heartbeat every 2 beats - the hearth burning)
    pulses = int(total / (beat * 2))
    for bi in range(pulses):
        start = int(bi * beat * 2 * RATE)
        dur = int(0.18 * RATE)
        for i in range(dur):
            gi = start + i
            if gi >= n:
                break
            f = 66 * (1 - i / dur) + 33
            out[gi] += 0.20 * math.sin(2 * math.pi * f * i / RATE) * env(i, dur, 0.01, 0.75)

    # low wind bed across the whole loop
    w = wind(total, 0.10, lp=0.05, gust=0.4)
    for i in range(min(n, len(w))):
        out[i] += w[i]

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

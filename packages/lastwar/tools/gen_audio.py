#!/usr/bin/env python3
"""
gen_audio.py - Original synthesized SFX + music for LAST SQUAD (라스트 스쿼드).

All audio here is ORIGINAL, synthesized procedurally with the Python standard
library only (no samples, no numpy, no third-party audio, no IP). Output is
16-bit PCM WAV at 22.05kHz mono, which every modern browser (and Phaser's
WebAudio backend) plays natively. WAV keeps the pipeline dependency-free.

LAST SQUAD is an original modern military-survival lane gate-runner. The SFX
support its loop: UI taps, passing math gates, the squad's auto-fire ticks,
enemy impacts, the squad leveling up, and win/lose stingers, plus one seamless
looping driving survival-synth music bed.

SFX: ui_click, gate_pass, shoot, hit, level_up, victory, defeat.
Music: one seamless looping driving synth/percussive survival groove (music_loop).

Compatible with Python 3.9 (no 3.10+ syntax). Standard library only.

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
    print(name, "{:.2f}s".format(len(samples) / RATE), "{} bytes".format(os.path.getsize(path)))


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


def noise(dur, vol=0.5, lp=1.0, attack=0.005, release=0.4):
    n = int(RATE * dur)
    out = []
    prev = 0.0
    for i in range(n):
        s = random.uniform(-1, 1)
        prev = prev + lp * (s - prev)   # 1-pole low-pass
        out.append(vol * prev * env(i, n, attack=attack, release=release))
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


def tri(x):
    return 2.0 / math.pi * math.asin(math.sin(x))


# --------------------------------------------------------------------------
# SFX
# --------------------------------------------------------------------------
def sfx_ui_click():
    # crisp modern UI tap: short high blip + click transient
    s = mix(tone(1040, 0.03, 0.32, square), tone(1560, 0.025, 0.16))
    s = mix(s, noise(0.012, 0.18, 0.9, attack=0.001, release=0.6))
    write_wav("ui_click.wav", s)


def sfx_gate_pass():
    # bright upward whoosh/pickup as the squad passes a gate
    s = mix(
        sweep(520, 1180, 0.20, 0.34, tri),
        sweep(780, 1560, 0.18, 0.16),
    )
    s = mix(s, noise(0.14, 0.10, 0.5, attack=0.02, release=0.6))
    write_wav("gate_pass.wav", s)


def sfx_shoot():
    # soft auto-fire tick: short filtered noise burst + low body
    s = mix(
        noise(0.06, 0.34, 0.35, attack=0.001, release=0.7),
        sweep(320, 140, 0.05, 0.22, square),
    )
    write_wav("shoot.wav", s)


def sfx_hit():
    # enemy impact: punchy low thud + short splatter noise
    s = mix(sweep(300, 70, 0.14, 0.55), noise(0.09, 0.28, 0.25, attack=0.001, release=0.5))
    write_wav("hit.wav", s)


def sfx_level_up():
    # squad grows: quick ascending triad shimmer
    s = seq(
        tone(659.25, 0.08, 0.34, tri),   # E5
        tone(830.61, 0.08, 0.34, tri),   # G#5
        tone(987.77, 0.18, 0.40, tri),   # B5
    )
    s = mix(s, sweep(900, 1800, 0.30, 0.10, tri))
    write_wav("level_up.wav", s)


def sfx_victory():
    # triumphant rising major fanfare (C - E - G - C octave), synth brass
    s = seq(
        tone(523.25, 0.16, 0.36, saw),
        tone(659.25, 0.16, 0.36, saw),
        tone(783.99, 0.16, 0.36, saw),
        tone(1046.50, 0.42, 0.42, saw),
    )
    s = mix(s, sweep(200, 400, 0.9, 0.10, square))  # low swell under it
    write_wav("victory.wav", s)


def sfx_defeat():
    # somber descending cadence (A - F - D low) with a dark noise tail
    s = seq(
        tone(440.00, 0.24, 0.36, tri),
        tone(349.23, 0.24, 0.36, tri),
        tone(261.63, 0.52, 0.42, saw),
    )
    s = mix(s, noise(0.6, 0.12, 0.06, attack=0.01, release=0.5))
    write_wav("defeat.wav", s)


# --- FEAT-005 SFX: base/meta + battle + shell interactions -----------------
def sfx_recruit():
    # hero recruit: a bright two-note "arrival" chime + shimmer (gacha reveal)
    random.seed(50001)
    s = seq(
        tone(659.25, 0.10, 0.32, tri),    # E5
        tone(880.00, 0.20, 0.40, tri),    # A5
    )
    s = mix(s, sweep(1200, 2000, 0.30, 0.12, tri))
    write_wav("recruit.wav", s)


def sfx_upgrade_complete():
    # building/upgrade complete: a solid rising "construction done" thunk + ding
    random.seed(50002)
    s = mix(
        sweep(180, 360, 0.16, 0.34, square),   # rising machine thunk
        noise(0.10, 0.16, 0.4, attack=0.001, release=0.6),
    )
    s = seq(s, tone(783.99, 0.18, 0.36, tri))  # confirming ding (G5)
    write_wav("upgrade_complete.wav", s)


def sfx_battle_hit():
    # combat impact: sharper metallic hit distinct from the runner's soft hit
    random.seed(50003)
    s = mix(
        sweep(420, 120, 0.10, 0.5, square),
        noise(0.07, 0.34, 0.6, attack=0.001, release=0.4),
    )
    write_wav("battle_hit.wav", s)


def sfx_battle_win():
    # battle victory: brisk ascending major arpeggio (C-E-G-C) synth brass
    random.seed(50004)
    s = seq(
        tone(523.25, 0.10, 0.34, saw),
        tone(659.25, 0.10, 0.34, saw),
        tone(783.99, 0.10, 0.34, saw),
        tone(1046.50, 0.28, 0.42, saw),
    )
    s = mix(s, sweep(260, 520, 0.6, 0.10, square))
    write_wav("battle_win.wav", s)


def sfx_battle_lose():
    # battle loss: short descending minor sting (softer than run defeat)
    random.seed(50005)
    s = seq(
        tone(392.00, 0.16, 0.34, tri),    # G4
        tone(311.13, 0.16, 0.34, tri),    # Eb4
        tone(233.08, 0.34, 0.38, saw),    # Bb3
    )
    s = mix(s, noise(0.4, 0.10, 0.08, attack=0.01, release=0.5))
    write_wav("battle_lose.wav", s)


def sfx_tab_switch():
    # bottom-nav tab switch: a soft muted low-to-mid blip, gentler than ui_click
    random.seed(50006)
    s = mix(
        sweep(360, 620, 0.06, 0.26, tri),
        noise(0.02, 0.10, 0.7, attack=0.001, release=0.5),
    )
    write_wav("tab_switch.wav", s)


def sfx_reward():
    # reward / claim: cheerful coin-y triad sparkle (mission/season claim)
    random.seed(50007)
    s = seq(
        tone(784.00, 0.07, 0.30, tri),
        tone(988.00, 0.07, 0.30, tri),
        tone(1174.66, 0.16, 0.36, tri),
    )
    s = mix(s, sweep(1400, 2200, 0.24, 0.10, tri))
    write_wav("reward.wav", s)


# --------------------------------------------------------------------------
# MUSIC: a seamless looping driving survival-synth groove. Steady four-on-the-
# floor kick, off-beat hats, a pulsing bass line, and a minor-key synth pad +
# arpeggio. Built so the last sample flows into the first (loop-safe).
# --------------------------------------------------------------------------
def music_loop():
    bpm = 124
    beat = 60.0 / bpm
    bars = 8
    total = beat * 4 * bars           # 8 bars of 4/4
    n = int(RATE * total)
    out = [0.0] * n

    # A minor driving progression: Am - F - C - G (2 bars each).
    chords = [
        [220.00, 261.63, 329.63],     # Am
        [174.61, 220.00, 349.23],     # F
        [130.81, 196.00, 261.63],     # C
        [196.00, 246.94, 392.00],     # G
    ]
    bass_notes = [110.00, 87.31, 130.81, 98.00]  # A2, F2, C3, G2
    seg = n // len(chords)

    # --- synth pad (sustained chords, soft saw+sine) ---
    for ci, chord in enumerate(chords):
        start = ci * seg
        for i in range(seg):
            gi = start + i
            if gi >= n:
                break
            t = i / seg
            amp = 0.075 * (0.7 + 0.3 * math.sin(math.pi * t))
            s = 0.0
            for f in chord:
                ph = 2 * math.pi * f * gi / RATE
                s += math.sin(ph) + 0.3 * saw(ph)
            out[gi] += amp * s / len(chord)

    # --- pulsing bass line (eighth notes, square-ish) ---
    step = beat / 2
    steps = int(total / step)
    for si in range(steps):
        f = bass_notes[(si // 4) % len(bass_notes)]
        start = int(si * step * RATE)
        dur = int(step * RATE * 0.85)
        for i in range(dur):
            gi = start + i
            if gi >= n:
                break
            ph = 2 * math.pi * f * i / RATE
            out[gi] += 0.20 * (0.7 * square(ph) + 0.3 * math.sin(ph)) * env(i, dur, 0.01, 0.4)

    # --- arpeggio (16th-note plucks, chord tones up an octave) ---
    astep = beat / 4
    asteps = int(total / astep)
    for si in range(asteps):
        chord = chords[(si // 8) % len(chords)]
        f = chord[si % 3] * 2
        start = int(si * astep * RATE)
        dur = int(astep * RATE * 0.9)
        for i in range(dur):
            gi = start + i
            if gi >= n:
                break
            out[gi] += 0.09 * tri(2 * math.pi * f * i / RATE) * env(i, dur, 0.01, 0.5)

    # --- four-on-the-floor kick ---
    beats = int(total / beat)
    for bi in range(beats):
        start = int(bi * beat * RATE)
        dur = int(0.13 * RATE)
        for i in range(dur):
            gi = start + i
            if gi >= n:
                break
            f = 120 * (1 - i / dur) + 45
            out[gi] += 0.34 * math.sin(2 * math.pi * f * i / RATE) * env(i, dur, 0.002, 0.6)

    # --- off-beat closed hats (noise ticks) ---
    prev = 0.0
    for bi in range(beats):
        start = int((bi + 0.5) * beat * RATE)
        dur = int(0.04 * RATE)
        for i in range(dur):
            gi = start + i
            if gi >= n:
                break
            s = random.uniform(-1, 1)
            prev = prev + 0.7 * (s - prev)
            hp = s - prev  # high-pass-ish
            out[gi] += 0.12 * hp * env(i, dur, 0.001, 0.8)

    # normalize to avoid clipping
    peak = max(abs(s) for s in out) or 1.0
    out = [0.9 * s / peak for s in out]
    write_wav("music_loop.wav", out)


if __name__ == "__main__":
    random.seed(20240517)   # deterministic output for reproducible builds
    sfx_ui_click()
    sfx_gate_pass()
    sfx_shoot()
    sfx_hit()
    sfx_level_up()
    sfx_victory()
    sfx_defeat()
    # music_loop() runs here (before the FEAT-005 SFX) so it consumes the exact
    # same RNG stream position as when it was first committed -> no churn on the
    # existing music_loop.wav. The FEAT-005 SFX below each reseed independently
    # so their output never depends on ordering.
    music_loop()
    # FEAT-005 SFX (base/meta + battle + shell nav). Each reseeds for order-
    # independent determinism.
    sfx_recruit()
    sfx_upgrade_complete()
    sfx_battle_hit()
    sfx_battle_win()
    sfx_battle_lose()
    sfx_tab_switch()
    sfx_reward()
    print("\nAll original LAST SQUAD audio synthesized (WAV, 22.05kHz mono).")

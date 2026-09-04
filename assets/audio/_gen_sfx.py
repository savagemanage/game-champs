#!/usr/bin/env python3
"""Procedural SFX generator for wirework (FEAT-002).

Generates committed Godot 4 AudioStreamWAV *.tres text resources (16-bit mono
PCM, base64-free decimal PackedByteArray) so they need NO editor .import step
and work immediately on load. Web-safe: these are static resources, no runtime
threads. Run once to (re)generate; the .tres files are what gets committed.

All synthesis is simple additive/noise/envelope math in the stdlib only (no
numpy), matching the "no new deps" constraint. Mix rate is kept modest and
clips short so the decimal PackedByteArray stays a sane size.
"""
import math
import os
import random
import struct

MIX_RATE = 22050
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

random.seed(1234)  # deterministic output so regeneration is reproducible


def _clampi16(x):
    return max(-32768, min(32767, int(x)))


def write_tres(name, samples):
    """samples: list of floats in [-1, 1]. Writes name.tres as AudioStreamWAV."""
    pcm = bytearray()
    for s in samples:
        pcm += struct.pack("<h", _clampi16(s * 32767.0))
    byte_list = ",".join(str(b) for b in pcm)
    n = len(samples)
    tres = (
        '[gd_resource type="AudioStreamWAV" format=3]\n\n'
        "[resource]\n"
        "format = 1\n"  # 1 = 16-bit PCM
        "mix_rate = %d\n" % MIX_RATE
        + "stereo = false\n"
        "loop_mode = 0\n"
        "loop_begin = 0\n"
        "loop_end = %d\n" % n
        + "data = PackedByteArray(%s)\n" % byte_list
    )
    path = os.path.join(OUT_DIR, name + ".tres")
    with open(path, "w") as f:
        f.write(tres)
    return path, len(pcm)


def env(i, n, attack, release):
    """ADSR-ish linear attack/release envelope in [0,1]."""
    a = int(n * attack)
    r = int(n * release)
    if i < a and a > 0:
        return i / a
    if i > n - r and r > 0:
        return max(0.0, (n - i) / r)
    return 1.0


def gen(dur, fn):
    n = int(MIX_RATE * dur)
    return [fn(i, n) for i in range(n)]


def tone(freq):
    return lambda i, n: math.sin(2 * math.pi * freq * i / MIX_RATE)


def noise():
    return lambda i, n: random.uniform(-1.0, 1.0)


# --- grapple fire: short pitched "thwip" (fast downward chirp + click) ---
def grapple_fire(i, n):
    t = i / MIX_RATE
    f = 900.0 - 600.0 * (i / n)
    return math.sin(2 * math.pi * f * t) * env(i, n, 0.02, 0.6) * 0.7


# --- grapple attach: solid metallic "clink" (two-tone ping) ---
def grapple_attach(i, n):
    t = i / MIX_RATE
    s = math.sin(2 * math.pi * 1200 * t) + 0.6 * math.sin(2 * math.pi * 1810 * t)
    return s * math.exp(-6.0 * t) * 0.5


# --- swing whoosh: band-passed noise swelling then fading ---
def whoosh(i, n):
    x = noise()(i, n)
    # crude low-pass by averaging with a slow sine to shape it as airy
    shape = math.sin(math.pi * i / n)  # swell in the middle
    return x * shape * shape * 0.5


# --- slash swing: quick airy noise sweep (sharper than whoosh) ---
def slash_swing(i, n):
    x = noise()(i, n)
    return x * env(i, n, 0.05, 0.7) * (0.3 + 0.7 * (1 - i / n)) * 0.45


# --- slash sub hit: dull metallic "tunk" (low ting, damped) ---
def slash_sub(i, n):
    t = i / MIX_RATE
    s = math.sin(2 * math.pi * 320 * t) + 0.4 * math.sin(2 * math.pi * 470 * t)
    return s * math.exp(-14.0 * t) * 0.6


# --- slash kill: bright ascending chime (triad) ---
def slash_kill(i, n):
    t = i / MIX_RATE
    s = (
        math.sin(2 * math.pi * 660 * t)
        + 0.7 * math.sin(2 * math.pi * 990 * t)
        + 0.5 * math.sin(2 * math.pi * 1320 * t)
    )
    return s * math.exp(-5.0 * t) * 0.4


# --- titan footstep: low thud (short sine burst + noise transient) ---
def footstep(i, n):
    t = i / MIX_RATE
    body = math.sin(2 * math.pi * 70 * t) * math.exp(-9.0 * t)
    click = noise()(i, n) * math.exp(-40.0 * t) * 0.4
    return (body + click) * 0.8


# --- titan aggro: rising ominous tone (low sweep up) ---
def aggro(i, n):
    t = i / MIX_RATE
    f = 110.0 + 160.0 * (i / n)
    s = math.sin(2 * math.pi * f * t) + 0.5 * math.sin(2 * math.pi * f * 0.5 * t)
    return s * env(i, n, 0.15, 0.4) * 0.5


# --- titan death: descending low boom (falling tone + noise) ---
def death(i, n):
    t = i / MIX_RATE
    f = 260.0 - 190.0 * (i / n)
    s = math.sin(2 * math.pi * f * t)
    rumble = noise()(i, n) * math.exp(-3.0 * t) * 0.3
    return (s * math.exp(-2.5 * t) + rumble) * 0.7


# --- player jump: quick upward blip ---
def jump(i, n):
    t = i / MIX_RATE
    f = 300.0 + 500.0 * (i / n)
    return math.sin(2 * math.pi * f * t) * env(i, n, 0.05, 0.5) * 0.5


# --- player land: soft low thud (shorter, softer than footstep) ---
def land(i, n):
    t = i / MIX_RATE
    body = math.sin(2 * math.pi * 95 * t) * math.exp(-12.0 * t)
    click = noise()(i, n) * math.exp(-55.0 * t) * 0.3
    return (body + click) * 0.7


SPECS = [
    ("sfx_grapple_fire", 0.18, grapple_fire),
    ("sfx_grapple_attach", 0.22, grapple_attach),
    ("sfx_swing_whoosh", 0.35, whoosh),
    ("sfx_slash_swing", 0.20, slash_swing),
    ("sfx_slash_sub", 0.22, slash_sub),
    ("sfx_slash_kill", 0.45, slash_kill),
    ("sfx_titan_footstep", 0.22, footstep),
    ("sfx_titan_aggro", 0.55, aggro),
    ("sfx_titan_death", 0.70, death),
    ("sfx_player_jump", 0.16, jump),
    ("sfx_player_land", 0.20, land),
]


def main():
    total = 0
    for name, dur, fn in SPECS:
        samples = gen(dur, fn)
        path, nbytes = write_tres(name, samples)
        total += nbytes
        print("%-24s %5d samples  %6d PCM bytes -> %s" % (name, len(samples), nbytes, os.path.basename(path)))
    print("TOTAL PCM bytes: %d" % total)


if __name__ == "__main__":
    main()

"""Compose an original calm ambient track (no samples, no rights issues).

Soft pad chords + a slow, sparse plucked melody + a gentle low drone, with a simple reverb.
Usage: python3 script/make_music.py <seconds>
"""
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve

SR = 44100
SECONDS = float(sys.argv[1]) if len(sys.argv) > 1 else 660
ROOT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# I - vi - IV - V colour chords in D major, 8 s each (warm, hopeful, unobtrusive)
PROGRESSION = [
    [50, 57, 62, 66, 69, 73],  # Dmaj9
    [47, 54, 59, 62, 66, 69],  # Bm9
    [43, 50, 55, 59, 62, 66],  # Gmaj9
    [45, 52, 57, 61, 64, 69],  # A6/9
]
CHORD_LEN = 8.0
n = int(SECONDS * SR)
t_all = np.arange(n) / SR
mix = np.zeros((n, 2))


def pad_voice(freq, length):
    t = np.arange(int(length * SR)) / SR
    detune = [0.997, 1.0, 1.003]
    sig = sum(np.sin(2 * np.pi * freq * d * t + rng.uniform(0, 6.28)) for d in detune) / 3
    sig += 0.25 * np.sin(2 * np.pi * freq * 2 * t)  # soft octave shimmer
    attack, release = 2.5, 3.0
    env = np.minimum(1, t / attack) * np.minimum(1, np.maximum(0, (length - t) / release))
    return sig * env


# pads, overlapping slightly between chords
chord_idx = 0
start = 0.0
while start < SECONDS:
    chord = PROGRESSION[chord_idx % len(PROGRESSION)]
    length = CHORD_LEN + 2.5
    for k, note in enumerate(chord):
        v = pad_voice(midi(note), length) * (0.055 if k else 0.07)
        pan = 0.5 + 0.35 * np.sin(k * 1.7)
        s0 = int(start * SR)
        s1 = min(n, s0 + len(v))
        mix[s0:s1, 0] += v[: s1 - s0] * (1 - pan)
        mix[s0:s1, 1] += v[: s1 - s0] * pan
    start += CHORD_LEN
    chord_idx += 1


# sparse plucked melody from the chord tones (pentatonic feel), soft and far away
def pluck(freq, length=3.0):
    t = np.arange(int(length * SR)) / SR
    sig = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2 * t) + 0.1 * np.sin(2 * np.pi * freq * 3 * t)
    return sig * np.exp(-t * 2.2) * np.minimum(1, t / 0.01)


beat = CHORD_LEN / 8
time = 4.0
while time < SECONDS - 4:
    chord = PROGRESSION[int(time // CHORD_LEN) % len(PROGRESSION)]
    if rng.random() < 0.55:
        note = rng.choice(chord[2:]) + 12
        v = pluck(midi(note)) * 0.05
        pan = rng.uniform(0.25, 0.75)
        s0 = int(time * SR)
        s1 = min(n, s0 + len(v))
        mix[s0:s1, 0] += v[: s1 - s0] * (1 - pan)
        mix[s0:s1, 1] += v[: s1 - s0] * pan
    time += beat * rng.choice([1, 2, 2, 3])

# low drone on the tonic, breathing slowly
drone = 0.04 * np.sin(2 * np.pi * midi(38) * t_all) * (0.7 + 0.3 * np.sin(2 * np.pi * t_all / 16))
mix[:, 0] += drone
mix[:, 1] += drone

# simple stereo reverb: decaying noise impulse response
ir_len = int(3.2 * SR)
ir_t = np.arange(ir_len) / SR
for ch in range(2):
    ir = rng.standard_normal(ir_len) * np.exp(-ir_t * 1.6)
    ir /= np.sqrt(np.sum(ir**2))
    wet = fftconvolve(mix[:, ch], ir)[:n]
    mix[:, ch] = 0.55 * mix[:, ch] + 0.45 * wet

# fade in / out and normalise to a calm level
fade = int(4 * SR)
mix[:fade] *= np.linspace(0, 1, fade)[:, None]
mix[-fade * 2 :] *= np.linspace(1, 0, fade * 2)[:, None]
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.6

out = ROOT / "public" / "music.wav"
out.parent.mkdir(parents=True, exist_ok=True)
wavfile.write(out, SR, (mix * 32767).astype(np.int16))
print(f"wrote {out} ({SECONDS / 60:.1f} min)")

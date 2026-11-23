"""Generate the French narration, one WAV per scene, and write the timings the video reads.

Usage: python3 script/make_voice.py [voice] [rate]
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE = sys.argv[1] if len(sys.argv) > 1 else "Jacques"
RATE = sys.argv[2] if len(sys.argv) > 2 else "172"

scenes = json.loads((ROOT / "script" / "narration.json").read_text())
out_dir = ROOT / "public" / "voice"
out_dir.mkdir(parents=True, exist_ok=True)

timings = []
for s in scenes:
    aiff = out_dir / f"{s['id']}.aiff"
    wav = out_dir / f"{s['id']}.wav"
    subprocess.run(["say", "-v", VOICE, "-r", RATE, "-o", str(aiff), s["text"]], check=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(aiff), "-ar", "48000", "-ac", "1", str(wav)],
        check=True,
    )
    aiff.unlink()
    with wave.open(str(wav)) as w:
        seconds = w.getnframes() / w.getframerate()
    timings.append({"id": s["id"], "seconds": round(seconds, 3)})
    print(f"{s['id']:<18} {seconds:6.1f}s")

(ROOT / "src" / "timings.json").write_text(json.dumps(timings, indent=2, ensure_ascii=False))
total = sum(t["seconds"] for t in timings)
print(f"total speech {total / 60:.1f} min")

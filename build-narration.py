#!/usr/bin/env python3
"""Pre-render scene narration with Kokoro TTS.

The scene text never changes at runtime, so the audio is generated once here
and shipped as small mp3 files. That gives the exact Kokoro voice without every
visitor downloading a speech model.

Usage:  ./kokoro-env/bin/python build-narration.py [voice]
"""
import io, os, json, subprocess, sys

SAMPLE_VOICES = ["af_heart", "af_bella", "af_nicole", "af_sarah", "am_michael", "am_fenrir", "bf_emma", "bm_george"]
SAMPLE_TEXT = ("Haemoglobin. This is the protein that carries oxygen in your blood. "
               "It is built from four protein chains, folded around each other.")

MODE = "samples" if (len(sys.argv) > 1 and sys.argv[1] == "--samples") else "build"
VOICE = sys.argv[1] if (len(sys.argv) > 1 and MODE == "build") else "af_heart"
OUT = "narration"
SCENES = "scenes/scenes.json"

os.makedirs(OUT, exist_ok=True)
scenes = json.load(io.open(SCENES, encoding="utf-8"))

# Phonemizer derives the espeak data directory from the library location, which
# breaks with the wheel-bundled copy (it looks for phontab one level too high).
# Prefer a real espeak-ng install and set both paths explicitly, before Kokoro
# imports anything that touches the phonemizer backend.
def _setup_espeak():
    candidates = [
        ("/opt/homebrew/lib/libespeak-ng.dylib", "/opt/homebrew/share/espeak-ng-data"),
        ("/usr/local/lib/libespeak-ng.dylib", "/usr/local/share/espeak-ng-data"),
    ]
    lib = data = None
    for l, d in candidates:
        if os.path.exists(l) and os.path.exists(os.path.join(d, "phontab")):
            lib, data = l, d
            break
    if lib is None:
        try:
            import espeakng_loader
            lib, data = espeakng_loader.get_library_path(), espeakng_loader.get_data_path()
        except Exception:
            return None
    os.environ["ESPEAK_DATA_PATH"] = data
    os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = lib
    try:
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
        EspeakWrapper.set_library(lib)
        if hasattr(EspeakWrapper, "set_data_path"):
            EspeakWrapper.set_data_path(data)
    except Exception as e:                # noqa: BLE001
        print("espeak wrapper warning:", e)
    return data


_ESPEAK_DATA = _setup_espeak()
print("espeak data:", _ESPEAK_DATA)

from kokoro import KPipeline          # noqa: E402
import soundfile as sf                # noqa: E402
import numpy as np                    # noqa: E402

def render(text, voice, out_path):
    chunks = [audio for _, _, audio in pipeline(text, voice=voice, speed=1.0)]
    if not chunks:
        return None
    audio = np.concatenate(chunks)
    wav = out_path + ".wav"
    sf.write(wav, audio, 24000)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", wav,
         "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1", out_path],
        check=True)
    os.remove(wav)
    return len(audio) / 24000


pipeline = KPipeline(lang_code="a")   # 'a' = American English

if MODE == "samples":
    d = os.path.join(OUT, "samples")
    os.makedirs(d, exist_ok=True)
    for v in SAMPLE_VOICES:
        try:
            path = os.path.join(d, v + ".mp3")
            secs = render(SAMPLE_TEXT, v, path)
            print("%-12s %5.1f s  %5.0f KB" % (v, secs, os.path.getsize(path) / 1024))
        except Exception as e:
            print("%-12s failed: %s" % (v, str(e)[:70]))
    sys.exit(0)

for s in scenes:
    text = s.get("narration")
    if not text:
        print("skip (no narration):", s["id"]); continue

    mp3 = os.path.join(OUT, s["id"] + ".mp3")
    secs = render(text, VOICE, mp3)
    if secs is None:
        print("no audio produced for", s["id"]); continue
    print("%-12s %6.1f s  %6.0f KB  voice=%s"
          % (s["id"], secs, os.path.getsize(mp3) / 1024, VOICE))

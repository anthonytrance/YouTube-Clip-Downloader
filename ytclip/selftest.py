"""Built-in self test.

Offline part (always runs):
  1. ffmpeg + ffprobe available (static-ffmpeg bootstrap works)
  2. generate a 30 s synthetic test video
  3. cut the 5 s..12 s section with re-encoded keyframe-exact cuts
  4. verify the output duration with ffprobe (within 250 ms)
  5. extract that section as 320 kbps MP3 and verify it too

Online part (--online):
  6. resolve metadata for a known public YouTube video
  7. download a ~5 s audio clip of it through the real job pipeline
"""

import json
import subprocess
import tempfile
import time
from pathlib import Path

from . import engine

TEST_VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw"  # "Me at the zoo", 19 s, public


def _run(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(map(str, cmd))}\n{proc.stderr[-800:]}")
    return proc.stdout


def _probe_duration(path):
    ffprobe = engine.ffmpeg_path("ffprobe")
    out = _run([ffprobe, "-v", "error", "-show_entries", "format=duration",
                "-of", "json", str(path)])
    return float(json.loads(out)["format"]["duration"])


def run(online=False):
    failures = []

    def step(label, fn):
        print(f"  {label} ... ", end="", flush=True)
        try:
            t0 = time.time()
            fn()
            print(f"OK ({time.time() - t0:.1f}s)")
        except Exception as exc:
            print("FAILED")
            print(f"      {exc}")
            failures.append(label)

    print("\nYouTube Clip Downloader self-test\n")

    tmp = Path(tempfile.mkdtemp(prefix="ytclip_selftest_"))
    src = tmp / "source.mp4"
    cut = tmp / "cut.mp4"
    mp3 = tmp / "cut.mp3"

    def ffmpeg_available():
        engine.ensure_ffmpeg_async()
        engine.wait_for_ffmpeg()
        engine.ffmpeg_path("ffmpeg")
        engine.ffmpeg_path("ffprobe")

    def make_source():
        ffmpeg = engine.ffmpeg_path("ffmpeg")
        _run([ffmpeg, "-y", "-f", "lavfi", "-i", "testsrc=duration=30:size=640x360:rate=30",
              "-f", "lavfi", "-i", "sine=frequency=440:duration=30",
              "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", str(src)])
        if _probe_duration(src) < 29:
            raise RuntimeError("synthetic source video is too short")

    def cut_video():
        ffmpeg = engine.ffmpeg_path("ffmpeg")
        _run([ffmpeg, "-y", "-ss", "5", "-to", "12", "-i", str(src),
              "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", str(cut)])
        dur = _probe_duration(cut)
        if abs(dur - 7.0) > 0.25:
            raise RuntimeError(f"cut duration is {dur:.3f}s, expected 7.0s")

    def cut_mp3():
        ffmpeg = engine.ffmpeg_path("ffmpeg")
        _run([ffmpeg, "-y", "-ss", "5", "-to", "12", "-i", str(src),
              "-vn", "-c:a", "libmp3lame", "-b:a", "320k", str(mp3)])
        dur = _probe_duration(mp3)
        if abs(dur - 7.0) > 0.35:
            raise RuntimeError(f"mp3 duration is {dur:.3f}s, expected 7.0s")

    step("ffmpeg and ffprobe available", ffmpeg_available)
    step("generate synthetic test video", make_source)
    step("clip video section (5s-12s, precise cuts)", cut_video)
    step("clip MP3 320kbps section", cut_mp3)

    if online:
        info_result = {}

        def resolve_info():
            info_result.update(engine.get_info(TEST_VIDEO))
            if not info_result.get("formats"):
                raise RuntimeError("no formats returned")

        def clip_online():
            job_id = engine.start_clip(TEST_VIDEO, 2000, 7000, 19000, "mp3")
            deadline = time.time() + 300
            while time.time() < deadline:
                job = engine.get_job(job_id)
                if job.status == "done":
                    dur = _probe_duration(job.filepath)
                    if abs(dur - 5.0) > 1.0:
                        raise RuntimeError(f"online clip duration {dur:.2f}s, expected ~5s")
                    return
                if job.status == "error":
                    raise RuntimeError(job.error)
                time.sleep(1)
            raise RuntimeError("online clip timed out after 300s")

        step("resolve real YouTube metadata", resolve_info)
        step("download + clip 5s from a real YouTube video", clip_online)

    print()
    if failures:
        print(f"SELF-TEST FAILED: {len(failures)} step(s) failed: {', '.join(failures)}")
        return 1
    print("SELF-TEST PASSED: everything works on this machine.")
    return 0

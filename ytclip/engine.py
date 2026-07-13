"""yt-dlp wrapper: video info, clip jobs, progress tracking."""

import atexit
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path

import yt_dlp
from yt_dlp.utils import download_range_func

# ---------------------------------------------------------------------------
# ffmpeg bootstrap (static-ffmpeg downloads real binaries on first use)
# ---------------------------------------------------------------------------

_ffmpeg_ready = threading.Event()
_ffmpeg_error = [None]


def ensure_ffmpeg_async():
    """Kick off the (possibly slow, first-run-only) ffmpeg download in the
    background so server startup stays instant. Jobs wait on the event."""

    def _worker():
        try:
            import static_ffmpeg

            static_ffmpeg.add_paths()
            _ffmpeg_ready.set()
        except Exception as exc:  # pragma: no cover
            _ffmpeg_error[0] = str(exc)
            _ffmpeg_ready.set()

    threading.Thread(target=_worker, daemon=True).start()


def wait_for_ffmpeg(timeout=600):
    _ffmpeg_ready.wait(timeout)
    if _ffmpeg_error[0]:
        raise RuntimeError(f"ffmpeg setup failed: {_ffmpeg_error[0]}")
    if not _ffmpeg_ready.is_set():
        raise RuntimeError("ffmpeg setup timed out")


def ffmpeg_path(tool="ffmpeg"):
    wait_for_ffmpeg()
    path = shutil.which(tool)
    if not path:
        raise RuntimeError(f"{tool} not found on PATH after static-ffmpeg setup")
    return path


# ---------------------------------------------------------------------------
# Video info
# ---------------------------------------------------------------------------

# js_runtimes: yt-dlp only enables deno by default; also allow node so the
# JS challenge solver works on machines that have either. Without a runtime
# YouTube serves throttled/missing formats.
_YDL_QUIET = {
    "quiet": True,
    "no_warnings": True,
    "noplaylist": True,
    "js_runtimes": {"deno": {}, "node": {}},
}


def get_info(url):
    """Resolve metadata + a simplified format list for the frontend."""
    with yt_dlp.YoutubeDL(dict(_YDL_QUIET, skip_download=True)) as ydl:
        info = ydl.extract_info(url, download=False)

    raw = info.get("formats") or []

    # Video options: one entry per distinct quality label, best stream wins.
    video = {}
    best_audio_size = 0
    for f in raw:
        if f.get("vcodec") not in (None, "none"):
            height = f.get("height")
            if not height:
                continue
            fps = f.get("fps") or 0
            label = f"{height}p{round(fps)}" if fps > 40 else f"{height}p"
            size = f.get("filesize") or f.get("filesize_approx") or 0
            tbr = f.get("tbr") or 0
            cur = video.get(label)
            if cur is None or tbr > cur["_tbr"]:
                video[label] = {
                    "label": label,
                    "type": "video",
                    "container": "mp4",
                    "height": height,
                    "filesize": size or None,
                    "_tbr": tbr,
                    "_height": height,
                }
        elif f.get("acodec") not in (None, "none"):
            size = f.get("filesize") or f.get("filesize_approx") or 0
            best_audio_size = max(best_audio_size, size)

    video_list = sorted(video.values(), key=lambda v: -v["_height"])
    for v in video_list:
        if v["filesize"]:
            v["filesize"] += best_audio_size
        del v["_tbr"], v["_height"]

    # Audio options: best m4a and best opus/webm, labelled by bitrate.
    audio_list = []
    for want_ext, container in (("m4a", "m4a"), ("webm", "opus")):
        best = None
        for f in raw:
            if f.get("vcodec") in (None, "none") and f.get("acodec") not in (None, "none"):
                if f.get("ext") == want_ext:
                    if best is None or (f.get("abr") or 0) > (best.get("abr") or 0):
                        best = f
        if best:
            abr = best.get("abr")
            audio_list.append({
                "label": f"{round(abr)} kbps" if abr else "Audio",
                "type": "audio",
                "container": container,
                "filesize": best.get("filesize") or best.get("filesize_approx") or None,
            })

    return {
        "id": info.get("id"),
        "url": info.get("webpage_url") or url,
        "title": info.get("title") or "",
        "author": info.get("uploader") or info.get("channel") or "",
        "duration": info.get("duration") or 0,
        "is_live": bool(info.get("is_live")),
        "thumbnail": info.get("thumbnail") or "",
        "thumbnail_fallback": f"https://i.ytimg.com/vi/{info.get('id')}/hqdefault.jpg",
        "formats": video_list + audio_list,
    }


# ---------------------------------------------------------------------------
# Clip jobs
# ---------------------------------------------------------------------------

JOBS = {}
_jobs_lock = threading.Lock()
_work_root = Path(tempfile.mkdtemp(prefix="ytclip_"))
atexit.register(lambda: shutil.rmtree(_work_root, ignore_errors=True))


class Job:
    def __init__(self):
        self.id = uuid.uuid4().hex[:12]
        self.status = "queued"       # queued | running | done | error
        self.percent = 0
        self.message = "Queued"
        self.error = None
        self.filepath = None
        self.dir = _work_root / self.id
        self.dir.mkdir(parents=True, exist_ok=True)

    def as_dict(self):
        return {
            "id": self.id,
            "status": self.status,
            "percent": round(self.percent),
            "message": self.message,
            "error": self.error,
            "filename": Path(self.filepath).name if self.filepath else None,
        }


def start_clip(url, start_ms, end_ms, duration_ms, kind, height=None, container=None):
    """kind: 'video' | 'audio' | 'mp3'. Returns job id immediately."""
    job = Job()
    with _jobs_lock:
        JOBS[job.id] = job
    args = (job, url, start_ms, end_ms, duration_ms, kind, height, container)
    threading.Thread(target=_run_job, args=args, daemon=True).start()
    return job.id


def _run_job(job, url, start_ms, end_ms, duration_ms, kind, height, container):
    try:
        job.status = "running"
        job.message = "Preparing…"
        wait_for_ffmpeg()
        if not _try_fastclip(job, url, start_ms, end_ms, duration_ms, kind, height):
            _download(job, url, start_ms, end_ms, duration_ms, kind, height, container)
        files = [p for p in job.dir.iterdir() if p.is_file() and not p.name.endswith((".part", ".ytdl"))]
        if not files:
            raise RuntimeError("Download finished but no output file was produced")
        job.filepath = str(max(files, key=lambda p: p.stat().st_size))
        job.percent = 100
        job.message = "Done"
        job.status = "done"
    except Exception as exc:
        job.status = "error"
        job.error = _friendly_error(str(exc))
        job.message = "Failed"


def _try_fastclip(job, url, start_ms, end_ms, duration_ms, kind, height):
    """Attempt the fast byte-range clip path. Returns True on success,
    False to fall back to the yt-dlp section downloader (which is slow but
    handles every format)."""
    from . import fastclip

    is_full = start_ms <= 0 and (duration_ms <= 0 or end_ms >= duration_ms - 500)
    if is_full or kind not in ("video", "audio", "mp3"):
        return False
    try:
        with yt_dlp.YoutubeDL(dict(_YDL_QUIET, skip_download=True)) as ydl:
            info = ydl.extract_info(url, download=False)

        def on_progress(pct, msg):
            job.percent = max(job.percent, pct)
            job.message = msg

        job.filepath = fastclip.make_clip(
            info, start_ms / 1000.0, end_ms / 1000.0, kind,
            height, job.dir, ffmpeg_path(), on_progress=on_progress)
        for p in job.dir.glob("_*.part.mp4"):
            p.unlink(missing_ok=True)
        return True
    except fastclip.FastClipUnavailable:
        job.message = "Retrying with fallback downloader…"
        job.percent = 0
        return False


def _download(job, url, start_ms, end_ms, duration_ms, kind, height, container):
    is_full = start_ms <= 0 and (duration_ms <= 0 or end_ms >= duration_ms - 500)

    def progress_hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            done = d.get("downloaded_bytes") or 0
            if total:
                job.percent = min(80, (done / total) * 80)
            job.message = "Downloading…"
        elif d.get("status") == "finished":
            job.percent = max(job.percent, 80)
            job.message = "Processing…"

    def pp_hook(d):
        if d.get("status") == "started":
            job.percent = max(job.percent, 85)
            job.message = "Processing…"
        elif d.get("status") == "finished":
            job.percent = max(job.percent, 95)

    opts = dict(_YDL_QUIET)
    opts.update({
        "outtmpl": str(job.dir / "%(title).80s [%(id)s].%(ext)s"),
        "windowsfilenames": True,
        "progress_hooks": [progress_hook],
        "postprocessor_hooks": [pp_hook],
        "retries": 3,
        "fragment_retries": 5,
        "concurrent_fragment_downloads": 6,
    })

    if not is_full:
        start_s = max(0, start_ms / 1000.0)
        end_s = end_ms / 1000.0
        opts["download_ranges"] = download_range_func(None, [(start_s, end_s)])
        # Re-encode at the cut points so clips start exactly where asked
        opts["force_keyframes_at_cuts"] = True

    if kind == "video":
        h = int(height or 2160)
        opts["format"] = (
            f"bestvideo[height<={h}][ext=mp4]+bestaudio[ext=m4a]"
            f"/bestvideo[height<={h}]+bestaudio"
            f"/best[height<={h}]/best"
        )
        opts["merge_output_format"] = "mp4"
    elif kind == "audio":
        if container == "opus":
            opts["format"] = "bestaudio[ext=webm]/bestaudio"
        else:
            opts["format"] = "bestaudio[ext=m4a]/bestaudio"
    elif kind == "mp3":
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",
        }]
    else:
        raise ValueError(f"Unknown download kind: {kind}")

    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])


def get_job(job_id):
    with _jobs_lock:
        return JOBS.get(job_id)


def _friendly_error(msg):
    msg = re.sub(r"\x1b\[[0-9;]*m", "", msg)  # strip ANSI colour codes
    lowered = msg.lower()
    if "sign in to confirm" in lowered or "not a bot" in lowered:
        return ("YouTube is asking this network to prove it isn't a bot. "
                "This usually clears up after a while; try again later.")
    if "private video" in lowered:
        return "This video is private and can't be downloaded."
    if "age" in lowered and "confirm" in lowered:
        return "This video is age-restricted and can't be downloaded without a login."
    if "unavailable" in lowered:
        return "This video is unavailable (deleted, blocked in your region, or the link is wrong)."
    return msg[:500]

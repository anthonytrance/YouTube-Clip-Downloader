"""Fast clip path: fetch only the byte ranges a clip needs, cut locally.

Why this exists: yt-dlp's --download-sections hands the media URLs to the
ffmpeg downloader, whose scattered small Range reads collapse to ~10-100 KB/s
against googlevideo. The server itself serves large ranged requests at full
speed (measured 10-13 MB/s), so we parse the MP4 segment index (sidx)
ourselves, map the requested seconds to byte spans, download those spans in a
handful of big requests, and do the exact cut with local ffmpeg.

Only DASH MP4 (avc1/av01 video, m4a audio) is handled — those carry a sidx
and are what we prefer for social-media compatibility anyway. Anything else
raises FastClipUnavailable and the caller falls back to the yt-dlp path.
"""

import struct
import subprocess
import sys
import threading

from curl_cffi import requests as _creq

HEAD_BYTES = 600_000       # sidx normally sits well inside the first 300 KB
MAX_CLIP_BYTES = 400_000_000

_CHUNK = 9_000_000         # googlevideo serves ~10 MB range= chunks happily


class FastClipUnavailable(Exception):
    """Raised when this path can't handle the format; caller must fall back."""


# ---------------------------------------------------------------------------
# Hardware encoder detection (exact cuts need a re-encode of the clip;
# hardware encoders turn a ~25s libx264 encode into a few seconds)
# ---------------------------------------------------------------------------

_hw_encoder = [False]  # False = not probed yet; None = no hw encoder
_hw_lock = threading.Lock()

_HW_CANDIDATES = (["h264_videotoolbox"] if sys.platform == "darwin"
                  else ["h264_nvenc", "h264_qsv", "h264_amf"])


def _probe_encoder(ffmpeg, name):
    r = subprocess.run(
        [ffmpeg, "-v", "error", "-f", "lavfi", "-i",
         "color=black:s=256x256:d=0.2,format=yuv420p",
         "-c:v", name, "-f", "null", "-"],
        capture_output=True, text=True, timeout=30)
    return r.returncode == 0


def hw_encoder(ffmpeg):
    with _hw_lock:
        if _hw_encoder[0] is False:
            _hw_encoder[0] = None
            for name in _HW_CANDIDATES:
                try:
                    if _probe_encoder(ffmpeg, name):
                        _hw_encoder[0] = name
                        break
                except Exception:
                    pass
        return _hw_encoder[0]


def _video_codec_args(ffmpeg, height, fps):
    enc = hw_encoder(ffmpeg)
    if not enc:
        return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
    # Hardware encoders ignore crf; use a bitrate ladder instead.
    h = height or 1080
    mbps = 3 if h <= 480 else 5 if h <= 720 else 8 if h <= 1080 else 16
    if (fps or 30) > 40:
        mbps = int(mbps * 1.4)
    args = ["-c:v", enc, "-b:v", f"{mbps}M", "-maxrate", f"{mbps * 2}M"]
    if enc == "h264_videotoolbox":
        args += ["-allow_sw", "1"]
    return args


def _fetch_range(url, byte_start, byte_end):
    """Fetch [byte_start, byte_end] via the range= URL param (fast path).

    The range= query parameter is what YouTube's own player uses; googlevideo
    serves it at full speed, unlike header-based mid-file Range reads from
    non-player-looking clients.
    """
    out = bytearray()
    pos = byte_start
    while pos <= byte_end:
        hi = min(pos + _CHUNK - 1, byte_end)
        r = _creq.get(f"{url}&range={pos}-{hi}",
                      impersonate="chrome124", timeout=120)
        if r.status_code == 400 and pos == 0:
            # Asked past end of a small file (filesize unknown/approx):
            # fetch it whole instead.
            r = _creq.get(url, impersonate="chrome124", timeout=120)
            r.raise_for_status()
            return bytes(r.content)
        r.raise_for_status()
        if not r.content:
            raise FastClipUnavailable(f"empty range response at {pos}")
        out += r.content
        if len(r.content) < hi - pos + 1:
            # short read: server gave us up to EOF
            return bytes(out)
        pos += len(r.content)
    return bytes(out)


def _boxes(buf):
    pos = 0
    while pos + 8 <= len(buf):
        size, = struct.unpack_from(">I", buf, pos)
        typ = buf[pos + 4:pos + 8]
        if size == 1 and pos + 16 <= len(buf):
            size, = struct.unpack_from(">Q", buf, pos + 8)
        if size < 8:
            return
        yield typ, pos, size
        pos += size


def _parse_sidx(buf, box_start, box_size):
    b = buf[box_start:box_start + box_size]
    version = b[8]
    timescale, = struct.unpack_from(">I", b, 16)
    if version == 0:
        ept, first_off = struct.unpack_from(">II", b, 20)
        p = 28
    else:
        ept, first_off = struct.unpack_from(">QQ", b, 20)
        p = 36
    p += 2
    count, = struct.unpack_from(">H", b, p)
    p += 2
    segs = []
    t = ept
    off = box_start + box_size + first_off
    for _ in range(count):
        if p + 12 > len(b):
            raise FastClipUnavailable("truncated sidx")
        sz, dur, _sap = struct.unpack_from(">III", b, p)
        sz &= 0x7FFFFFFF
        segs.append((off, sz, t / timescale, dur / timescale))
        off += sz
        t += dur
        p += 12
    return segs


def _partial_stream(url, start_s, end_s, dest, filesize=None):
    """Write init + the segments covering [start_s, end_s] to dest.

    Returns the media time (seconds) at which the partial file begins.
    filesize clamps range requests: googlevideo answers 400, not a short
    read, when a range= request extends past end of file.
    """
    head_end = HEAD_BYTES - 1
    if filesize:
        head_end = min(head_end, filesize - 1)
    head = _fetch_range(url, 0, head_end)
    sidx = None
    for typ, pos, size in _boxes(head):
        if typ == b"sidx":
            if pos + size > len(head):
                raise FastClipUnavailable("sidx extends past head fetch")
            sidx = (pos, size)
            break
    if sidx is None:
        raise FastClipUnavailable("no sidx box found")
    segs = _parse_sidx(head, *sidx)
    need = [s for s in segs if s[2] + s[3] > start_s and s[2] < end_s]
    if not need:
        raise FastClipUnavailable("requested range outside sidx coverage")
    lo = need[0][0]
    hi = need[-1][0] + need[-1][1] - 1
    if filesize:
        hi = min(hi, filesize - 1)
    if hi - lo > MAX_CLIP_BYTES:
        raise FastClipUnavailable("clip byte span too large")
    init = head[:sidx[0] + sidx[1]]
    media = _fetch_range(url, lo, hi)
    with open(dest, "wb") as f:
        f.write(init)
        f.write(media)
    return need[0][2]


def _pick_formats(info, height_cap):
    """Choose DASH-MP4 video + m4a audio format dicts from extract_info."""
    vids, auds = [], []
    for f in info.get("formats") or []:
        if not f.get("url"):
            continue
        proto = f.get("protocol") or ""
        if proto not in ("https", "http"):
            continue
        if f.get("container") == "mp4_dash" or (
                f.get("ext") == "mp4" and f.get("acodec") in (None, "none")):
            if f.get("vcodec") not in (None, "none") and f.get("height"):
                vids.append(f)
        if f.get("ext") == "m4a" and f.get("vcodec") in (None, "none") \
                and f.get("acodec") not in (None, "none"):
            auds.append(f)

    def vkey(f):
        avc = 1 if (f.get("vcodec") or "").startswith("avc1") else 0
        return (avc, f.get("height") or 0, f.get("tbr") or 0)

    vids = [f for f in vids if (f.get("height") or 0) <= height_cap]
    # Prefer h264 for universal playback; among same codec prefer resolution.
    vids.sort(key=vkey, reverse=True)
    auds.sort(key=lambda f: f.get("abr") or 0, reverse=True)
    if not auds:
        raise FastClipUnavailable("no m4a audio format")
    return (vids[0] if vids else None), auds[0]


def make_clip(info, start_s, end_s, kind, height, out_dir, ffmpeg,
              on_progress=None, exact=True):
    """Produce a clip file. Returns the output file path.

    info: the already-resolved yt-dlp info dict (with format URLs).
    kind: 'video' | 'audio' | 'mp3'.
    exact=True re-encodes video for frame-exact boundaries. exact=False
    stream-copies the downloaded segments untouched: bit-identical quality,
    but the clip snaps outward to keyframe-aligned segment boundaries
    (typically up to ~5s extra on each side). Audio is always stream-copied
    for 'audio' (m4a) since AAC packet cuts are accurate to ~20ms anyway.
    Raises FastClipUnavailable if this path can't serve the request.
    """
    def report(pct, msg):
        if on_progress:
            on_progress(pct, msg)

    duration = end_s - start_s
    if duration <= 0:
        raise ValueError("end must be after start")
    vfmt, afmt = _pick_formats(info, height or 10_000)
    if kind == "video" and vfmt is None:
        raise FastClipUnavailable("no suitable mp4 video format")

    title = (info.get("title") or "clip")[:80]
    safe = "".join(c for c in title if c not in '\\/:*?"<>|').strip() or "clip"
    vid = info.get("id") or "x"

    report(10, "Downloading…")
    parts = {}
    errors = []

    def grab(label, fmt):
        try:
            dest = str(out_dir / f"_{label}.part.mp4")
            size = fmt.get("filesize") or None
            seg0 = _partial_stream(fmt["url"], start_s, end_s, dest, size)
            parts[label] = (dest, seg0)
        except Exception as exc:
            errors.append(f"{label}: {exc}")

    threads = [threading.Thread(target=grab, args=("a", afmt))]
    if kind == "video":
        threads.append(threading.Thread(target=grab, args=("v", vfmt)))
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    if errors:
        raise FastClipUnavailable("; ".join(errors))

    report(55, "Cutting…")
    apath, aseg0 = parts["a"]
    cmd = [ffmpeg, "-y", "-v", "error"]
    if kind == "video" and not exact:
        # Lossless: remux the keyframe-aligned segments untouched. The clip
        # spans whole segments, so it starts/ends a little outside the
        # requested marks but the video bits are identical to YouTube's.
        vpath, vseg0 = parts["v"]
        out = out_dir / f"{safe} [{vid}] lossless.mp4"
        cmd += ["-i", vpath, "-ss", f"{max(0, start_s - vseg0):.3f}",
                "-i", apath,
                "-map", "0:v:0", "-map", "1:a:0",
                "-c", "copy", "-shortest",
                "-movflags", "+faststart", str(out)]
    elif kind == "video":
        vpath, vseg0 = parts["v"]
        out = out_dir / f"{safe} [{vid}].mp4"
        cmd += ["-ss", f"{start_s - vseg0:.3f}", "-i", vpath,
                "-ss", f"{start_s - aseg0:.3f}", "-i", apath,
                "-t", f"{duration:.3f}",
                "-map", "0:v:0", "-map", "1:a:0",
                *_video_codec_args(ffmpeg, vfmt.get("height"), vfmt.get("fps")),
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart", str(out)]
    elif kind == "audio":
        # Stream copy: zero quality loss; AAC packet cuts are ~20ms accurate.
        out = out_dir / f"{safe} [{vid}].m4a"
        cmd += ["-ss", f"{start_s - aseg0:.3f}", "-i", apath,
                "-t", f"{duration:.3f}",
                "-c:a", "copy", str(out)]
    elif kind == "mp3":
        out = out_dir / f"{safe} [{vid}].mp3"
        cmd += ["-ss", f"{start_s - aseg0:.3f}", "-i", apath,
                "-t", f"{duration:.3f}",
                "-c:a", "libmp3lame", "-b:a", "320k", str(out)]
    else:
        raise ValueError(f"unknown kind {kind}")

    r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if r.returncode or not out.exists() or out.stat().st_size == 0:
        raise FastClipUnavailable(f"ffmpeg cut failed: {r.stderr[:300]}")
    report(95, "Finishing…")
    return str(out)

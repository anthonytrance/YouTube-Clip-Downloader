"""Flask server + command-line entry point."""

import argparse
import json
import logging
import socket
import sys
import threading
import urllib.request
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory

from . import __version__, engine

STATIC_DIR = Path(__file__).parent / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")

_update_available = [None]  # newer yt-dlp version string, if any


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(str(STATIC_DIR), "index.html")


@app.route("/api/health")
def health():
    import yt_dlp.version
    return jsonify({
        "ok": True,
        "app_version": __version__,
        "ytdlp_version": yt_dlp.version.__version__,
        "ytdlp_update_available": _update_available[0],
    })


@app.route("/api/info")
def info():
    url = (request.args.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Missing url parameter"}), 400
    try:
        return jsonify(engine.get_info(url))
    except Exception as exc:
        return jsonify({"error": engine._friendly_error(str(exc))}), 422


@app.route("/api/clip", methods=["POST"])
def clip():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Missing url"}), 400
    kind = data.get("kind")
    if kind not in ("video", "audio", "mp3"):
        return jsonify({"error": f"Invalid kind: {kind}"}), 400
    try:
        job_id = engine.start_clip(
            url=url,
            start_ms=int(data.get("start_ms") or 0),
            end_ms=int(data.get("end_ms") or 0),
            duration_ms=int(data.get("duration_ms") or 0),
            kind=kind,
            height=data.get("height"),
            container=data.get("container"),
            exact=bool(data.get("exact", True)),
        )
        return jsonify({"job_id": job_id})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/job/<job_id>")
def job_status(job_id):
    job = engine.get_job(job_id)
    if not job:
        return jsonify({"error": "Unknown job"}), 404
    return jsonify(job.as_dict())


@app.route("/api/job/<job_id>/file")
def job_file(job_id):
    job = engine.get_job(job_id)
    if not job or job.status != "done" or not job.filepath:
        return jsonify({"error": "File not ready"}), 404
    return send_file(job.filepath, as_attachment=True)


# ---------------------------------------------------------------------------
# Phone access (opt-in LAN listener on port+1, same app)
# ---------------------------------------------------------------------------

_lan_state = {"server": None, "thread": None, "port": None}
_lan_lock = threading.Lock()


def _lan_payload():
    ip = _lan_ip()
    enabled = _lan_state["server"] is not None
    if not enabled or not ip:
        return {"enabled": enabled, "url": None, "qr_svg": None,
                "reachable": bool(ip)}
    url = f"http://{ip}:{_lan_state['port']}"
    import io

    import qrcode
    import qrcode.image.svg

    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage,
                      box_size=14)
    buf = io.BytesIO()
    img.save(buf)
    return {"enabled": True, "url": url,
            "qr_svg": buf.getvalue().decode("utf-8"), "reachable": True}


def _funnel_payload():
    """Return the public Funnel URL without exposing the private LAN address."""
    host = request.host.partition(":")[0].lower().rstrip(".")
    if not host.endswith(".ts.net"):
        return None
    url = f"https://{host}"
    import io

    import qrcode
    import qrcode.image.svg

    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage,
                      box_size=14)
    buf = io.BytesIO()
    img.save(buf)
    return {"enabled": True, "external": True, "url": url,
            "qr_svg": buf.getvalue().decode("utf-8"), "reachable": True}


@app.route("/api/lan", methods=["GET", "POST"])
def lan():
    funnel = _funnel_payload()
    if funnel:
        return jsonify(funnel)
    if request.method == "GET":
        return jsonify(_lan_payload())
    enable = bool((request.get_json(silent=True) or {}).get("enable"))
    with _lan_lock:
        if enable and _lan_state["server"] is None:
            from werkzeug.serving import make_server

            port = int(app.config.get("YTCLIP_PORT", 8574)) + 1
            try:
                srv = make_server("0.0.0.0", port, app, threaded=True)
            except OSError as exc:
                return jsonify({"error": f"Could not open port {port}: {exc}"}), 500
            t = threading.Thread(target=srv.serve_forever, daemon=True)
            t.start()
            _lan_state.update(server=srv, thread=t, port=port)
        elif not enable and _lan_state["server"] is not None:
            try:
                _lan_state["server"].shutdown()
            except Exception:
                pass
            _lan_state.update(server=None, thread=None, port=None)
    return jsonify(_lan_payload())


# ---------------------------------------------------------------------------
# yt-dlp update check (non-fatal, runs in background)
# ---------------------------------------------------------------------------

def _check_ytdlp_update():
    try:
        import yt_dlp.version
        current = yt_dlp.version.__version__
        with urllib.request.urlopen("https://pypi.org/pypi/yt-dlp/json", timeout=15) as resp:
            latest = json.load(resp)["info"]["version"]

        def _ver(v):
            return tuple(int(p) for p in v.split(".") if p.isdigit())

        if _ver(latest) > _ver(current):
            _update_available[0] = latest
            print(f"\n  A newer yt-dlp is available ({current} -> {latest}).")
            print("  To update, run:  uv tool upgrade yt-clip-downloader\n")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return None
    finally:
        s.close()


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="ytclip",
        description="YouTube Clip Downloader — local web app.",
    )
    parser.add_argument("--port", type=int, default=8574, help="port to listen on (default 8574)")
    parser.add_argument("--lan", action="store_true",
                        help="also allow other devices on your home network (e.g. your phone) to connect")
    parser.add_argument("--no-browser", action="store_true", help="don't open the browser automatically")
    parser.add_argument("--selftest", action="store_true",
                        help="verify the install: ffmpeg + clipping machinery (offline)")
    parser.add_argument("--online", action="store_true",
                        help="with --selftest: also test a real (tiny) YouTube download")
    parser.add_argument("--smoke", action="store_true", help="start the server, check health, exit (CI)")
    parser.add_argument("--version", action="version", version=f"ytclip {__version__}")
    args = parser.parse_args(argv)

    if args.selftest:
        from . import selftest
        sys.exit(selftest.run(online=args.online))

    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    app.config["YTCLIP_PORT"] = args.port
    engine.ensure_ffmpeg_async()
    threading.Thread(target=_check_ytdlp_update, daemon=True).start()

    host = "0.0.0.0" if args.lan else "127.0.0.1"
    local_url = f"http://127.0.0.1:{args.port}"

    if args.smoke:
        threading.Thread(
            target=lambda: app.run(host=host, port=args.port, threaded=True, use_reloader=False),
            daemon=True,
        ).start()
        import time
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"{local_url}/api/health", timeout=3) as resp:
                    payload = json.load(resp)
                    if payload.get("ok"):
                        print(f"SMOKE OK: {payload}")
                        return 0
            except Exception:
                time.sleep(0.5)
        print("SMOKE FAILED: server did not become healthy within 30s")
        return 1

    print()
    print("  YouTube Clip Downloader is running.")
    print(f"  Open this address in your browser:  {local_url}")
    if args.lan:
        ip = _lan_ip()
        if ip:
            print(f"  From your phone (same WiFi):        http://{ip}:{args.port}")
    print()
    print("  First run only: ffmpeg is downloaded in the background (~80 MB),")
    print("  so the very first download may take a little longer to start.")
    print()
    print("  Press Ctrl+C to quit.")
    print()

    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(local_url)).start()

    try:
        app.run(host=host, port=args.port, threaded=True, use_reloader=False)
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())

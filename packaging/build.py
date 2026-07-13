"""Build a portable one-folder app for the current platform.

Usage:  python packaging/build.py
Output: dist/YouTube Clipper/            (folder with launcher + bin/)
        dist/YouTube-Clipper-<os>.zip

Bundles ffmpeg/ffprobe (via static-ffmpeg's downloaded binaries) and a
platform Deno executable into bin/ so the app needs zero setup and no
network bootstrap on first run.
"""
import io
import os
import platform
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
APP_NAME = "YouTube Clipper"

DENO_ASSETS = {
    ("Windows", "AMD64"): "deno-x86_64-pc-windows-msvc.zip",
    ("Darwin", "arm64"): "deno-aarch64-apple-darwin.zip",
    ("Darwin", "x86_64"): "deno-x86_64-apple-darwin.zip",
    ("Linux", "x86_64"): "deno-x86_64-unknown-linux-gnu.zip",
}


def ffmpeg_paths():
    from static_ffmpeg import run

    ffmpeg, ffprobe = run.get_or_fetch_platform_executables_else_raise()
    return Path(ffmpeg), Path(ffprobe)


def fetch_deno(dest_dir):
    key = (platform.system(), platform.machine())
    asset = DENO_ASSETS.get(key)
    if not asset:
        raise SystemExit(f"No deno asset mapping for {key}")
    url = f"https://github.com/denoland/deno/releases/latest/download/{asset}"
    print(f"Downloading {url}")
    with urllib.request.urlopen(url, timeout=300) as resp:
        data = resp.read()
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        zf.extractall(dest_dir)
    exe = dest_dir / ("deno.exe" if platform.system() == "Windows" else "deno")
    if not exe.exists():
        raise SystemExit("deno executable missing after extraction")
    if platform.system() != "Windows":
        exe.chmod(0o755)
    return exe


def main():
    os.chdir(ROOT)
    shutil.rmtree(DIST / APP_NAME, ignore_errors=True)

    sep = ";" if platform.system() == "Windows" else ":"
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--clean",
        "--name", APP_NAME,
        "--distpath", str(DIST),
        "--specpath", str(ROOT / "packaging"),
        "--workpath", str(ROOT / "build"),
        "--add-data", f"{ROOT / 'ytclip' / 'static'}{sep}ytclip/static",
        "--collect-all", "yt_dlp_ejs",
        "--collect-all", "curl_cffi",
        "--hidden-import", "ytclip",
        "--hidden-import", "qrcode",
        "--hidden-import", "qrcode.image.svg",
        str(ROOT / "packaging" / "launcher.py"),
    ]
    subprocess.run(cmd, check=True)

    app_dir = DIST / APP_NAME
    bin_dir = app_dir / "bin"
    bin_dir.mkdir(exist_ok=True)

    ffmpeg, ffprobe = ffmpeg_paths()
    shutil.copy2(ffmpeg, bin_dir / ffmpeg.name)
    shutil.copy2(ffprobe, bin_dir / ffprobe.name)
    fetch_deno(bin_dir)

    readme = app_dir / "README.txt"
    readme.write_text(
        "YouTube Clipper\n"
        "===============\n\n"
        f"Open '{APP_NAME}.exe' (Windows) or '{APP_NAME}' (Mac/Linux).\n"
        "Your browser opens the clipper automatically.\n"
        "Close the black window (or press Ctrl+C in it) to stop the app.\n",
        encoding="utf-8",
    )

    if platform.system() == "Darwin":
        osname = "Mac-AppleSilicon" if platform.machine() == "arm64" else "Mac-Intel"
    else:
        osname = {"Windows": "Windows", "Linux": "Linux"}[platform.system()]
    zip_path = DIST / f"YouTube-Clipper-{osname}"
    shutil.make_archive(str(zip_path), "zip", DIST, APP_NAME)
    print(f"\nBuilt: {app_dir}\nZip:   {zip_path}.zip")


if __name__ == "__main__":
    main()

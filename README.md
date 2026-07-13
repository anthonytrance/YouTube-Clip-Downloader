# YouTube Clipper

Cut an exact piece out of any YouTube video and save it as a file, using
nothing but your own computer. Paste a link, watch the video, press
"Set start here" and "Set end here" at the right moments, and download
your clip as video or audio. Everything runs locally: nothing is uploaded
anywhere, and downloads use your own internet connection.

Built to be fully usable with a screen reader and keyboard only.

## Download

Grab the version for your computer, unzip it, open the app. No installer,
no account, no setup.

- Windows: https://github.com/anthonytrance/YouTube-Clip-Downloader/releases/latest/download/YouTube-Clipper-Windows.zip
- Mac with Apple Silicon (M1 or newer, most Macs since 2021): https://github.com/anthonytrance/YouTube-Clip-Downloader/releases/latest/download/YouTube-Clipper-Mac-AppleSilicon.zip
- Mac with Intel (older Macs): https://github.com/anthonytrance/YouTube-Clip-Downloader/releases/latest/download/YouTube-Clipper-Mac-Intel.zip

Not sure which Mac you have? Apple menu, About This Mac. If it mentions
M1, M2, M3 or M4, take the Apple Silicon one.

### First launch

- **Windows**: double-click `YouTube Clipper.exe`. The first time, Windows
  shows a blue "Windows protected your PC" screen because the app isn't
  code-signed. Click "More info", then "Run anyway". Once.
- **Mac**: double-click `YouTube Clipper`. macOS will refuse the first
  time ("unidentified developer"). Open System Settings, Privacy &
  Security, scroll down and click "Open Anyway" next to the message about
  YouTube Clipper, then confirm. Once.

Your browser then opens the clipper page automatically. Closing the small
terminal window that appears alongside stops the app.

## How to use it

1. Paste a YouTube link and press Load.
2. The video appears with a player. Play it.
3. At the moment your clip should begin, press "Set start here".
   At the end, press "Set end here". You can also press `I` for the start
   point and `O` for the end point while you are not typing. Fine-tune with
   the plus and minus buttons (1 second and 0.1 second steps), drag the S and
   E timeline markers, or type exact times.
4. Press "Preview clip" to hear/see exactly what you selected.
5. Pick a format:
   - Video (choose a resolution)
   - Audio (m4a, original quality, cut with zero quality loss)
   - MP3 (320 kbps)
6. By default cuts are frame-exact, which re-encodes the video once.
   Untick "Frame-exact cut" to keep YouTube's original video bits
   untouched instead; the clip then starts and ends at the nearest safe
   cut points, usually a few seconds wider than your markers.
7. Press "Download clip". The file lands in your normal Downloads folder.

A 15-second clip typically takes a couple of seconds in lossless mode and
around 10-15 seconds frame-exact, depending on your machine.

## Use it from your phone

At the bottom of the page there's "Use from your phone". Turn it on and
the app shows an address plus a QR code. Open that address in your
phone's browser (or scan the code with the camera) while the phone is on
the same WiFi as the computer, and you get the same clipper on the phone,
with downloads landing in the phone's browser downloads. Turn it off when
you don't need it; it's off by default and the app is otherwise only
reachable from the computer it runs on.

Your phone and computer must be on the same trusted home WiFi. The first
time you turn phone access on, the computer's firewall may ask permission:

- **Windows:** On the Windows Security firewall question, select **Private
  networks**, clear **Public networks**, then choose **Allow access**. If you
  previously blocked or dismissed it, open **Windows Security**, **Firewall
  & network protection**, **Allow an app through firewall**, then **Change
  settings**. Allow **YouTube Clipper** on **Private** networks only. If it is
  missing, choose **Allow another app** and select `YouTube Clipper.exe` from
  the unzipped folder. If it still fails after you previously chose **Cancel**
  or **Don't allow**, open **Firewall & network protection**, **Advanced
  settings**, then **Inbound Rules**. Remove only blocking rules named
  **YouTube Clipper**, restart the app, turn phone access on again, and allow
  it on the Private network.
- **Mac:** If macOS asks whether YouTube Clipper should accept incoming
  network connections, choose **Allow**. If you previously chose **Deny**,
  open Apple menu, **System Settings**, **Network**, **Firewall**, **Options**.
  Add `YouTube Clipper` from the unzipped folder if needed and set it to
  **Allow incoming connections**.

Do not disable the firewall itself. Allowing the app is safer than opening a
permanent port. Phone access stops listening when you turn it off in the
clipper or close the app.

## For developers

Python 3.9+. `pip install .` then `ytclip`. Useful flags: `--port`,
`--no-browser`, `--lan`, `--selftest [--online]`, `--smoke`.
`packaging/build.py` produces the portable builds (PyInstaller, bundles
ffmpeg and Deno). Architecture and history: see `HANDOFF.md` and
`PLAN.md`. CI runs install + selftest on macOS and Windows; the Package
workflow builds all three portable zips.

Please respect copyright and YouTube's Terms of Service. This tool is for
clipping content you own or are authorized to reuse.

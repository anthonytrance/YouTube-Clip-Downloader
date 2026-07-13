# YouTube Clip Downloader

Clip and download any segment of a YouTube video — any resolution, native audio, or MP3 at 320 kbps.

Everything runs **on your own computer**: a small app starts in the background and opens a friendly page in your browser where you paste a link, pick your start and end point, choose a format, and download. No accounts, no ads, no third-party servers.

Works on **macOS** and **Windows**. Fully keyboard-accessible and screen-reader friendly.

---

## Install (one time)

You'll paste one command into a terminal. It looks technical, but it's copy, paste, press Enter, wait a minute. That's genuinely all.

### macOS

1. Open **Terminal** (press Cmd+Space, type `terminal`, press Enter).
2. Copy this whole line, paste it into Terminal, and press Enter:

```
curl -LsSf https://astral.sh/uv/install.sh | sh && ~/.local/bin/uv tool install git+https://github.com/anthonytrance/YouTube-Clip-Downloader && ~/.local/bin/ytclip
```

3. Wait while it sets itself up (a minute or two). When it's done, your browser opens with the app running. Done.

### Windows

1. Open **PowerShell** (press the Windows key, type `powershell`, press Enter).
2. Copy this whole line, paste it into PowerShell, and press Enter:

```
irm https://astral.sh/uv/install.ps1 | iex; & "$env:USERPROFILE\.local\bin\uv.exe" tool install git+https://github.com/anthonytrance/YouTube-Clip-Downloader; & "$env:USERPROFILE\.local\bin\ytclip.exe"
```

3. Same story: wait a minute, browser opens, done.

---

## Using it (every time after that)

Open a terminal and type:

```
ytclip
```

The app starts and your browser opens automatically. Paste a YouTube link, press Load, choose your clip range and format, press Download clip. The file lands in your normal Downloads folder.

To stop the app, go back to the terminal window and press Ctrl+C (or just close the window).

Note for the very first download: the app fetches its video-processing engine (ffmpeg, about 80 MB) once in the background, so the first download can take a little longer to start. After that it's fast.

---

## Using it from your phone

Start the app with:

```
ytclip --lan
```

It prints an address like `http://192.168.1.23:8574`. Open that address in your phone's browser (phone must be on the same WiFi as the computer). Same interface, downloads land on your phone.

---

## Checking that everything works

```
ytclip --selftest
```

This verifies the whole processing pipeline on your machine and prints a plain-language pass/fail report. Add `--online` to also test a real (tiny) YouTube download:

```
ytclip --selftest --online
```

---

## Updating

YouTube changes things regularly; the downloader engine (yt-dlp) releases fixes quickly. The app checks at startup and tells you when an update is available. To update, run:

```
uv tool upgrade yt-clip-downloader
```

If downloads suddenly stop working, this command is almost always the fix.

---

## Troubleshooting

**"command not found: ytclip" / "'ytclip' is not recognized"** — close the terminal window and open a new one (the install updates your path, which only takes effect in new windows). If it still doesn't work: on macOS run `~/.local/bin/ytclip`, on Windows run `& "$env:USERPROFILE\.local\bin\ytclip.exe"`.

**"YouTube is asking this network to prove it isn't a bot"** — YouTube occasionally challenges a network. It usually clears on its own; try again later. Running from a normal home connection (not a VPN) helps.

**Downloads fail with an extractor error** — run `uv tool upgrade yt-clip-downloader` and try again.

**Port already in use** — start with a different port: `ytclip --port 8600`.

---

## Accessibility

- Full keyboard navigation (arrow keys nudge the clip handles, Tab moves between controls)
- All controls have ARIA labels; progress and completion are announced via live regions
- Times can be typed directly (e.g. `1:23.456`) instead of dragging
- Respects reduced-motion and light/dark preferences

---

## Legal

Please respect copyright and the Terms of Service of content platforms. This tool is for personal, legitimate use only. You are responsible for what you download.

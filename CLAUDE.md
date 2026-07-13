# YouTube Clip Downloader

## What this project is
A locally-run app for clipping and downloading segments from public YouTube videos.
`ytclip` starts a small Flask server on the user's machine and opens an accessible
web UI in their browser. v2 (2026-07-08) replaced the dead GitHub Pages + Cloudflare
Worker design — see PLAN.md section 1 for why.

## Tech approach
- Backend: Python package `ytclip/` — Flask + yt-dlp (library) + static-ffmpeg
- Frontend: plain HTML/CSS/JS in `ytclip/static/`, no framework, served same-origin
- Clipping: yt-dlp `download_ranges` + `force_keyframes_at_cuts` (real ffmpeg, no wasm)
- Install: `uv tool install git+<this repo>` — one-paste commands are in README.md
- Accessible: time input boxes alongside visual drag handles, full keyboard nav, ARIA labels

## Key files
- `PLAN.md` — v2 architecture, API surface, testing strategy, limitations. Read this first.
- `ytclip/engine.py` — yt-dlp wrapper: info resolution, clip jobs, progress
- `ytclip/app.py` — Flask routes + CLI (`--lan`, `--selftest`, `--smoke`, `--port`)
- `ytclip/selftest.py` — offline + `--online` self-diagnosis, ffprobe-verified
- `.github/workflows/ci.yml` — macOS + Windows install/selftest/smoke matrix

## Testing rules
- After any change to engine.py or app.py, run `ytclip --selftest` locally and do one
  real end-to-end clip (Windows dev machine has a residential IP, CI does not).
- The `--online` CI step is continue-on-error because GitHub runner IPs get bot-walled
  by YouTube; a red online step in CI is NOT proof of breakage, test locally.

## Telegram reporting
The user follows progress on this project primarily via Telegram. Keep them in the loop proactively:

- **Send progress updates** when you finish a meaningful chunk of work. Roughly one update per meaningful milestone — not per file touched.
- **Report big problems immediately** when they happen, including what you've tried and what you need from the user.
- **Do not send code or internal thinking** over Telegram. Summarise outcomes in plain English.
- **Keep the tone brief and human.** Short paragraphs, no walls of text.

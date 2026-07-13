# YouTube Clip Downloader — Architecture (v2)

_Rewritten 2026-07-08. This replaces the 2026-04-17 plan._

---

## 1. Why v1 was abandoned

The original plan was a purely static GitHub Pages app that resolved YouTube streams
through public Piped/Invidious instances and clipped with ffmpeg.wasm in the browser.
During the build it pivoted to a Cloudflare Worker (youtubei.js resolver + byte proxy),
but the worker was never deployed and the site never worked end to end.

Research on 2026-07-08 confirmed the whole category is dead:

- **CORS is absolute.** A browser page on another origin cannot read responses from
  YouTube's Innertube API or from googlevideo.com stream URLs — Google sends no
  `Access-Control-Allow-Origin` headers. The official youtubei.js docs state a proxy
  server is mandatory for browser use.
- **The public resolver ecosystem collapsed.** As of July 2026 exactly ONE public Piped
  instance exists worldwide, and it can't resolve real YouTube formats anymore (returns
  Odysee mirrors or a single 240p stream with no audio). Of 12 remaining public Invidious
  instances, one has its API enabled and it 403s external calls. Cause: Google's
  datacenter-IP blocking + po_token attestation, escalating since 2024.
- **Datacenter IPs are the target.** Any cloud-hosted resolver (Cloudflare Workers
  included) sits on exactly the IP ranges YouTube blocks hardest.

Conclusion: the resolver must run on the **user's own machine**, on a residential IP.

## 2. What v2 is

A pip-installable Python app (`ytclip`) that runs a local web server and opens the
browser to the same accessible frontend v1 had.

- **Frontend:** unchanged plain HTML/CSS/JS from v1 (timeline scrubber, time inputs,
  format picker, progress, ARIA/live regions), served from `ytclip/static/` at
  `http://127.0.0.1:8574`. Preview still uses the official YouTube IFrame API.
- **Engine:** `yt-dlp` as a Python library. Clipping uses yt-dlp's native
  `download_ranges` + `force_keyframes_at_cuts` (precise re-encoded cuts), so the
  entire YouTube cat-and-mouse layer is maintained upstream by the yt-dlp team.
- **ffmpeg:** real binaries via the `static-ffmpeg` pip package (downloads once on
  first use, all platforms). ffmpeg.wasm, COOP/COEP and coi-serviceworker are gone.
- **Install/distribution:** `uv tool install git+https://github.com/anthonytrance/YouTube-Clip-Downloader`
  behind a one-paste command in the README. No PyPI publishing, no code signing needed.
- **Updates:** startup check against PyPI's yt-dlp version; user runs
  `uv tool upgrade yt-clip-downloader` (re-resolves both the app and yt-dlp from source).
- **Phone use:** `ytclip --lan` binds 0.0.0.0 and prints the LAN address for a phone
  on the same WiFi.

## 3. Backend API (all same-origin)

- `GET /api/health` — app + yt-dlp versions, update availability
- `GET /api/info?url=...` — metadata + simplified format list
  (video: one entry per quality label; audio: best m4a + best opus)
- `POST /api/clip` — `{url, start_ms, end_ms, duration_ms, kind: video|audio|mp3, height?, container?}`
  → `{job_id}`; runs in a background thread
- `GET /api/job/<id>` — `{status, percent, message, error, filename}`
- `GET /api/job/<id>/file` — the finished file as attachment

Full-video downloads (start 0, end ≥ duration) skip `download_ranges` entirely.
MP3 = `FFmpegExtractAudio` postprocessor at 320 kbps.

## 4. Testing

1. **Windows end-to-end** on the dev machine: real videos, real clips, ffprobe-verified.
2. **CI on GitHub Actions** (`.github/workflows/ci.yml`), macOS + Windows matrix:
   the real install path (`uv tool install .`), `ytclip --selftest` (offline: ffmpeg
   bootstrap, synthetic video, precise cut, MP3 cut, all ffprobe-verified), a server
   smoke test (`ytclip --smoke`), and `ytclip --selftest --online` as
   **continue-on-error** — GitHub runners are datacenter IPs, so the YouTube fetch may
   be bot-walled in CI even though it works from home connections.
3. **User-side:** `ytclip --selftest --online` ships in the app and prints a
   plain-language report, so a remote user can self-diagnose in one command.

## 5. Known limitations

- Age-restricted / members-only / private videos: not supported (no login).
- 1440p+ often comes as VP9/AV1; it's remuxed into MP4, which VLC and browsers play
  fine but old QuickTime may not.
- iOS: no native app possible (App Store policy); the `--lan` route is the phone story.
- If YouTube breaks yt-dlp, downloads fail until upstream ships a fix;
  `uv tool upgrade yt-clip-downloader` picks it up.

## 6. Possible later phases

- Other sites (SoundCloud, Vimeo, Twitch clips, TikTok): yt-dlp already supports them;
  mostly needs the frontend URL check relaxed and preview handled per-site.
- Packaged double-click apps (PyInstaller via GitHub Actions) if the terminal
  install proves too scary in practice.
- Livestream clipping from what already aired (yt-dlp `--live-from-start` territory).

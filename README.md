# YouTube Clip Downloader

A client-side web app for clipping and downloading segments from YouTube videos.
Hosted on GitHub Pages. No login required — just paste a URL and go.

**Live site:** https://anthonytrance.github.io/YouTube-Clip-Downloader/

---

## How it works

1. Paste a YouTube URL and click **Load**.
2. Use the scrubber (or type times directly) to select your clip range.
3. Choose a format — any resolution from 144p to 4K, native audio, or MP3 320kbps.
4. Click **Download clip** — FFmpeg runs in your browser, clips and packages the file, then saves it.

No server sees your download. All processing happens in your browser.

---

## Project structure

```
/                  ← GitHub Pages static site (the UI)
  index.html
  css/app.css
  js/
    config.js       ← Set WORKER_URL here after deploying the worker
    main.js
    time-input.js
    timeline.js
    format-picker.js
    progress.js
    download.js
  coi-serviceworker.js

/worker/           ← Cloudflare Worker (the YouTube resolver + byte proxy)
  README.md        ← Deploy instructions for the worker host
  src/index.js
  package.json
  wrangler.toml
```

---

## Setting up the worker

The app needs a Cloudflare Worker deployed to resolve YouTube stream URLs and proxy bytes.
See **[worker/README.md](worker/README.md)** for full deploy instructions.

Once the worker is deployed, update the `WORKER_URL` constant in `js/config.js`:

```js
const WORKER_URL = 'https://yt-clip-worker.YOUR-SUBDOMAIN.workers.dev';
```

Commit and push. GitHub Pages will pick up the change within a minute.

---

## Worker API health

The worker was last tested: **2026-04-17**

Known working Cloudflare Worker endpoint: *(set after worker is deployed)*

If streams stop working, the `youtubei.js` library in the worker may need updating:
```bash
cd worker && npm update youtubei.js && npx wrangler deploy
```

---

## Accessibility

- Full keyboard navigation (Arrow keys on timeline handles, Tab between controls)
- Screen reader friendly — all interactive elements have ARIA labels and live regions
- Supports `prefers-reduced-motion` and `prefers-color-scheme` (light/dark auto)
- Touch-optimised controls for mobile

---

## Planned features (not in MVP)

- Additional sites: SoundCloud, Vimeo, Twitch clips, TikTok, Facebook video
- Livestream clipping (clip from what's already aired)

---

## Legal

Please respect copyright and the Terms of Service of content platforms.
This tool is for personal, legitimate use. You are responsible for what you download.

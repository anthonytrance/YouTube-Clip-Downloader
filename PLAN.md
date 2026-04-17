# YouTube Clip Downloader — Implementation Plan

_Finalised 2026-04-17 during planning conversation with the user._
_This file is the handoff document. Sonnet picks this up and builds to it._

---

## 1. Product summary

A purely client-side web app, hosted on GitHub Pages, for:
1. Pasting a YouTube URL.
2. Previewing the video and choosing a start/end point (precise, with millisecond support, accessible).
3. Downloading either:
   - the full video or a clip, at any available resolution YouTube offers;
   - audio only (native M4A / Opus — instant, no re-encode);
   - MP3 at 320 kbps (re-encode required, clearly labelled).

No hard length limit. Mobile-responsive. Screen-reader friendly. Architected so we can later add SoundCloud, Vimeo, TikTok, Twitch, and Facebook video as new "site adapters" without rewriting the shell.

---

## 2. The hard constraints and how we're solving them

### 2.1 GitHub Pages = static hosting only

No server, no proxying, no secret keys. Everything runs in the user's browser.

### 2.2 YouTube actively blocks direct cross-origin stream access

We can't just `fetch()` YouTube's `googlevideo.com` stream URLs from a browser tab — they check origin / referer / tokens and rotate endpoints.

**Our solution:**
- Resolve stream URLs via a **Piped API instance** (first choice) with an **Invidious instance** fallback. Both are open-source public projects that expose a CORS-enabled JSON API returning the DASH stream URLs for a given video ID. Piped is the more reliable of the two for CORS.
- Keep a **configurable list of public instances** in the app. On startup, the app pings a few to see which are up + responding to CORS. If all fail, it shows a clear error: "All public resolver instances are currently down — please try again later or pick another instance."
- Allow the user to manually add / override instances in a settings drawer (advanced users only — tucked away).
- **Verify before every build** that the methods still work. Add a tiny "API health" section in the README listing currently-known-good instances and last-tested date.

### 2.3 FFmpeg.wasm needs SharedArrayBuffer → requires COOP/COEP headers GH Pages won't set

**Our solution:** ship `coi-serviceworker.js` (a well-known community workaround). On first load, the service worker registers and then reloads the page with synthetic COOP/COEP headers. This lets multi-threaded ffmpeg.wasm run. If the browser doesn't support service workers, we fall back to single-threaded ffmpeg (slower but works, and most clips are small enough that it's fine).

### 2.4 Video preview without downloading anything

Use the **YouTube IFrame Player API** (official, free, CORS-safe) embedded inside the page. It handles playback, seek, and loop between A and B points. This is what the user scrubs against. The iframe never exposes raw stream bytes — that's fine, because downloading happens separately via the Piped-resolved URL.

---

## 3. Architecture

### 3.1 File layout

```
/index.html
/css/
    app.css
    theme.css          # light/dark/auto
/js/
    main.js            # app bootstrap, UI wiring
    url-parser.js      # detect which site an URL belongs to
    time-input.js      # smart HH:MM:SS.ms parser + A/B handles
    timeline.js        # accessible scrubber
    format-picker.js   # renders the list of available download options
    progress.js        # progress UI + ffmpeg hooks
    download.js        # runs the clipping pipeline
    adapters/
        _interface.js  # the shape every adapter implements
        youtube.js     # MVP
        # (later) soundcloud.js, vimeo.js, tiktok.js, twitch.js, facebook.js
    vendor/
        ffmpeg/        # ffmpeg.wasm core + worker, pinned
        piped-client.js
        invidious-client.js
/coi-serviceworker.js
/README.md
/LICENSE               # MIT
/PLAN.md               # this file
/.github/workflows/    # (optional later) Pages deploy action
```

### 3.2 Site adapter interface

Every adapter implements the same shape:

```js
{
  id: 'youtube',
  detect(url) -> bool,               // does this URL belong to me?
  getMetadata(url) -> { title, thumbnail, duration, author },
  getStreams(url) -> [{ kind, resolution, codec, bitrate, url, size, container }],
  getPreviewEmbed(url) -> HTMLElement or config for iframe,
  supportsClipping: bool             // false for e.g. TikTok single-video dumps that are already short
}
```

Adding a new site = writing one file that implements this shape. The shell UI doesn't change.

### 3.3 Clipping pipeline (the core)

Given: video ID, start_ms, end_ms, chosen format.

**Path A — Full video download, native format (no re-encode, fast):**
1. Resolve stream URL via Piped.
2. Fetch full stream with progress.
3. Hand blob to user as download. Done.

**Path B — Clip, native container, precise cuts (re-encode around cuts):**
1. Resolve stream URL(s). DASH = separate video + audio streams.
2. Range-fetch only the bytes covering [start_ms - keyframe_padding, end_ms].
3. Run ffmpeg.wasm: `-ss {start} -to {end} -c:v libx264 -c:a aac` (re-encodes, precise to the frame).
4. If ffmpeg takes too long (>N seconds per second of output on this device) or OOMs, automatically retry as Path C.
5. Mux, download.

**Path C — Clip, keyframe-snap copy (fallback, fast, less precise):**
1. Same as B, but `-ss {nearest_keyframe_before_start} -to {nearest_keyframe_after_end} -c copy`.
2. Cuts land on keyframes, not on the user's exact drag points — but the preview will have been snapped to these same points so it matches what they heard.

**Path D — MP3 export:**
1. Resolve audio stream (Opus or M4A).
2. Range-fetch [start, end].
3. ffmpeg.wasm: `-c:a libmp3lame -b:a 320k`.
4. Download.

**Progress:** stream the ffmpeg log and surface a percentage + elapsed time. For very long clips, show the crash warning.

### 3.4 Preview behaviour

- IFrame player embedded at the top.
- Timeline below with A and B draggable handles + the time-input field.
- A "Preview" button plays only the A→B range and loops.
- If Path C (keyframe) would be chosen for this device + clip, the loop snaps A and B to the nearest keyframes so the preview matches the downloaded output exactly. This keyframe detection uses the DASH manifest's segment boundaries as a proxy (cheap, no download needed).
- Device-capability probe runs on page load: does this browser support SharedArrayBuffer + enough memory for precise ffmpeg? If yes, default to Path B. If no, default to Path C.

### 3.5 Time input

One text field that parses all of:
- `83` → 83 seconds
- `83s` → 83 seconds
- `83ms` → 0.083 seconds
- `1:23` → 1 minute 23 seconds
- `1:23.456` → 1 min 23.456 sec
- `1:02:03.4` → 1 hr 2 min 3.4 sec
- Raw ms int if trailing "ms"

Unit tests cover every case. Screen reader reads it as the natural English time ("one minute, twenty-three point four five six seconds").

### 3.6 Accessibility

- All interactive elements keyboard-reachable.
- Timeline handles: arrow keys nudge, shift+arrow jumps larger, home/end seek to edges.
- Every control has a visible focus ring and an ARIA label.
- Live region announces processing progress and completion.
- Colour contrast meets WCAG AA.
- Respects `prefers-reduced-motion`.
- Works without a pointer (touch or mouse not required).

### 3.7 Mobile

- CSS Grid main layout, collapses to a single column on narrow screens.
- Touch targets ≥ 44 px.
- Scrubber grows to ≥ 60 px height on touch devices.
- Known caveat: on-device clipping is slower on phones; the warning explains this.

### 3.8 Copyright notice

A small, dismissible banner at the bottom of the page: "Please respect copyright and the content source's Terms of Service. This tool is for personal, legitimate use. You are responsible for what you download."

---

## 4. MVP scope (what Sonnet builds first)

1. Static shell + CSS, responsive, theme-aware.
2. URL input + YouTube adapter (only — no other sites yet).
3. Metadata fetch via Piped (with Invidious fallback + user-configurable instance).
4. YouTube iframe preview with A/B loop.
5. Accessible timeline + time-input field.
6. Format picker showing all available resolutions + native audio + MP3 320 (re-encode).
7. Clipping pipeline: Paths A, B, C, D.
8. Progress UI.
9. Long-clip warning.
10. Copyright banner.
11. Error handling: instance down, age-gated, private, live, unsupported URL — all with friendly messages.
12. coi-serviceworker.
13. README with "how it works," instance list, and known limitations.
14. Deploy to GitHub Pages; verify live URL.

Livestream clip-from-what-aired and the other five site adapters are **explicitly out of MVP** — they're phase 2 / 3.

---

## 5. Phasing

- **Phase 1 — MVP** (above). Target: working live demo.
- **Phase 2 — Additional adapters.** SoundCloud, Vimeo, Twitch clips, TikTok, Facebook. Each is its own adapter file; the UI doesn't change.
- **Phase 3 — Livestream clipping.** Parse the HLS/DASH live manifest from Piped, fetch segments up to "now," clip from that window. Not all streams are supported (DRM, region blocks) — fail gracefully.

---

## 6. Testing strategy

- Unit tests for the time-input parser (every format).
- Unit tests for the URL detector.
- Smoke test: open the live page, paste a known-good YouTube URL, clip 10 s, download, verify playback in VLC.
- Smoke test: paste an age-gated URL, verify the friendly error.
- Smoke test: simulate Piped down, verify the Invidious fallback kicks in.
- Manual a11y pass with NVDA (Windows) or VoiceOver (Mac/iOS).
- Manual mobile pass on a real phone via the live URL.

---

## 7. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Piped + Invidious instances die simultaneously | Medium | User-configurable instance override; README lists backup instances; app auto-probes on startup. |
| YouTube adds new signature tokenisation, breaking Piped | Medium | Piped itself releases updates within days — we track their issue tracker, bump the instance list as needed. |
| SharedArrayBuffer unavailable on some mobile browsers | Medium | Single-threaded ffmpeg fallback. Path C copy-mode fallback. |
| Huge clips crash mobile browsers | Low-Medium | Warn above ~10 min; offer Path C (copy-mode) which is nearly instant. |
| GitHub Pages cache issues after redeploys | Low | Version query strings on JS/CSS. Clear SW registration on version bumps. |

---

## 8. Workflow

1. **Now:** this plan is approved.
2. **Sonnet session:** scaffold repo locally, build MVP, commit, push, enable Pages, verify live URL.
3. **Debug / tricky reasoning:** switch to Opus mid-session (same thread — context preserved).
4. **Later:** new sessions for each subsequent phase, or when the user is ready to add another site.

---

## 9. Open questions to confirm before Sonnet starts

- Repo name (default: `YouTube-Clip-Downloader`)
- Public vs private repo (default: public — required for free Pages)

Both have sensible defaults, so Sonnet can start even without explicit confirmation.

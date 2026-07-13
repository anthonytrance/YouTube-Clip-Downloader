# YouTube Clipper project handoff

Status: 2026-07-13 (latest update below supersedes older notes where they conflict)

## 0. 2026-07-13 evening: decisions made and work landed

Anthony decided: desktop-first. The recipient has a Mac (build for Windows too),
unsigned builds for now (no Apple Developer account yet), the a-Shell iPhone
route stays documented as a later upgrade (see section 0.4).

### 0.0 Latest release status

- Release 2.1.0 is live on GitHub with Windows, Mac Apple Silicon, and Mac
  Intel downloads. The GitHub Pages landing page and friendly README are live.
- The portable Windows zip was also uploaded to `/Djpitch trance` in Dropbox.
- Version 2.1.1 fixes two bugs found during Anthony's local test: Preview now
  explicitly unmutes the YouTube player and announces playback, and format
  sizes are estimates for the selected clip rather than the entire source.
- The 2.1.1 source passed the offline media self-test and a real-YouTube
  Playwright check covering preview playback, live-region feedback, and
  duration-scaled file-size estimates.

### 0.1 Landed today (all committed, all verified on this machine)

1. **JS challenge solver fixed** — yt-dlp upgraded 2026.03.17 → 2026.07.04,
   `yt-dlp-ejs` installed, node enabled as runtime alongside deno
   (`js_runtimes` in `engine.py`). Without this, YouTube deprecates
   extraction and hides/throttles formats.
2. **fastclip** (`ytclip/fastclip.py`) — the slow-clip problem is solved.
   yt-dlp's `--download-sections` hands URLs to the ffmpeg downloader whose
   scattered Range reads collapse to 7–120 KB/s against googlevideo, while
   the server serves big `range=` URL-param requests at 10–13 MB/s
   (measured both ways with curl). fastclip parses the DASH MP4 sidx index,
   downloads only the needed byte spans, cuts exactly with local ffmpeg.
   Correctness proven with SSIM 0.983 against a ground-truth cut from a
   fully downloaded file. Engine falls back to the yt-dlp path on any
   `FastClipUnavailable`. Shorts edge case handled (googlevideo returns
   400, not a short read, for `range=` past EOF — clamp to filesize).
3. **Gate 1 passed completely**, ffprobe-verified: 1080p60 mid-video merge
   28s; 720p near-end 14s; 30s clip from the middle of a 2-hour set 22s
   (without downloading the 2 hours); m4a 6s; mp3 320k 6s; a Short 6s.
4. **Marker UI** — Play/Pause + live time readout under the embedded
   player, "Set start here"/"Set end here", ±1s/±0.1s nudge rows with
   aria-labels, preview toggle, polite live-region announcements,
   /shorts//live//embed URL support. Verified with a Playwright e2e run
   against real YouTube: 10/10 checks, ending in a real browser download
   of an exactly 7.00s MP3.
5. **Packaging** — `packaging/build.py` produces a portable one-folder app
   (PyInstaller) bundling ffmpeg/ffprobe and Deno in `bin/`;
   `engine.bundle_bin_dir()` wires them up when frozen. The frozen Windows
   exe served an 8s 720p merged clip in 14s through its HTTP API.
   136 MB zip. `.github/workflows/package.yml` builds mac-arm64, mac-intel
   and windows artifacts with a frozen `--smoke` gate.

### 0.2 Blocked on Anthony (as of this update)

The gh token lacks the `workflow` scope, so pushing `.github/workflows/*`
is rejected. A device-flow refresh was started; Anthony must enter the
one-time code at https://github.com/login/device. Then: `git push origin
main`, run the Package workflow, download the mac artifacts.

### 0.3 Next steps in order

1. Push to GitHub after the scope refresh, trigger Package workflow.
2. Verify the mac-arm64 artifact at least boots via the CI smoke gate
   (already part of the workflow). Real double-click test needs her Mac.
3. Send Anthony the setup note (docs/setup-note.md) to forward.
4. Later upgrades: signing/notarization (99 USD/yr), the a-Shell iPhone
   route (section 0.4), LAN mode instructions for phone use at home.

### 0.4 iPhone route research (2026-07-13, for later)

yt-dlp runs on-device in a-Shell (App Store terminal, Python 3.11).
yt-dlp's JS-runtime requirement is solved there by the pure-Python plugin
`yt-dlp-apple-webkit-jsi` (github.com/grqz/yt-dlp-apple-webkit-jsi), which
uses Apple WebKit as the challenge solver; confirmed working inside
a-Shell by multiple users Nov–Dec 2025 (holzschu/a-shell issue 962, logs
in-thread). Shortcuts integration means the user never sees the terminal.
Unproven: exact clipping (`--download-sections` + merge) inside a-Shell,
memory limits, PO-token-gated formats. One-hour probe on a physical
iPhone decides it. Note fastclip's approach (sidx + range= + local ffmpeg
cut) would work on iOS too since a-Shell bundles ffmpeg.



This is the current handoff for the project. It supersedes `PLAN.md` and old README architecture claims wherever they conflict. It records what was actually tried, what failed, what remains plausible, and what the next agent should test before building a full product.

Do not begin a large rewrite merely because several approaches are listed here. The next action should be a small, falsifiable experiment selected with Anthony.

## 1. Product goal and non-negotiable criteria

The product is for another person, not primarily for Anthony. Installation must be reasonable for a normal recipient.

Required or strongly preferred:

- Paste or share a YouTube URL, select an exact start and end, and save a social-media-ready clip.
- Work on iPhone, especially mobile Chrome or another practical iOS browser, and preferably on Windows and macOS too.
- Remain usable by a blind person with VoiceOver, NVDA, or another screen reader.
- Avoid drag-only timelines. Every operation needs keyboard, touch, and textual alternatives.
- Prefer local or residential-IP YouTube retrieval because shared cloud egress has repeatedly been blocked.
- Prefer free or nearly free infrastructure.
- Do not require the recipient to operate a terminal, enable developer mode, or maintain a local server manually.
- No Cloudflare account is currently available. A no-account test is acceptable, but an account must not be assumed.
- The tool is for content the user owns or is authorized to reuse.
- Reliability matters more than making every component use one technology.

Anthony has now explicitly said that a browser-facing interface is desirable even if the engine runs as a Windows or Mac application. It may run on Anthony's machine or the recipient's machine and be accessed locally, over the home network, or remotely from a mobile browser.

## 2. Executive conclusion

There is no reliable architecture in which an ordinary static page on GitHub Pages or ChatGPT Sites downloads arbitrary YouTube media by itself. CORS is only the first problem. YouTube now also uses changing JavaScript challenges, SABR delivery, Proof of Origin tokens, session binding, video binding, and IP binding.

The most promising product is therefore not one universal engine. It is one accessible browser interface with several execution adapters:

1. A residential desktop host adapter using yt-dlp, its current JavaScript challenge support, a PO-token provider where needed, and native FFmpeg.
2. A local-file adapter using browser media APIs for original files from Photos, Files, Dropbox, or Drive.
3. An experimental iPhone browser userscript adapter for direct on-device work when Gear Browser can obtain the media reliably.
4. A recorder adapter that captures the rendered desktop browser tab with its audio and records only the requested interval. This avoids raw YouTube retrieval entirely, at the cost of real-time recording and some quality loss.

The same interface can appear as:

- a browser page opened automatically by a portable Windows executable or macOS app bundle;
- a LAN page opened on a phone;
- an authenticated remote page exposed from the host computer;
- a userscript panel injected into YouTube on iPhone or desktop.

There is no current requirement for a separate native desktop window. An embedded app window remains possible later, but it would duplicate the browser interface without helping the remote-mobile design.

This is the best way to satisfy both mobile and desktop without forcing the weakest platform to dictate the entire architecture.

### Recommended ranking

1. Browser-facing engine hosted on Anthony's or the recipient's Windows/Mac computer. Best balance of mobile ease and retrieval reliability.
2. Portable Windows executable or macOS app bundle that starts the same engine and opens the browser UI. No separate desktop interface is needed.
3. Hosted desktop recorder and optional Chromium recorder extension. Best no-server fallback for short music clips, but recording takes as long as the clip and it does not directly work on iPhone.
4. Gear Browser userscript experiment on a real iPhone. Best chance of a no-host, no-cloud, on-device iPhone route, but still unproven.
5. Original-file browser workflow. Most reliable mobile route when the creator has the source file.
6. iOS Shortcut plus userscript. Useful helper or fallback, not yet a complete high-quality solution.
7. Sideloaded iOS app. Technically possible, but recipient installation and weekly signing are poor.

## 3. Repository and worktree state

The main repository is:

`C:\Users\Anthony\codetest\YouTube-Clip-Downloader`

Two sibling worktrees preserve the hosted experiments:

- `C:\Users\Anthony\codetest\YouTube-Clip-Downloader-Sites`
- `C:\Users\Anthony\codetest\YouTube-Clip-Downloader-Sites-Minimal`

The main worktree currently contains uncommitted conversion work from the static site to a Python local app. Do not reset, clean, or discard it. The frontend has already been moved under `ytclip/static`, and the Python engine is in `ytclip/engine.py`.

The Sites worktree contains the most useful experiment logs:

- `browser-test.log`
- `browser-long-test.log`
- `browser-headful-test.log`
- `direct-matrix.log`
- `direct-expanded.log`
- `ios-ranges.log`
- `client-matrix.log`
- `sabr-test.log`

The Git history also records the major turns:

- initial static GitHub Pages and Cloudflare Worker design;
- current YouTube transport diagnostics;
- ChatGPT Sites-compatible relay experiments;
- corrected YouTube.js client selection;
- actual Cloudflare egress failure.

## 4. What was tried and what happened

### 4.1 Pure GitHub Pages with Piped or Invidious

Original idea:

- Host only HTML, CSS, and JavaScript on GitHub Pages.
- Ask public Piped or Invidious instances for media URLs.
- Fetch media in the browser and clip with FFmpeg WebAssembly.

Result:

- Public resolver availability and API access were not dependable.
- Direct YouTube and Google Video responses do not provide the cross-origin access an ordinary page needs.
- Current YouTube delivery adds token and attestation requirements beyond CORS.

Verdict: closed as a production route. GitHub Pages remains useful for documentation, installation links, a local-file editor, and userscript hosting.

### 4.2 GitHub Pages plus a Cloudflare Worker resolver and byte proxy

Original idea:

- Worker resolves formats and relays the bytes with CORS headers.
- Browser performs clipping.

What improved:

- A bug was found where a bare client name was passed to YouTube.js, so supposed fallback clients silently remained WEB.
- After correction, an unauthenticated Android client exposed a verified progressive MP4 at roughly 360p.
- A ten-minute reference file passed local beginning, middle, end, complete-file, byte-count, and hash checks through the locally run Worker code.

Actual deployment result:

- The temporary Cloudflare deployment started, but YouTube returned `LOGIN_REQUIRED` from Cloudflare's shared egress.
- A media URL minted on the residential connection returned HTTP 403 when the deployed Worker fetched it, demonstrating IP binding.

Verdict: closed for a normal Cloudflare Worker fetching YouTube. Creating a permanent account would not change the egress class.

Important distinction: a Cloudflare Tunnel that merely forwards requests to an engine on Anthony's computer is a different design. In that design, yt-dlp still contacts YouTube from the residential machine. The failed Worker contacted YouTube from Cloudflare.

### 4.3 ChatGPT Sites experiment

The experiment tried to keep the hosted runtime minimal:

- parse current SABR metadata in the browser;
- route only allowlisted API and attestation traffic through the hosted runtime;
- proxy SABR UMP responses;
- avoid starting a large parser inside the hosted worker.

Observed results:

- The first server-heavy build timed out during hosted worker startup.
- Moving the parser into the browser allowed a short 18.9-second reference video to complete in a local Chrome experiment through the relay. Logged totals were 433,081 video bytes and 309,288 audio bytes.
- A longer reference failed with `attestation required`, including in a headful browser run.
- Clipping was deliberately not connected because sustained retrieval was not proven.

Verdict: not proven and not recommended as the engine. A ChatGPT Site could still be a landing page or UI shell that connects to a local host, but it does not remove the need for a viable retrieval engine.

### 4.4 Direct client and range experiments

The transport logs show why tiny demonstrations are misleading:

- MWEB requests returned 403 for tested direct formats.
- An iOS client returned initial ranges for some high-resolution streams.
- A later range from the same long stream returned 403.
- Android progressive itag 18 returned data and was the most stable low-resolution direct path tested.
- Short SABR playback could succeed while a longer run failed when attestation was enforced.

Verdict: do not call an approach working after one metadata call, one first range, or one tiny video. Tests must include a later range and a complete clip from a longer source.

### 4.5 Public Cobalt-like proxy

Cobalt is not a purely client-side YouTube downloader. Its server resolves and retrieves media. Its client-side local-processing option concerns conversion after acquisition.

Public or free shared proxies inherit the same problems:

- datacenter IP blocking;
- capacity and bandwidth cost;
- abuse controls;
- upstream policy changes;
- dependence on an operator outside this project.

Verdict: not a dependable foundation. A self-hosted resolver on a residential computer is a different and more viable proposition.

### 4.6 Current Python local app

The main worktree now has a Flask browser UI plus a Python yt-dlp and FFmpeg engine.

Test performed on 2026-07-13:

1. The first test stopped before running because the project had not been installed into the existing virtual environment and Flask was absent.
2. The declared project dependencies were installed with `pip install -e .` into `C:\Users\Anthony\codetest\venv`.
3. `python -m ytclip.app --selftest --online` then passed:
   - FFmpeg and ffprobe bootstrap;
   - generation of a 30-second synthetic source;
   - exact 5-to-12-second video cut;
   - 320 kbps MP3 cut;
   - real YouTube metadata resolution;
   - a real five-second YouTube MP3 clip.
4. A harder separate-video-plus-audio test was not completed. The first chosen test video was unavailable. The second test was interrupted when Anthony clarified that he wanted a handoff, not implementation work.

Verdict: the local engine is genuinely promising, but the result does not yet prove high-resolution A/V merging, long videos, current PO-token behavior, remote mobile delivery, or packaging.

Important production concern: the current dependency set does not explicitly provide the complete current YouTube stack. Current yt-dlp documentation says YouTube extraction needs an external JavaScript runtime, recommends Deno, and may need a PO-token provider. The project also currently downloads FFmpeg through `static-ffmpeg`; a production package should use a vetted, pinned binary source and verify hashes.

## 5. The NVDA Audio Video Converter add-on

Anthony's installed add-on was found at:

`C:\Users\Anthony\AppData\Roaming\nvda\addons\AVC`

Installed version: `2026.01.24`.

The NVDA Add-on Store listed `2026.05.06` as the current stable version when checked on 2026-07-13. Inspecting the installed code was still useful because its core design is clear.

### What it does

- Reads the active browser document URL through NVDA's accessibility tree.
- Uses `NVDA+Y` for MP3, `NVDA+Shift+Y` for MP4, `NVDA+Alt+Y` for subtitles, and `NVDA+Control+Y` to open results.
- Bundles the `yt-dlp.exe` and FFmpeg command-line programs. These are separate executables invoked by the add-on, rather than media libraries linked into the add-on process.
- Runs conversion in a background thread with the child window hidden.
- Plays a quiet periodic sound while a job is active.
- Updates yt-dlp in the background once per day.
- Writes results into predictable video, audio, subtitle, and other-media folders.
- Downloads captions with yt-dlp and converts them to readable text.

The core media operations are deliberately simple. MP3 uses yt-dlp's audio extraction and conversion options, MP4 requests an MP4 format, and subtitles use yt-dlp's subtitle options without downloading the video. The exact commands are less important than the pattern: capture the current URL, invoke maintained media tools invisibly, and expose the common operations through memorable shortcuts.

### What should inspire this project

1. Zero-copy browser capture. The user does not paste a URL when already on the video.
2. One-action workflows. A single shortcut starts the common operation.
3. Background continuation. The browser may be closed while processing continues.
4. Nonvisual progress. State is announced and signaled without requiring a visual progress bar.
5. Predictable output. A dedicated result folder and one command to open it reduce confusion.
6. Self-updating extraction engine. YouTube fixes must not wait for a whole application release.
7. Direct use of proven media tools. Keep yt-dlp and FFmpeg replaceable and independently updateable instead of reimplementing their jobs.
8. Optional transcript support. Captions can be useful, but they are not required for the music-focused clipping workflow.

### Optional transcript feature derived from AVC

Transcript navigation can be a useful later feature, especially for spoken videos, but it should not be a prerequisite or the primary control. Many intended clips are music and may have no useful captions.

When a transcript is available, a blind user could navigate caption lines, hear their timestamps, and choose:

- set clip start at this line;
- set clip end at this line;
- play from this line;
- include or exclude this sentence;
- export captions with the clip.

The essential accessible controls remain typed start and end times, set-start and set-end buttons tied to playback, keyboard shortcuts, clear audio or spoken status, and no drag-only interaction. If YouTube captions are absent, the residential desktop engine could optionally produce a local transcription, but this is a fun enhancement after reliable clipping works.

### What not to copy blindly

- It is Windows and NVDA specific.
- It downloads whole media and does not expose exact clip boundaries.
- Its MP4 selection is a simple yt-dlp format request, not a carefully controlled high-quality compatibility policy.
- It does not solve iPhone access.
- It does not provide a general UI for a sighted recipient.
- Caption translation can hit YouTube rate limits. The yt-dlp issue tracker documents HTTP 429 problems for auto-translated captions.
- Copying GPL-licensed source into this project would have licensing consequences. Design patterns can be adopted without copying its implementation.

## 6. Approaches now on the table

### Route A: browser-facing desktop host

This is the strongest overall route.

The engine runs on Anthony's Windows computer or on the recipient's Windows/Mac computer. The user interface is a normal responsive web interface served by that engine.

Access modes:

1. `localhost` in the normal desktop browser, opened automatically by the launcher.
2. Same-WiFi phone through a LAN address.
3. Private remote access through a VPN-style product.
4. Public HTTPS link through a tunnel, protected by application authentication.

Why it works:

- YouTube sees a residential IP.
- Native FFmpeg handles long files and separate audio/video streams.
- yt-dlp can update independently.
- The phone needs only a browser and a bookmark.
- One engine supports Windows, Mac, local mobile, and remote mobile.
- The existing accessible frontend and Python engine can be reused.

Costs and risks:

- The host computer must be awake and connected.
- Remote result transfer uses the host's upload bandwidth.
- If Anthony hosts it for someone else, the host handles that person's URLs and output files, so privacy and cleanup rules matter.
- A public URL needs authentication, quotas, URL validation, job isolation, rate limiting, and automatic file deletion.
- It should never expose arbitrary command-line arguments or arbitrary local files.

Remote connection options:

- Cloudflare Quick Tunnel can expose localhost without an account and provides HTTPS. It uses a new random URL on restart, has no uptime guarantee, does not support SSE, and is officially for testing only. It is suitable for the first external iPhone experiment, not final delivery.
- Tailscale Funnel is available on all plans and the Personal plan is free for personal use. It provides a public HTTPS URL that works for someone without Tailscale. It is still beta, is completely public at the network layer, and has non-configurable bandwidth limits. The application itself must authenticate the recipient.
- Tailscale Serve or device sharing is more private, but the recipient would need Tailscale and an invitation.
- Router port forwarding plus a domain can avoid relay bandwidth, but setup and security burden make it a poor recipient-facing default.

Critical distinction: the tunnel carries browser traffic to the residential host. The residential host, not the tunnel provider, fetches YouTube. The Cloudflare Worker failure therefore does not invalidate a Cloudflare Quick Tunnel experiment.

### Route B: portable Windows and Mac browser launcher

This is the strongest desktop route and can be the host for Route A. It does not need a separate desktop interface. The application starts the local engine on a free loopback port, opens the default browser to its accessible interface, and exits the engine cleanly when the user chooses `Stop application` or after a safe idle timeout.

Recommended Windows shape:

1. The ideal recipient action is opening `YouTube Clipper.exe`. No installer, administrator permission, terminal, Python installation, or manual server command is required.
2. A true PyInstaller one-file executable is possible. It extracts its contents to a temporary directory on every launch, so it starts more slowly and is harder to diagnose.
3. A portable ZIP containing one visible launcher plus an internal dependency folder is likely more reliable for yt-dlp, Deno, FFmpeg, and Python. The recipient unzips it once and opens the launcher. Offer the single-file build later if testing proves it dependable.
4. Bind to `127.0.0.1` by default. LAN and remote access must be explicit modes with authentication.
5. A tray icon is optional and should contain only useful lifecycle actions such as open interface, copy mobile link, and stop. It must not become a second interface that duplicates the browser UI.

Recommended macOS shape:

1. The equivalent is `YouTube Clipper.app`, normally delivered in a ZIP or DMG. An app bundle is technically a directory, but Finder presents it as one application item that the recipient opens directly. Copying it to Applications can be optional.
2. Build separately for Apple Silicon and Intel, or produce a tested universal build. PyInstaller is not a cross-compiler, so a macOS artifact must be built on macOS or a macOS CI runner.
3. An unsigned and unnotarized app may be blocked, not merely warned about. A user who trusts the file can try opening it, then use System Settings, Privacy & Security, Open Anyway. This can be acceptable for a controlled experiment because Anthony accepts the warning, but it is less friendly for the intended recipient.
4. A production Mac release should be signed with Developer ID and notarized. It can still be portable and distributed outside the Mac App Store. Signing does not require turning it into an installed App Store application.

Shared internals:

- Keep one engine library and one semantic browser interface.
- Bundle or securely bootstrap yt-dlp, matching EJS components, Deno, FFmpeg, and an optional PO-token provider.
- Update extraction components independently with rollback and signature or hash verification.
- Open the browser only after the loopback server is ready, reuse an already running instance, and avoid leaving an invisible server behind after shutdown.
- When remote mode is requested, show a copyable link or pairing code in the browser interface. Never enable public access silently.

Electron, Tauri, Qt, and a custom desktop window are unnecessary for the first version. They are only worth reconsidering if a consistent embedded browser proves essential. The current Python and Flask architecture is already close to the desired portable browser-launcher model.

### Route C: Gear Browser userscript on iPhone

This is the most promising truly on-device iPhone experiment.

Gear is an App Store browser with a built-in Tampermonkey, Greasemonkey, and Violentmonkey-compatible userscript engine. Its documented APIs include:

- cross-origin `GM.xmlHttpRequest` and `GM_xmlhttpRequest`;
- response types including Blob and ArrayBuffer;
- request headers, cookies, progress, and cancellation;
- `GM_download` with request headers and save-as support;
- update URLs for scripts.

The developer states that installing a Web Extension or userscript no longer requires a subscription. The App Store accessibility declaration lists VoiceOver, Larger Text, contrast, and dark-interface support.

Installation concept for the recipient:

1. Install Gear normally from the App Store.
2. Open one hosted `.user.js` link.
3. Approve installation.
4. Open YouTube in Gear and use one clearly labeled `Open clipper` button.

The same script could run in desktop Tampermonkey. GitHub Pages can host the script and its update metadata without hosting any media backend.

Why this is different from a static page:

- A userscript manager has extension privileges that an ordinary web page does not.
- It runs in or beside the actual YouTube page and can use that page's current session context.
- Its privileged request API can cross origins.

Unproven risks:

- Current SABR and PO-token behavior may still stop long or high-quality downloads.
- A token may be bound to the video, session, platform, and IP.
- iOS memory limits may kill a high-resolution merge or transcode.
- Saving a generated file from the userscript may differ from saving a direct URL.
- YouTube can change the page internals.
- This must be tested on a physical iPhone with VoiceOver.

Use Mediabunny rather than FFmpeg WebAssembly for the first browser processing test. Mediabunny provides streaming I/O, trimming, transmuxing, transcoding, and WebCodecs integration. Safari and iOS WebKit support relevant modern codecs and WebCodecs, but actual device capability still has to be probed.

Fallbacks:

- The open-source Userscripts Safari extension supports `GM.xmlHttpRequest`, but its installation and saving flow are less convenient and its documentation does not offer Gear's complete download API.
- Orion has preliminary extension support, but an unresolved issue documents multiple video downloader extensions failing to detect or download iOS video streams. It should be below Gear in the test order.

### Route D: split engine with one UI

This is a likely final product rather than a separate experiment.

- On iPhone, try the Gear userscript for short compatible clips.
- For a long source, high resolution, unavailable format, or failed token, offer `Process on desktop host`.
- On Windows/Mac, use yt-dlp and native FFmpeg.
- For original files, use the local-file adapter in the browser.

The user learns one interface. The application chooses the strongest engine available and explains why a fallback was selected.

### Route E: original-file-first browser editor

This is the cleanest route when the social-media creator has the original source video.

The user selects the file from Photos, Files, Dropbox, or Drive. The browser clips it locally with Mediabunny and WebCodecs. GitHub Pages or ChatGPT Sites can host this safely because no cross-origin YouTube bytes are required.

The YouTube URL can still be used for:

- title and reference;
- preview and time selection;
- matching timestamps against the original file;
- transcript retrieval when available.

This does not satisfy arbitrary YouTube URLs, but it should be a first-class mode because it is faster, more reliable, more private, and less exposed to platform changes.

YouTube's native Clips feature is not a substitute for an exported media file. It creates a short looping share item tied to the original watch page.

### Route F: desktop browser extension and tab recorder

A Chrome, Edge, Firefox, or Safari desktop extension can capture the current page URL and playhead, open the clipper, and use page session data. It reduces pasting and resembles the AVC add-on workflow.

On Chromium desktop, the extension can also provide a second acquisition engine. After the user invokes it, `chrome.tabCapture` can capture the visible area and audio of the active YouTube tab as a `MediaStream`. An offscreen extension document can record that stream even after the extension popup closes. This means a short clip can be made locally without resolving or fetching raw Google Video URLs, so CORS, Cloudflare egress, and YouTube media-token changes are not in the recording path.

Proposed controls:

- `Set clip start` and `Set clip end`, using the current YouTube playhead.
- `Record selected clip`, which seeks, applies a short preroll, records, and stops automatically at the end.
- Shortcuts for start, end, preview, record, and cancel.
- Spoken or live-region confirmation, a countdown, elapsed status, and an unmistakable recording-state indicator.

The extension should preserve local playback audio while capturing. Chrome documents that captured tab audio otherwise stops playing to the user, and shows how to reconnect it through an `AudioContext`.

Limitations:

- Chrome on iOS does not accept normal Chrome extensions.
- Store review and signing add distribution work.
- Firefox and Safari have different capture APIs, so the first recorder experiment should target Chrome and Edge desktop.
- The output is a real-time recording of the rendered tab, not the original compressed media. It may be re-encoded, is limited to the rendered resolution and frame rate, and can capture overlays or player controls.
- A browser extension alone still has browser media-processing and codec-container limits. WebM may need a local remux or transcode for a social-media-compatible MP4.

Best use: a lightweight companion and robust fallback, especially for short music clips. It should not be the only engine, but it may be enough for many ordinary clips.

### Route G: iOS Shortcut plus webpage script

Apple Shortcuts can receive a Safari page from the share sheet and run JavaScript in that active page. A shortcut could collect the URL and current playhead, then open the browser-facing host with those values already filled in.

A more ambitious variant would have a Gear userscript resolve a direct stream and hand it to a Shortcut for saving or native media actions.

Why this remains secondary:

- `Run JavaScript on Webpage` has a time limit.
- Its output is JSON-compatible data, not a natural path for transferring huge media buffers.
- High-quality YouTube usually has separate video and audio.
- Precise trimming and merging are not reliably covered by standard Shortcut actions.

Best use: an accessible share-sheet launcher for Route A, not the core downloader.

### Route H: sideloaded native iOS app

An iOS app can avoid App Store review through SideStore or AltStore, but a free Apple account normally requires a seven-day refresh. SideStore requires a computer for initial installation, is in public beta, and counts itself among the three simultaneously installed sideloaded apps.

This is too much maintenance for the intended recipient. It is a laboratory option only.

Normal App Store distribution is also risky. Apple's App Review Guideline 5.2.3 says apps may not save, convert, or download media from sources such as YouTube without explicit authorization from the source.

### Route I: phone-to-desktop WebRTC

A static page could pair with the desktop app by QR code and exchange jobs or files over an encrypted WebRTC data channel.

This is technically creative but not infrastructure-free. WebRTC still needs signaling, STUN, and sometimes TURN. It also adds reconnection, pairing, and large-file transfer complexity. A secure HTTP tunnel is simpler for the first product.

Possible later use: direct transfer after both peers are connected, reducing relay bandwidth while keeping a small signaling service.

### Route J: hosted tab recorder and manual screen recording

This route was previously underspecified. A normal static HTTPS page can call `getDisplayMedia()` after the user presses a button, ask the user to choose a browser tab and share its audio, then pass the returned stream to `MediaRecorder`. The page can be hosted on GitHub Pages or another static host. The media is recorded and processed locally, so the host supplies only HTML, CSS, and JavaScript and performs no YouTube retrieval or server-side compute.

GitHub Pages is the safer first host because the clipper can run as a normal top-level HTTPS page. ChatGPT Sites may also work if it presents the generated site as a focused top-level secure page and permits display capture. It must be tested rather than assumed. A sandboxed preview, restrictive iframe permissions, or a host permissions policy can cause `getDisplayMedia()` to be denied even though the same code works on GitHub Pages. The recorder route does not need ChatGPT Sites server compute, so ChatGPT Sites offers no engine advantage over GitHub Pages here.

This is materially different from the failed static downloader:

- It records pixels and audio that the browser is already rendering instead of requesting raw YouTube media bytes.
- It does not need a resolver, proxy, Cloudflare account, residential clip server, CORS workaround, YouTube decipher implementation, or PO token.
- A 30-second clip takes roughly 30 seconds to capture, but that is reasonable for many short music clips.
- A browser-side remux can produce a compatible container when no re-encoding is needed. Otherwise the portable local engine can convert the recording with FFmpeg.

Two hosted interaction designs should be tested:

1. The clipper page asks the user to select an already open YouTube tab, then the user starts playback at the chosen point. The clipper records for the typed duration and stops automatically.
2. The clipper embeds the official YouTube player, controls seek and playback through the IFrame API, and asks the user to capture the clipper's own tab. This would be more automatic, but it must be tested for captured audio, capture recursion, player controls, and accessibility before being promised.

Browser rules that cannot be designed away:

- The page must be served in a secure context, normally HTTPS.
- Capture must begin from a user action.
- The user must choose the capture source and grant permission every time. The site cannot silently preselect a YouTube tab or permanently remember permission.
- Audio-track availability varies by browser, operating system, and selected capture surface. The user may need to explicitly enable `Share tab audio`.
- Capture quality is limited by playback quality, visible rendering, frame rate, and the browser encoder. Player UI, notifications, stutters, or overlays can enter the recording.
- This is a desktop-browser route. Current MDN browser-compatibility data marks `getDisplayMedia()` unsupported in Safari on iOS. Because every iOS browser uses WebKit, Chrome on iPhone cannot add the missing capability.

For iPhone, manual system screen recording followed by trimming or importing into the local-file editor remains the recorder fallback. It is real-time and may include interface or notification artifacts, but it is still useful when the desktop host and direct userscript routes are unavailable.

Verdict: promote hosted recording from last-resort fallback to a high-value desktop experiment. It could be the simplest truly static hosted solution for short clips, while the portable browser launcher, desktop extension, or residential engine handles cases requiring better quality or automation.

## 7. Proposed final architecture

### 7.1 One accessible control surface

Reuse the existing semantic HTML interface, but make it transport-independent.

Core interface capabilities:

- URL or local-file input.
- YouTube preview when appropriate.
- typed start and end times;
- `Set start to current playback time` and `Set end to current playback time` buttons;
- optional transcript navigation with timestamped lines when captions exist;
- no drag-only controls;
- format and compatibility choices explained in plain language;
- progress announced at useful intervals, not on every tiny update;
- cancel, retry, and clear error messages;
- predictable save destination or browser download;
- optional vertical crop and captions only after the core clip path is proven.

### 7.2 Pluggable execution adapters

The UI should call a narrow adapter interface rather than knowing the implementation:

- `localHost`: yt-dlp plus native FFmpeg on Windows/Mac.
- `gearUserScript`: page context plus privileged iPhone browser requests and Mediabunny.
- `localFile`: File System or file picker plus Mediabunny.
- `remoteHost`: authenticated HTTPS calls to the same residential engine.
- `displayRecorder`: user-authorized desktop tab capture plus MediaRecorder, with no raw YouTube download.
- `extensionRecorder`: Chromium tab capture with automatic seek and stop for a smoother desktop recording workflow.

Each adapter reports capabilities before the user chooses a format. For example, the iPhone adapter might advertise `short H.264/AAC clips only` while the desktop adapter advertises 4K merge, captions, and long clips.

### 7.3 Desktop host internals

- Use current yt-dlp with matching EJS components.
- Provide Deno or another officially supported JavaScript runtime.
- Add a maintained PO-token provider only if the test matrix proves it is needed.
- Use native FFmpeg for exact cuts, A/V merge, audio conversion, and compatibility output.
- Keep extraction-component updates separate from application updates.
- Cache only temporary job data and delete it automatically.
- Bind to loopback by default.
- Require an explicit setting for LAN or remote mode.
- When remote mode is active, require authentication even if the tunnel URL is hard to guess.
- Do not expose a generic proxy endpoint.

### 7.4 Browser integration inspired by AVC

- Desktop browser extension or bookmark action captures current URL and playhead.
- iPhone Shortcut opens the host UI with the shared URL already loaded.
- A custom application protocol can open the installed desktop app from a browser.
- Keyboard commands should mirror the simple AVC pattern for capturing the current URL, setting start, setting end, previewing, exporting the clip, and exporting audio. Transcript export and caption-line navigation are optional extras.

## 8. Test gates before any full build

### Gate 1: prove the residential desktop engine

Do not rely only on the existing self-test. Run and retain logs for:

1. A 15-second 720p clip from the middle of a ten-minute source.
2. A 15-second 1080p clip requiring separate video and audio plus FFmpeg merge.
3. A clip near the end of the same source.
4. A short YouTube Short.
5. A one-hour source with a small clip near the middle, without downloading the whole hour when avoidable.
6. Native audio, MP3, manual captions, auto captions, and a video without captions.
7. A signed-out case and, if authorized, a signed-in browser-session case.
8. Output verification with ffprobe for duration, streams, codec, dimensions, and playability.

Success is not `download started`. Success means a complete file with the requested interval and both expected streams.

### Gate 2: prove remote mobile use with no account

Use the current local app only as an experiment:

1. Bind the engine safely to loopback.
2. Put an authentication token in front of it.
3. Expose it temporarily with Cloudflare Quick Tunnel, which does not require an account.
4. Open the HTTPS URL on a physical iPhone over cellular, not the home WiFi.
5. Load a video, request a clip, receive progress by polling or WebSocket, and save the finished file to Files or Photos.
6. Repeat with VoiceOver.

If this works, the browser-facing residential host is validated. Then select a stable remote-access mechanism. Do not treat Quick Tunnel as the final host.

### Gate 3: prove Gear on a physical iPhone

Build only a diagnostic userscript, not the full interface:

1. Read video ID, title, duration, current time, and session data from the current YouTube page.
2. Perform a privileged cross-origin range request and verify at least ten megabytes from a Google Video URL.
3. Fetch a later range, not only the beginning.
4. Save a complete low-resolution progressive stream.
5. Trim a 15-second H.264/AAC clip locally with Mediabunny.
6. Save or share the generated file.
7. Attempt separate audio and video acquisition and muxing.
8. Repeat on a ten-minute source and with VoiceOver.

Stop conditions:

- repeated attestation failure after current documented token approaches;
- iOS process termination during an ordinary 15-second 720p clip;
- no reliable way to save the generated file;
- installation or operation is not reasonable for the recipient.

### Gate 4: prove the recorder route

Build a diagnostic static HTTPS page before integrating recording into the full product:

1. Deploy the same diagnostic to GitHub Pages and, if available, ChatGPT Sites. Confirm that each host can open the capture chooser from its normal published page.
2. On Windows Chrome and Edge, select a YouTube tab with `Share tab audio` enabled and record a 30-second music interval.
3. Verify that the output has both audio and video, then inspect duration, dimensions, frame rate, codecs, sync, and visible player UI.
4. Repeat with the clipper's own tab containing an official YouTube embed to determine whether seek, play, record, and automatic stop can be coordinated accessibly.
5. Test a WebM-to-MP4 remux and, only where required, a conversion to H.264/AAC.
6. Repeat on macOS Chrome and desktop Safari. Do not infer support from Windows results.
7. Test every permission prompt, countdown, start, stop, error, and saved-file action with NVDA or VoiceOver and keyboard only.
8. If the hosted prompt flow is too awkward, build a minimal Chrome or Edge extension using `tabCapture` and an offscreen recorder, then compare the recipient installation cost against the better automation.

This gate does not include iPhone web recording because `getDisplayMedia()` is not exposed on iOS. Test manual iOS screen recording plus import into the local-file editor separately.

### Gate 5: package one desktop action

Only after Gate 1 passes:

- package one URL-to-15-second-clip action as a portable Windows browser launcher;
- build the equivalent macOS `.app` artifact in CI or on a Mac;
- test unzip, first run, automatic browser opening, already-running behavior, bundled binaries, update, clean shutdown, and screen reader use;
- compare a true one-file Windows executable with a portable one-folder ZIP using startup speed, antivirus results, update safety, and recipient effort;
- avoid Electron, Tauri, or a native desktop interface unless a measured limitation of the browser-launcher design requires one.

### Gate 6: full product UI

Only after at least one mobile route and one desktop route pass should the full timeline, format picker, captions, optional transcript editor, and social formats be built.

## 9. Decision matrix

Scores are relative, from 1 poor to 5 strong. `Unknown` means an experiment is required.

| Route | Recipient mobile setup | YouTube reliability | Long/high-quality clips | Accessibility potential | Ongoing host cost | Status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Residential desktop host plus browser UI | 5 | 4 | 5 | 5 | 4 | Recommended first |
| Portable desktop browser launcher | 2 | 4 | 5 | 5 | 5 | Recommended desktop |
| Hosted desktop tab recorder | 1 on iPhone, 5 on desktop | 3 | 2 | 5 | 5 | High-value static experiment |
| Chromium extension tab recorder | 1 on iPhone, 4 on desktop | 4 for rendered clips | 2 | 5 | Strong desktop fallback |
| Gear userscript | 4 | Unknown | Unknown | 4 | 5 | Highest-value iPhone experiment |
| Original-file browser editor | 5 | 5 | 3 to 4 | 5 | 5 | First-class fallback |
| Safari Userscripts | 3 | Unknown | Unknown | 4 | 5 | Gear fallback |
| iOS Shortcut launcher to host | 5 | 4 | 5 | 5 | 4 | Useful companion |
| SideStore native app | 1 | 3 | 3 | 4 | 4 | Laboratory only |
| Cloudflare Worker fetcher | 5 | 1 | 1 | 4 | 5 | Failed |
| ChatGPT Sites fetcher | 5 | 1 | 1 | 4 | 5 | Not proven, long test failed |
| Pure GitHub Pages downloader | 5 | 1 | 1 | 5 | 5 | Closed for arbitrary YouTube |
| Public Cobalt/Piped/Invidious dependency | 5 | 1 to 2 | 2 | 4 | 5 | Not dependable |

## 10. Recommended next decision

The best next work is a three-way proof, not a full desktop rewrite:

1. Finish the high-quality residential engine test that was interrupted.
2. Expose the existing browser UI to one physical iPhone through a temporary no-account tunnel.
3. In parallel with product decisions, build the smallest static hosted tab-recorder diagnostic and test one 30-second music clip with tab audio on Windows Chrome and Edge.
4. Test the full remote-host round trip over cellular with VoiceOver.
5. In a separate small experiment, test Gear's privileged range request and save path.

These experiments answer the central product question:

- If remote host succeeds, the recipient can use any mobile browser with no installation.
- If hosted recording succeeds, short desktop clips can be made on GitHub Pages or another static host with no backend at all.
- If the Chromium extension succeeds, desktop recording can become more automatic without depending on YouTube download internals.
- If Gear also succeeds, the user can choose on-device mode when the host is unavailable.
- If Gear fails, the browser-facing desktop host still solves mobile access.

Do not rewind to the old static branch. Reuse the frontend, current Python engine, logs, and tests. The architecture should move forward by separating UI from execution adapters.

## 11. Information the next agent should confirm before implementation

- Recipient's exact combination: iPhone only, iPhone plus Windows, or iPhone plus Mac.
- iOS version and available storage.
- Whether she can install one App Store browser such as Gear.
- Whether Anthony's computer may remain online as the host, or whether the recipient's computer should host itself.
- Whether access is normally on the same WiFi or must work over cellular from elsewhere.
- Whether original source files are commonly available.
- Whether the recipient mainly needs short clips for which real-time tab recording is acceptable.
- Whether she can use desktop Chrome or Edge and approve a tab-audio sharing prompt or install one normal browser extension.
- Required maximum source length, output resolution, vertical crop, captions, and transcript language.
- Whether a private personal Tailscale account is acceptable if the no-account experiment works.

## 12. Sources consulted for this handoff

Every URL below was fetched, not merely read from a search-result snippet.

https://gear4.app/doc

https://apps.apple.com/us/app/gear-browser-userscript-addons/id1458962238

https://raw.githubusercontent.com/quoid/userscripts/main/README.md

https://orionfeedback.org/d/2645-iosvideo-downloader-extensions-dont-work

https://addonstore.nvaccess.org/?addonId=AVC&apiVersion=2026.1.0&channel=all&language=en

https://github.com/RainerBrell/avc/

https://github.com/yt-dlp/yt-dlp/issues/13831

https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide

https://github.com/yt-dlp/yt-dlp/wiki/EJS

https://www.electronjs.org/docs/latest/tutorial/distribution-overview

https://v2.tauri.app/develop/sidecar/

https://docs.sidestore.io/docs/faq

https://mediabunny.dev/guide/introduction

https://webkit.org/blog/15063/webkit-features-in-safari-17-4/

https://web.dev/articles/webrtc-datachannels

https://support.apple.com/en-ie/guide/shortcuts/apd7644168e1/ios

https://support.apple.com/guide/shortcuts/intro-to-the-run-javascript-on-webpage-action-apd218e2187d/ios

https://developer.apple.com/app-store/review/guidelines/

https://developer.apple.com/developer-id/

https://tailscale.com/docs/features/tailscale-funnel

https://tailscale.com/docs/reference/funnel-vs-sharing

https://tailscale.com/pricing

https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/index.md

https://support.google.com/youtube/answer/10332730?hl=en

https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

https://developer.chrome.com/docs/extensions/reference/api/tabCapture

https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaDevices.json

https://github.com/mdn/content/issues/25307

https://pyinstaller.org/en/stable/operating-mode.html

https://support.apple.com/en-ie/102445

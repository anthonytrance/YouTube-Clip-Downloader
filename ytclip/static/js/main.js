/**
 * App bootstrap — wires all modules together.
 */
(() => {
  // ── State ──────────────────────────────────────────────────
  let videoInfo = null;   // response from /api/info
  let ytPlayer  = null;   // YouTube IFrame player instance
  let previewInterval = null;

  // ── DOM refs ───────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const urlInput      = $('url-input');
  const loadBtn       = $('load-btn');
  const videoSection  = $('video-section');
  const clipSection   = $('clip-section');
  const formatSection = $('format-section');
  const downloadSection = $('download-section');
  const videoTitle    = $('video-title');
  const videoAuthor   = $('video-author');
  const videoDuration = $('video-duration');
  const videoThumb    = $('video-thumb');
  const startInput    = $('start-input');
  const endInput      = $('end-input');
  const previewBtn    = $('preview-btn');
  const downloadBtn   = $('download-btn');
  const formatGroups  = $('format-groups');
  const errorBox      = $('error-box');
  const errorMsg      = $('error-message');
  const longWarn      = $('long-clip-warning');
  const clipDuration  = $('clip-duration-label');

  // ── YouTube IFrame API ─────────────────────────────────────
  window.onYouTubeIframeAPIReady = () => { /* ready flag */ window._ytAPIReady = true; };
  const ytScript = document.createElement('script');
  ytScript.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(ytScript);

  // ── Timeline init ──────────────────────────────────────────
  Timeline.init({
    track:       $('timeline-track'),
    range:       $('timeline-range'),
    handleStart: $('handle-start'),
    handleEnd:   $('handle-end'),
    onChange: (startMs, endMs) => {
      startInput.value = TimeInput.format(startMs);
      endInput.value   = TimeInput.format(endMs);
      updateClipMeta(startMs, endMs);
      syncPreviewLoop(startMs, endMs);
    },
  });

  // ── Progress init ──────────────────────────────────────────
  Progress.init({
    container: $('progress-container'),
    bar:       $('progress-bar-fill'),
    label:     $('progress-label'),
    announce:  $('sr-announce'),
  });

  // ── URL load ───────────────────────────────────────────────
  loadBtn.addEventListener('click', loadVideo);
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadVideo(); });

  async function loadVideo() {
    clearError();
    const raw = urlInput.value.trim();
    if (!raw) return showError('Please enter a YouTube URL.');
    const videoId = extractVideoId(raw);
    if (!videoId) return showError("That doesn't look like a valid YouTube URL.");

    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading…';
    hideAll();

    try {
      const resp = await fetch(`/api/info?url=${encodeURIComponent(raw)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Server error ${resp.status}`);

      videoInfo = data;
      renderVideoMeta(data);
      mountYTPlayer(videoId, data.duration);
      Timeline.setDuration(data.duration * 1000);
      startInput.value = TimeInput.format(0);
      endInput.value   = TimeInput.format(data.duration * 1000);
      updateClipMeta(0, data.duration * 1000);
      FormatPicker.render(formatGroups, data.formats);

      videoSection.classList.remove('hidden');
      clipSection.classList.remove('hidden');
      formatSection.classList.remove('hidden');
      downloadSection.classList.remove('hidden');
    } catch (err) {
      showError(err.message);
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = 'Load';
    }
  }

  // ── Time inputs ────────────────────────────────────────────
  [startInput, endInput].forEach(input => {
    input.addEventListener('change', onTimeInputChange);
    input.addEventListener('blur',   onTimeInputChange);
  });

  function onTimeInputChange() {
    const startMs = TimeInput.parse(startInput.value);
    const endMs   = TimeInput.parse(endInput.value);
    const dur     = (videoInfo?.duration ?? 0) * 1000;

    startInput.classList.toggle('invalid', startMs === null);
    endInput.classList.toggle('invalid',   endMs === null);

    if (startMs !== null && endMs !== null) {
      const clamped = [Math.max(0, startMs), Math.min(dur, endMs)];
      Timeline.setRange(clamped[0], clamped[1]);
      startInput.value = TimeInput.format(clamped[0]);
      endInput.value   = TimeInput.format(clamped[1]);
      updateClipMeta(clamped[0], clamped[1]);
      syncPreviewLoop(clamped[0], clamped[1]);
    }
  }

  function updateClipMeta(startMs, endMs) {
    const lenMs = endMs - startMs;
    const lenSec = lenMs / 1000;
    clipDuration.textContent = `Clip length: ${TimeInput.format(lenMs)}`;
    longWarn.classList.toggle('hidden', !Downloader.isLongClip(startMs, endMs));
  }

  // ── Playback controls + clip markers ──────────────────────
  const playPauseBtn = $('playpause-btn');
  const currentTimeEl = $('current-time');
  const setStartBtn  = $('set-start-btn');
  const setEndBtn    = $('set-end-btn');
  const markerAnnounce = $('marker-announce');

  playPauseBtn.addEventListener('click', () => {
    if (!ytPlayer) return;
    // YT.PlayerState.PLAYING = 1
    if (ytPlayer.getPlayerState?.() === 1) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
  });

  setInterval(() => {
    if (!ytPlayer?.getCurrentTime) return;
    currentTimeEl.textContent = TimeInput.format(ytPlayer.getCurrentTime() * 1000);
    const playing = ytPlayer.getPlayerState?.() === 1;
    playPauseBtn.textContent = playing ? 'Pause' : 'Play';
  }, 250);

  function playerNowMs() {
    const t = ytPlayer?.getCurrentTime?.();
    return typeof t === 'number' ? Math.round(t * 1000) : null;
  }

  function announce(msg) { markerAnnounce.textContent = msg; }

  function applyRange(startMs, endMs, focusMsg) {
    const dur = (videoInfo?.duration ?? 0) * 1000;
    startMs = Math.max(0, Math.min(startMs, dur));
    endMs   = Math.max(0, Math.min(endMs, dur));
    if (endMs <= startMs) endMs = Math.min(dur, startMs + 1000);
    Timeline.setRange(startMs, endMs);
    startInput.value = TimeInput.format(startMs);
    endInput.value   = TimeInput.format(endMs);
    updateClipMeta(startMs, endMs);
    if (focusMsg) announce(focusMsg);
  }

  setStartBtn.addEventListener('click', () => {
    const now = playerNowMs();
    if (now === null) return;
    const { endMs } = Timeline.getRange();
    applyRange(now, endMs, `Start set to ${TimeInput.format(now)}`);
  });

  setEndBtn.addEventListener('click', () => {
    const now = playerNowMs();
    if (now === null) return;
    const { startMs } = Timeline.getRange();
    applyRange(startMs, now, `End set to ${TimeInput.format(now)}`);
  });

  // Nudge buttons: shift start/end by data-delta milliseconds.
  document.querySelectorAll('.btn-nudge').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta, 10);
      let { startMs, endMs } = Timeline.getRange();
      if (btn.dataset.target === 'start') {
        startMs += delta;
        applyRange(startMs, endMs, `Start ${TimeInput.format(Math.max(0, startMs))}`);
      } else {
        endMs += delta;
        applyRange(startMs, endMs, `End ${TimeInput.format(Math.max(0, endMs))}`);
      }
    });
  });

  // ── Preview (toggles) ──────────────────────────────────────
  previewBtn.addEventListener('click', () => {
    if (!ytPlayer) return;
    if (previewInterval) {            // second press stops the preview
      stopPreview();
      return;
    }
    const { startMs, endMs } = Timeline.getRange();
    ytPlayer.seekTo(startMs / 1000, true);
    ytPlayer.playVideo();
    previewBtn.textContent = 'Stop preview';
    previewInterval = setInterval(() => {
      if (!ytPlayer) return;
      const bounds = Timeline.getRange();
      const current = ytPlayer.getCurrentTime?.() * 1000;
      if (current >= bounds.endMs) {
        ytPlayer.seekTo(bounds.startMs / 1000, true);
      }
    }, 250);
  });

  function stopPreview() {
    clearInterval(previewInterval);
    previewInterval = null;
    previewBtn.textContent = 'Preview clip';
    ytPlayer?.pauseVideo?.();
  }

  function syncPreviewLoop(startMs, endMs) {
    // If preview is running, update its bounds
    if (previewInterval && ytPlayer) {
      // Let the interval naturally pick up new values from Timeline.getRange()
    }
  }

  // ── Download ───────────────────────────────────────────────
  downloadBtn.addEventListener('click', async () => {
    const fmt = FormatPicker.getSelected();
    if (!fmt) return showError('Please select a format.');
    const { startMs, endMs } = Timeline.getRange();

    downloadBtn.disabled = true;
    clearError();
    Progress.show('Starting…');
    stopPreview();

    await Downloader.run({
      format:     fmt,
      videoUrl:   videoInfo?.url ?? urlInput.value.trim(),
      startMs,
      endMs,
      durationMs: (videoInfo?.duration ?? 0) * 1000,
      onProgress: (msg, pct) => Progress.set(pct, msg),
      onDone: () => {
        Progress.announce('Download complete!');
        Progress.hide();
        downloadBtn.disabled = false;
      },
      onError: msg => {
        showError(msg);
        Progress.hide();
        downloadBtn.disabled = false;
      },
    });
  });

  // ── YouTube player helpers ─────────────────────────────────
  function mountYTPlayer(videoId, durationSec) {
    const waitForAPI = (cb) => {
      if (window._ytAPIReady || window.YT?.Player) cb();
      else setTimeout(() => waitForAPI(cb), 100);
    };
    waitForAPI(() => {
      if (ytPlayer) { ytPlayer.loadVideoById(videoId); return; }
      ytPlayer = new YT.Player('yt-player', {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: e => {
            // YT.PlayerState.ENDED = 0; loop preview
            if (e.data === 0 && previewInterval) {
              const { startMs } = Timeline.getRange();
              ytPlayer.seekTo(startMs / 1000, true);
              ytPlayer.playVideo();
            }
          }
        }
      });
    });
  }

  function renderVideoMeta(data) {
    videoTitle.textContent  = data.title;
    videoAuthor.textContent = data.author;
    videoDuration.textContent = `Duration: ${TimeInput.format(data.duration * 1000)}`;
    videoThumb.src = data.thumbnail;
    videoThumb.alt = data.title;
    videoThumb.onerror = () => { videoThumb.src = data.thumbnail_fallback; };
  }

  // ── Error helpers ──────────────────────────────────────────
  function showError(msg) {
    errorMsg.textContent = msg;
    errorBox.classList.remove('hidden');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function clearError() { errorBox.classList.add('hidden'); errorMsg.textContent = ''; }

  function hideAll() {
    [videoSection, clipSection, formatSection, downloadSection].forEach(s => s.classList.add('hidden'));
  }

  // ── URL parser ─────────────────────────────────────────────
  function extractVideoId(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'youtu.be') return u.pathname.slice(1).split(/[?#]/)[0];
      if (u.hostname.endsWith('youtube.com')) {
        const path = u.pathname;
        const m = path.match(/^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})/);
        if (m) return m[1];
        return u.searchParams.get('v') || null;
      }
    } catch {}
    const m = url.match(/(?:v=|youtu\.be\/|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }
})();

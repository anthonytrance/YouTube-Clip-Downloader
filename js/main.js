/**
 * App bootstrap — wires all modules together.
 */
(() => {
  const WORKER = window.APP_CONFIG.WORKER_URL;

  // ── State ──────────────────────────────────────────────────
  let videoInfo = null;   // response from /info
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
    if (!videoId) return showError('That doesn't look like a valid YouTube URL.');

    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading…';
    hideAll();

    try {
      if (WORKER.includes('PLACEHOLDER')) {
        throw new Error('The worker URL hasn't been configured yet. Set WORKER_URL in js/config.js.');
      }

      const resp = await fetch(`${WORKER}/info?v=${videoId}`);
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

  // ── Preview ────────────────────────────────────────────────
  previewBtn.addEventListener('click', () => {
    const { startMs, endMs } = Timeline.getRange();
    if (!ytPlayer) return;
    clearInterval(previewInterval);
    ytPlayer.seekTo(startMs / 1000, true);
    ytPlayer.playVideo();
    previewInterval = setInterval(() => {
      if (!ytPlayer) return;
      const current = ytPlayer.getCurrentTime?.() * 1000;
      if (current >= endMs) {
        ytPlayer.seekTo(startMs / 1000, true);
      }
    }, 250);
  });

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
    clearInterval(previewInterval);

    await Downloader.run({
      format:       fmt,
      videoFormats: videoInfo?.formats ?? [],
      startMs,
      endMs,
      durationMs:   (videoInfo?.duration ?? 0) * 1000,
      title:        videoInfo?.title ?? 'video',
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
      if (u.hostname.endsWith('youtube.com')) return u.searchParams.get('v') || null;
    } catch {}
    const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }
})();

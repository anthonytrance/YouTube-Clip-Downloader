/**
 * Download client.
 *
 * All the heavy lifting (yt-dlp + real ffmpeg) happens in the local Python
 * backend. This module just starts a job, polls its progress, and triggers
 * the browser download when the file is ready.
 */
window.Downloader = (() => {
  // Above this, re-encoded cuts can take a while — show a soft warning.
  const LONG_CLIP_MS = 30 * 60 * 1000;
  const POLL_MS = 500;

  async function run({ format, videoUrl, startMs, endMs, durationMs, onProgress, onDone, onError }) {
    try {
      const body = {
        url: videoUrl,
        start_ms: Math.round(startMs),
        end_ms: Math.round(endMs),
        duration_ms: Math.round(durationMs),
        exact: document.getElementById('exact-cut')?.checked ?? true,
      };

      if (format._isMp3) {
        body.kind = 'mp3';
      } else if (format.type === 'video') {
        body.kind = 'video';
        body.height = format.height;
      } else {
        body.kind = 'audio';
        body.container = format.container;
      }

      onProgress?.('Starting…', 2);

      const resp = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Server error ${resp.status}`);

      const jobId = data.job_id;

      // Poll until done
      for (;;) {
        await sleep(POLL_MS);
        const jr = await fetch(`/api/job/${jobId}`);
        const job = await jr.json();
        if (!jr.ok) throw new Error(job.error || 'Lost track of the download job');

        if (job.status === 'error') throw new Error(job.error || 'Download failed');
        if (job.status === 'done') {
          onProgress?.('Saving file…', 98);
          // Navigating to the file URL triggers the browser's own download UI
          const a = document.createElement('a');
          a.href = `/api/job/${jobId}/file`;
          a.download = job.filename || '';
          document.body.appendChild(a);
          a.click();
          a.remove();
          onDone?.();
          return;
        }
        onProgress?.(job.message || 'Working…', job.percent ?? 0);
      }
    } catch (err) {
      onError?.(err.message || 'Download failed');
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function isLongClip(startMs, endMs) { return (endMs - startMs) > LONG_CLIP_MS; }

  return { run, isLongClip };
})();

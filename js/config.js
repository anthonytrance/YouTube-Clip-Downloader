// Single place to change the worker URL.
// After deploying the Cloudflare Worker, update WORKER_URL below.
// Users can also override it in localStorage: localStorage.setItem('workerUrl', 'https://...')
const WORKER_URL = (
  localStorage.getItem('workerUrl') ||
  'https://yt-clip-worker.PLACEHOLDER.workers.dev'
).replace(/\/$/, '');

window.APP_CONFIG = { WORKER_URL };

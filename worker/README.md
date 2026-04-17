# YouTube Clip Downloader — Cloudflare Worker

This is the backend piece of the YouTube Clip Downloader. It does two things:
1. **Resolves YouTube stream URLs** — calls YouTube's API, deciphers the signed URLs, returns video/audio format options.
2. **Proxies stream bytes** — fetches from YouTube's CDN and relays the bytes to the browser with the CORS headers browsers need to process video.

The web app (on GitHub Pages) is the UI. This Worker is the engine behind it.

---

## Prerequisites

- A **Cloudflare account** — free tier is plenty. Sign up at [cloudflare.com](https://cloudflare.com) if you don't have one yet. No credit card required.
- **Node.js 18+** — download from [nodejs.org](https://nodejs.org/en/download).
- This repo cloned locally.

---

## Deploy steps

```bash
# 1. Go into the worker folder
cd worker

# 2. Install dependencies
npm install

# 3. Log in to Cloudflare (opens a browser window — click Authorize)
npx wrangler login

# 4. Deploy
npx wrangler deploy
```

That's it. The last command outputs something like:

```
Published yt-clip-worker (0.50 sec)
  https://yt-clip-worker.<your-subdomain>.workers.dev
```

Copy that URL and send it to the site owner. They plug it into the frontend config and the app is live.

---

## What you're agreeing to run

- The Worker fetches video metadata from YouTube's API on behalf of your Cloudflare account.
- It proxies YouTube's video/audio bytes through Cloudflare's network to the user's browser.
- **Free tier limits:** 100,000 requests/day, 10ms CPU time per request. For personal or small-group use this is more than sufficient.
- You can check usage at [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → your worker.

---

## Updating

If YouTube changes something and streams stop working (rare but happens), run:

```bash
cd worker
npm update youtubei.js
npx wrangler deploy
```

The `youtubei.js` library tracks YouTube changes closely and releases fixes quickly.

---

## Local testing (optional)

```bash
cd worker
npx wrangler dev
```

Then test:
```
http://localhost:8787/health                         → {"ok":true,"ts":...}
http://localhost:8787/info?v=dQw4w9WgXcQ            → video metadata + stream list
http://localhost:8787/stream?u=<base64StreamUrl>    → stream bytes (range-aware)
```

---

## Troubleshooting

**"error: A record of type ... already exists"** — change the worker name in `wrangler.toml` (e.g., `yt-clip-worker-2`) and redeploy.

**Stream proxy returns 403** — the stream URL has expired (YouTube URLs expire after ~6 hours). Refreshing the web app re-fetches fresh URLs.

**"All clients failed" error from /info** — YouTube changed something. Update `youtubei.js` with `npm update youtubei.js && npx wrangler deploy`.

import { Innertube } from 'youtubei.js/web';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

// Reuse the Innertube instance within the same Worker isolate (per DC, per cold start).
// This avoids re-fetching YouTube's player JS on every request.
let ytSession = null;
let ytSessionExpiry = 0;
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getSession() {
  const now = Date.now();
  if (ytSession && now < ytSessionExpiry) return ytSession;
  ytSession = await Innertube.create({
    // Bind fetch explicitly — required in CF Workers where `this` context matters
    fetch: (url, init) => globalThis.fetch(url, init),
    generate_session_locally: true,
    cache: null,
  });
  ytSessionExpiry = now + SESSION_TTL_MS;
  return ytSession;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/health') {
        return jsonOk({ ok: true, ts: Date.now() });
      }
      if (url.pathname === '/info') {
        return await handleInfo(url, url.origin);
      }
      if (url.pathname === '/stream') {
        return await handleStream(request, url);
      }
      return jsonError('Not found', 404);
    } catch (err) {
      console.error('[worker error]', err?.message, err?.stack);
      const msg = err?.message || 'Internal server error';
      // Surface YouTube-specific errors as 4xx where possible
      if (msg.includes('not found') || msg.includes('unavailable')) return jsonError(msg, 404);
      if (msg.includes('LOGIN_REQUIRED') || msg.includes('sign-in')) return jsonError(msg, 403);
      return jsonError(msg, 500);
    }
  },
};

// ---------------------------------------------------------------------------
// /info?v={videoId}
// Returns metadata + list of downloadable streams (all URLs proxied through us)
// ---------------------------------------------------------------------------
async function handleInfo(url, workerOrigin) {
  const videoId = url.searchParams.get('v');
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return jsonError('Invalid or missing video ID', 400);
  }

  const yt = await getSession();
  // YouTube returns streaming data for some clients but not others — try in order of reliability
  let info;
  for (const client of ['IOS', 'ANDROID', 'WEB', 'MWEB', 'TV_EMBEDDED']) {
    try {
      info = await yt.getBasicInfo(videoId, client);
      const fmtCount = (info.streaming_data?.adaptive_formats?.length ?? 0) + (info.streaming_data?.formats?.length ?? 0);
      if (fmtCount > 0) break;
    } catch {
      // try next client
    }
  }
  if (!info) throw new Error('Could not retrieve video information from YouTube');

  const playability = info.playability_status;
  const status = playability?.status;
  if (status === 'ERROR') {
    const reason = playability?.reason || 'Video not found or unavailable';
    return jsonError(reason, 404);
  }
  if (status === 'LOGIN_REQUIRED') {
    return jsonError('This video requires sign-in (age-restricted or members-only). Not supported.', 403);
  }
  if (status === 'LIVE_STREAM_OFFLINE') {
    return jsonError('This video is an offline live stream premiere and cannot be downloaded yet.', 422);
  }

  const details = info.basic_info;
  const streamingData = info.streaming_data;

  if (!streamingData) {
    return jsonError('No streaming data available for this video.', 422);
  }

  const rawFormats = [
    ...(streamingData.adaptive_formats ?? []),
    ...(streamingData.formats ?? []),
  ];


  const player = yt.session.player;
  const formats = [];

  for (const f of rawFormats) {
    let streamUrl;
    try {
      if (f.url) {
        streamUrl = f.url;
      } else if (player && f.decipher) {
        streamUrl = f.decipher(player);
      } else if (f.signature_cipher || f.signatureCipher) {
        // Try to parse the signature cipher manually as last resort
        const sc = f.signature_cipher ?? f.signatureCipher;
        const params = new URLSearchParams(sc);
        streamUrl = params.get('url'); // URL without sig — may throttle but usable
      }
    } catch {
      continue;
    }
    if (!streamUrl) continue;

    const mimeType = f.mime_type ?? '';
    const isVideo = mimeType.startsWith('video/');
    const isAudio = mimeType.startsWith('audio/');
    const container = mimeType.split(';')[0].split('/')[1] ?? 'unknown';
    const codec = mimeType.match(/codecs="([^"]+)"/)?.[1] ?? '';

    formats.push({
      itag: f.itag,
      label: f.quality_label
        ?? (f.audio_quality ? f.audio_quality.replace('AUDIO_QUALITY_', '').toLowerCase() : null)
        ?? f.quality
        ?? 'unknown',
      type: isVideo && isAudio ? 'combined' : isVideo ? 'video' : 'audio',
      container,
      codec,
      bitrate: f.bitrate ?? null,
      filesize: f.content_length ? Number(f.content_length) : null,
      width: f.width ?? null,
      height: f.height ?? null,
      fps: f.fps ?? null,
      // Proxy the URL through our /stream endpoint so the browser can fetch with CORS
      url: `${workerOrigin}/stream?u=${encodeURIComponent(btoa(streamUrl))}`,
    });
  }

  // Sort: combined (legacy) first, then video (highest res first), then audio (highest bitrate first)
  formats.sort((a, b) => {
    const order = { combined: 0, video: 1, audio: 2 };
    if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
    return (b.bitrate ?? 0) - (a.bitrate ?? 0);
  });

  return jsonOk({
    id: videoId,
    title: details?.title ?? '',
    author: details?.author ?? '',
    duration: details?.duration ?? 0,
    is_live: details?.is_live ?? false,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    thumbnail_fallback: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    formats,
  });
}

// ---------------------------------------------------------------------------
// /stream?u={base64EncodedStreamUrl}
// Range-aware transparent proxy from YouTube CDN to the browser.
// Only proxies URLs from *.googlevideo.com (YouTube's CDN).
// ---------------------------------------------------------------------------
async function handleStream(request, url) {
  const encoded = url.searchParams.get('u');
  if (!encoded) return jsonError('Missing stream URL parameter', 400);

  let streamUrl;
  try {
    streamUrl = atob(decodeURIComponent(encoded));
  } catch {
    return jsonError('Invalid stream URL encoding', 400);
  }

  // Security: only proxy YouTube CDN URLs
  if (!isYouTubeCdnUrl(streamUrl)) {
    return jsonError('Only YouTube CDN URLs may be proxied', 403);
  }

  const rangeHeader = request.headers.get('range');
  const upstream = await fetch(streamUrl, {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: {
      ...(rangeHeader ? { 'Range': rangeHeader } : {}),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.youtube.com/',
    },
  });

  const responseHeaders = new Headers(CORS_HEADERS);
  for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'Last-Modified', 'ETag']) {
    const v = upstream.headers.get(h);
    if (v) responseHeaders.set(h, v);
  }
  // Aggressively cache proxied bytes — the stream URL has built-in expiry
  responseHeaders.set('Cache-Control', 'public, max-age=3600');

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isYouTubeCdnUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === 'https:' && (
      hostname.endsWith('.googlevideo.com') ||
      hostname === 'googlevideo.com'
    );
  } catch {
    return false;
  }
}

function jsonOk(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function jsonError(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

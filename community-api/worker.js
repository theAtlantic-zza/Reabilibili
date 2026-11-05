const BVID = /^BV[A-Za-z0-9]{10}$/;
const PAGES_ORIGIN = 'https://theatlantic-zza.github.io';
const CATALOG_URL = PAGES_ORIGIN + '/Reabilibili/catalog.json';
const SOURCE_HEADERS = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' };
const VIDEO_HOSTS = new Set(['bilibili.com', 'www.bilibili.com', 'm.bilibili.com']);
const PREVIEW_HOSTS = new Set([...VIDEO_HOSTS, 'b23.tv']);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function checkBvid(value) {
  if (typeof value !== 'string' || !BVID.test(value)) throw new ApiError(400, '请输入有效的 B 站视频链接或 BV 号。');
  return value;
}

async function readLimited(stream, limit) {
  if (!stream) return '';
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new ApiError(413, '内容过长，请缩短后再试。');
    }
    text += decoder.decode(value, { stream: true });
  }
}

async function parseVideoInput(value) {
  const input = value?.trim() || '';
  if (input.length > 2048) throw new ApiError(400, '分享链接过长。');
  if (BVID.test(input)) return input;
  const candidate = input.match(/https?:\/\/[^\s<>"'，。；！？【】（）]+/i)?.[0];
  if (!candidate) throw new ApiError(400, '请粘贴 B 站视频链接、b23.tv 分享短链或 BV 号。');
  let target;
  try { target = new URL(candidate); }
  catch { throw new ApiError(400, '无法识别这个链接。'); }
  for (let hop = 0; hop < 4; hop++) {
    if (!PREVIEW_HOSTS.has(target.hostname) || target.username || target.password || target.port ||
        !['https:', 'http:'].includes(target.protocol)) break;
    if (VIDEO_HOSTS.has(target.hostname)) {
      const match = /^\/video\/(BV[A-Za-z0-9]{10})(?:\/|$)/.exec(target.pathname);
      if (match) return match[1];
      break;
    }
    if (!/^\/[a-zA-Z0-9_-]{3,64}\/?$/.test(target.pathname)) break;
    // Fetch only b23.tv itself. Validate the next URL before following anything.
    let response;
    try {
      response = await fetch('https://b23.tv' + target.pathname, {
        headers: SOURCE_HEADERS, redirect: 'manual', signal: AbortSignal.timeout(5000),
      });
    } catch { throw new ApiError(502, 'B 站短链暂时无法解析，请复制原站完整链接。'); }
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) break;
    try { target = new URL(location, target); } catch { break; }
  }
  throw new ApiError(400, '该链接无法定位到 B 站视频，请打开原片后复制完整视频链接。');
}

async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function userIdFor(request) {
  const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '');
  if (!match) throw new ApiError(401, '缺少本机的推荐凭证，请重新打开社区页。');
  return sha256('reabili-user-v1:' + match[1]);
}

function publicVideo(record) {
  return {
    bvid: record.bvid, title: record.title, creator: record.creator, cover: record.cover,
    metadataPending: !record.creator,
    url: 'https://www.bilibili.com/video/' + record.bvid + '/',
  };
}

function safeCover(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return '';
    if (!/(^|\.)(hdslb\.com|biliimg\.com)$/.test(url.hostname)) return '';
    url.protocol = 'https:';
    return url.href;
  } catch { return ''; }
}

function metadata(bvid, title, creator, cover) {
  if (typeof title !== 'string' || !title.trim() || typeof creator !== 'string' || !creator.trim()) return null;
  return publicVideo({ bvid, title: title.trim().slice(0, 350), creator: creator.trim().slice(0, 100), cover: safeCover(cover) });
}

function unavailable() {
  return new ApiError(404, '没有找到这个 B 站视频，可能已下架。');
}

function matchingArchive(bvid, archive) {
  if (archive?.bvid !== bvid) return null;
  if (typeof archive.state === 'number' && archive.state !== 0) throw unavailable();
  if (archive.state !== 0) return null;
  return metadata(bvid, archive.title, archive.owner?.name, archive.pic);
}

async function lookupMetadata(bvid, env) {
  try {
    const response = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, {
      headers: SOURCE_HEADERS, redirect: 'error', signal: AbortSignal.timeout(6000),
    });
    if (response.status === 404 || response.status === 410) throw unavailable();
    if (response.ok) {
      const payload = JSON.parse(await readLimited(response.body, 3_000_000));
      if (payload.code === 0) {
        const found = matchingArchive(bvid, payload.data);
        if (found) return found;
      }
      if ([-404, 62002, 62004].includes(payload.code)) throw unavailable();
    }
  } catch (error) { if (error instanceof ApiError && error.status === 404) throw error; }
  // During upstream throttling the curated catalog provides previously verified metadata.
  try {
    const response = env.ASSETS
      ? await env.ASSETS.fetch(new Request(new URL('/catalog.json', CATALOG_URL)))
      : await fetch(CATALOG_URL, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const catalog = JSON.parse(await readLimited(response.body, 3_000_000));
      const v = catalog.videos.find(v => v.bvid === bvid);
      const found = v && metadata(bvid, v.title, v.creator, v.cover);
      if (found) return found;
    }
  } catch { /* Unavailable metadata must not turn into a fabricated listing. */ }
  // Bili also embeds the archive as JSON in the public watch page.
  try {
    const response = await fetch('https://www.bilibili.com/video/' + bvid + '/', {
      headers: SOURCE_HEADERS, redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404 || response.status === 410) throw unavailable();
    if (response.ok) {
      const html = await readLimited(response.body, 3_000_000);
      const state = /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:\(function|<\/script>)/.exec(html);
      const found = state && matchingArchive(bvid, JSON.parse(state[1]).videoData);
      if (found) return found;
    }
  } catch (error) { if (error instanceof ApiError && error.status === 404) throw error; }
  // Only the BVID and canonical link are known. No title, cover or author has been verified.
  return publicVideo({ bvid, title: bvid, creator: '', cover: '' });
}

async function resolveMetadata(db, bvid, env) {
  const existing = await db.prepare('SELECT bvid, title, creator, cover FROM community_videos WHERE bvid = ?').bind(bvid).first();
  if (existing?.creator) return publicVideo(existing);
  const video = await lookupMetadata(bvid, env);
  if (existing && !video.metadataPending) {
    await db.prepare(`UPDATE community_videos SET title = ?, creator = ?, cover = ?
      WHERE bvid = ? AND creator = ''`).bind(video.title, video.creator, video.cover, bvid).run();
  }
  return video;
}

function validatedText(value, min, max, error) {
  if (typeof value !== 'string') throw new ApiError(400, error);
  const text = value.trim();
  const length = [...text].length;
  if (length < min || length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new ApiError(400, error);
  return text;
}

async function limitRequests(request, db) {
  const minute = Math.floor(Date.now() / 60000);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const key = await sha256('reabili-window:' + minute + ':' + ip);
  const [, result] = await db.batch([
    db.prepare('DELETE FROM community_rate_windows WHERE minute < ?').bind(minute - 1),
    db.prepare(`INSERT INTO community_rate_windows (window_key, minute, uses) VALUES (?, ?, 1)
      ON CONFLICT(window_key) DO UPDATE SET uses = uses + 1 WHERE uses < 90
      RETURNING uses`).bind(key, minute),
  ]);
  if (!result.results?.length) throw new ApiError(429, '操作太频繁，请过一分钟再试。');
}

async function feed(db) {
  // The migration caps the pilot at 2000 active recommendations. Entries never disappear due to pagination.
  const { results } = await db.prepare(`SELECT v.bvid, v.title, v.creator, v.cover, v.first_recommended_at,
    p.user_id, p.nickname, r.reason, r.created_at
    FROM community_recommendations r
    JOIN community_profiles p ON r.user_id = p.user_id
    JOIN community_videos v ON r.bvid = v.bvid
    ORDER BY r.created_at DESC, r.user_id, r.bvid LIMIT 2000`).all();
  const byVideo = new Map();
  for (const row of results) {
    if (!byVideo.has(row.bvid)) {
      byVideo.set(row.bvid, { ...publicVideo(row), firstRecommendedAt: row.first_recommended_at, recommendations: [] });
    }
    byVideo.get(row.bvid).recommendations.push({
      userId: row.user_id, nickname: row.nickname, reason: row.reason, createdAt: row.created_at,
    });
  }
  return { videos: Array.from(byVideo.values()) };
}

async function putRecommendation(request, env, userId) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    throw new ApiError(415, '请以 JSON 提交推荐。');
  }
  const text = await readLimited(request.body, 8192);
  let body;
  try { body = JSON.parse(text); } catch { throw new ApiError(400, '推荐内容格式有误。'); }
  const bvid = checkBvid(body?.bvid);
  const nickname = validatedText(body.nickname, 1, 24, '昵称长度应为 1 到 24 个字。');
  if (/[\n\r\t]/.test(nickname)) throw new ApiError(400, '昵称不能包含换行或制表符。');
  const reason = body.reason === undefined ? null : validatedText(body.reason, 0, 300, '推荐理由最多 300 个字。');
  const db = env.DB, video = await resolveMetadata(db, bvid, env);
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(`INSERT INTO community_profiles (user_id, nickname) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET nickname = excluded.nickname`).bind(userId, nickname),
      db.prepare(`INSERT INTO community_videos (bvid, title, creator, cover, first_recommended_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(bvid) DO UPDATE SET
        title = excluded.title, creator = excluded.creator, cover = excluded.cover
        WHERE community_videos.creator = '' AND excluded.creator <> ''`).bind(bvid, video.title, video.creator, video.cover, now),
      db.prepare(`INSERT INTO community_recommendations (user_id, bvid, reason, created_at)
        VALUES (?, ?, COALESCE(?, ''), ?) ON CONFLICT(user_id, bvid)
        DO UPDATE SET reason = COALESCE(?, community_recommendations.reason)`).bind(userId, bvid, reason, now, reason),
    ]);
  } catch (error) {
    if (String(error).includes('community_pilot_capacity') || String(error.cause).includes('community_pilot_capacity')) {
      throw new ApiError(409, '已达到试用版的推荐容量，可撤回旧推荐或联系维护者。');
    }
    throw error;
  }
  return { userId };
}

function allowedOrigin(origin, requestUrl, env) {
  return !origin || [PAGES_ORIGIN, requestUrl.origin, env.SITE_ORIGIN, 'http://localhost:8876', 'http://127.0.0.1:8876'].includes(origin);
}

async function handle(request, url, env) {
  const db = env.DB;
  const route = request.method + ' ' + url.pathname;
  if (route === 'GET /api/feed') return feed(db);
  if (route === 'GET /api/preview') {
    await limitRequests(request, db);
    return resolveMetadata(db, await parseVideoInput(url.searchParams.get('url')), env);
  }
  if (route === 'GET /api/me') {
    const userId = await userIdFor(request);
    const profile = await db.prepare('SELECT nickname FROM community_profiles WHERE user_id = ?').bind(userId).first();
    return { userId, nickname: profile?.nickname || '' };
  }
  if (route === 'PUT /api/recommend' || route === 'DELETE /api/recommend') {
    const userId = await userIdFor(request);
    await limitRequests(request, db);
    if (request.method === 'PUT') return putRecommendation(request, env, userId);
    const bvid = checkBvid(url.searchParams.get('bvid'));
    await db.prepare('DELETE FROM community_recommendations WHERE user_id = ? AND bvid = ?').bind(userId, bvid).run();
    return { userId };
  }
  throw new ApiError(404, '找不到此接口。');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const headers = {
      'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    };
    if (!allowedOrigin(origin, url, env)) return Response.json({ error: '来源未获准。' }, { status: 403, headers });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      return Response.json(await handle(request, url, env), { headers });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ error: status === 500 ? '社区服务暂时不可用，请稍后重试。' : error.message }, { status, headers });
    }
  },
};

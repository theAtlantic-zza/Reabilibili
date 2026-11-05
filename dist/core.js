export const CATEGORIES = {
  ai: 'AI', code: '编程', world: '世界通识', english: '英语', health: '健康', sports: '运动',
};
export const TOPICS = { math: '数理基础', finance: '财经', humanities: '人文与社会' };
export const KINDS = { course: '系列课程', explainer: '知识讲解', interview: '访谈', practice: '运动练习', documentary: '纪录' };
export const LIBRARY_KEY = 'reabili-library-v1';
export const emptyLibrary = () => ({ version: 2, favorites: [], later: [], history: [], completed: [], parts: {} });

export function duration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function normalizeLibrary(raw, videos) {
  if (!raw || typeof raw !== 'object' || ![1, 2].includes(raw.version)) throw new Error('片单格式不受支持');
  const ids = new Set(videos.map(v => v.id));
  const clean = key => {
    if (raw[key] != null && !Array.isArray(raw[key])) throw new Error('片单格式不正确');
    return [...new Set((raw[key] || []).filter(id => typeof id === 'string' && ids.has(id)))];
  };
  if (raw.history != null && !Array.isArray(raw.history)) throw new Error('历史记录格式不正确');
  const history = (raw.history || []).filter(v => v && ids.has(v.id) && typeof v.at === 'string' && Number.isFinite(Date.parse(v.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const seen = new Set();
  const parts = {};
  if (raw.parts && typeof raw.parts === 'object') {
    for (const v of videos) {
      const p = raw.parts[v.id];
      if (Number.isInteger(p) && v.pages.some(part => part.page === p)) parts[v.id] = p;
    }
  }
  return {
    version: 2, favorites: clean('favorites'), later: clean('later'), completed: clean('completed'), parts,
    history: history.filter(v => !seen.has(v.id) && seen.add(v.id)).slice(0, 200).map(({ id, at }) => ({ id, at })),
  };
}

export function mergeLibraries(current, incoming, videos) {
  const next = normalizeLibrary(incoming, videos);
  return normalizeLibrary({
    version: 2,
    favorites: [...current.favorites, ...next.favorites], later: [...current.later, ...next.later],
    completed: [...current.completed, ...next.completed], history: [...current.history, ...next.history],
    parts: { ...next.parts, ...current.parts },
  }, videos);
}

export function filterVideos(videos, filter = {}) {
  const terms = (filter.q || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  let result = videos.filter(v => {
    const haystack = [v.title, v.creator, v.summary, v.bvid, CATEGORIES[v.category], TOPICS[v.topic], ...v.tags].join(' ').toLocaleLowerCase();
    return (!filter.category || v.category === filter.category)
      && (!filter.topic || v.topic === filter.topic)
      && (!filter.kind || v.kind === filter.kind)
      && terms.every(term => haystack.includes(term))
      && (!filter.time || (filter.time === 'short' ? v.duration < 600 : filter.time === 'medium' ? v.duration >= 600 && v.duration < 3600 : v.duration >= 3600));
  });
  if (filter.sort === 'newest') result.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  if (filter.sort === 'short') result.sort((a, b) => a.duration - b.duration);
  if (filter.sort === 'long') result.sort((a, b) => b.duration - a.duration);
  return result;
}

export function videoUrl(video, page = 1, embed = false) {
  const part = video.pages.find(p => p.page === Number(page)) || video.pages[0];
  // Season episodes have their own BVID and start at p=1 on the source site.
  const bvid = part?.bvid ?? video.bvid;
  if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) throw new Error('无效的视频编号');
  const number = part?.bvid ? 1 : (part?.page || 1);
  if (!embed) return `https://www.bilibili.com/video/${bvid}/?p=${number}`;
  const params = new URLSearchParams({ bvid, p: String(number), autoplay: '0', danmaku: '0', isOutside: 'true' });
  const aid = part?.aid ?? video.aid;
  if (aid) params.set('aid', String(aid));
  if (part?.cid) params.set('cid', String(part.cid));
  return `https://player.bilibili.com/player.html?${params}`;
}

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

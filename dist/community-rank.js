const HOUR = 60 * 60 * 1000;
const LAYOUT = ['week', 'fresh', 'week', 'discovery', 'fresh', 'week', 'week', 'fresh', 'discovery', 'week'];

function recommendationStats(video, now) {
  const firstByUser = new Map();
  for (const rec of video.recommendations || []) {
    const time = Date.parse(rec.createdAt);
    // A new server timestamp can be a few minutes ahead of a friend's phone.
    if (!rec.userId || !Number.isFinite(time) || time > now + 5 * 60000) continue;
    firstByUser.set(rec.userId, Math.min(time, now, firstByUser.get(rec.userId) ?? time));
  }
  if (!firstByUser.size) return null;

  const recordedFirst = Date.parse(video.firstRecommendedAt);
  let first = Number.isFinite(recordedFirst) ? recordedFirst : Infinity;
  let weeklyCount = 0;
  for (const time of firstByUser.values()) {
    first = Math.min(first, time);
    if (time >= now - 7 * 24 * HOUR) weeklyCount++;
  }
  return { video, fresh: first >= now - 48 * HOUR, total: firstByUser.size, weeklyCount };
}

// Within an equal-score group, rotate by one batch each period. With an
// unchanged pool, every member takes a turn at the front without tracking views.
function orderedPool(candidates, score, period, batchSize) {
  const byScore = new Map();
  for (const row of candidates) {
    const value = score(row);
    if (!byScore.has(value)) byScore.set(value, []);
    byScore.get(value).push(row.video);
  }
  const ordered = [];
  for (const value of [...byScore.keys()].sort((a, b) => b - a)) {
    const tied = byScore.get(value);
    tied.sort((a, b) => a.bvid < b.bvid ? -1 : a.bvid > b.bvid ? 1 : 0);
    const offset = (period * batchSize) % tied.length;
    ordered.push(...tied.slice(offset), ...tied.slice(0, offset));
  }
  return ordered;
}

export function rankHome(videos, now = Date.now()) {
  const rows = [];
  const seen = new Set();
  for (const video of videos) {
    if (!video.bvid || seen.has(video.bvid)) continue;
    const row = recommendationStats(video, now);
    if (row) {
      seen.add(video.bvid);
      rows.push(row);
    }
  }
  const period = Math.floor(now / (6 * HOUR));
  const pools = {
    fresh: orderedPool(rows.filter(row => row.fresh), () => 0, period, 3),
    discovery: orderedPool(rows.filter(row => !row.fresh), row => -row.total, period, 2),
    week: orderedPool(rows.filter(row => row.weeklyCount >= 2), row => row.weeklyCount, period, 5),
  };

  const used = new Set();
  const creatorCounts = new Map();
  function take(pool, creatorLimit) {
    const video = pool.find(v => !used.has(v.bvid) && (creatorCounts.get(v.creator) || 0) < creatorLimit);
    if (video) {
      used.add(video.bvid);
      creatorCounts.set(video.creator, (creatorCounts.get(video.creator) || 0) + 1);
    }
    return video;
  }

  const slots = Array(LAYOUT.length);
  // Reserve discovery seats before the weekly pool can absorb their candidates.
  for (const lane of ['fresh', 'discovery', 'week']) {
    LAYOUT.forEach((name, index) => {
      if (name === lane) slots[index] = take(pools[lane], 2);
    });
  }
  const overflow = [...pools.week, ...pools.fresh, ...pools.discovery];
  for (const limit of [2, Infinity]) {
    LAYOUT.forEach((name, index) => {
      if (!slots[index]) slots[index] = take(pools[name], limit) || take(overflow, limit);
    });
  }
  return slots.filter(Boolean);
}

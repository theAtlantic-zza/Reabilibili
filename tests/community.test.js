import assert from 'node:assert/strict';
import test from 'node:test';
import { rankHome } from '../dist/community-rank.js';

const now = Date.parse('2026-11-05T06:01:00Z');
const hour = 3600000;
const ago = hours => new Date(now - hours * hour).toISOString();
function video(bvid, ageHours, count = 1, extra = {}) {
  return {
    bvid, creator: bvid,
    recommendations: Array.from({ length: count }, (_, i) => ({ userId: 'user-' + i, createdAt: ago(ageHours) })),
    ...extra,
  };
}
const ids = list => list.map(v => v.bvid);

test('10 seats preserve all three pools even with a much larger popular cohort', () => {
  const many = Array.from({ length: 40 }, (_, i) => video('popular-' + i, 72, i + 2));
  const fresh = Array.from({ length: 8 }, (_, i) => video('fresh-' + i, 24));
  const older = Array.from({ length: 8 }, (_, i) => video('older-' + i, 240));
  const selected = ids(rankHome([...many, ...fresh, ...older], now));
  assert.deepEqual(selected.map(id => id.split('-')[0]), [
    'popular','fresh','popular','older','fresh','popular','popular','fresh','older','popular',
  ]);
  assert.deepEqual(selected.filter(id => id.startsWith('popular')), many.slice(-5).reverse().map(v => v.bvid));
});

test('no votes means no card; future, invalid and duplicate recommendations never manufacture popularity', () => {
  const old = video('repeated', 200);
  const duplicate = { ...old.recommendations[0], createdAt: ago(1) };
  old.recommendations.push(duplicate, duplicate);
  const clean = video('blank', 60, 2);
  const future = video('future', -5);
  const bad = video('bad', 4, 1, { recommendations:[{ userId:'a', createdAt:'broken' }] });
  assert.deepEqual(rankHome([future, bad, video('none', 4, 0)], now), []);
  assert.deepEqual(ids(rankHome([video('clock-skew', -0.04)], now)), ['clock-skew']);
  assert.deepEqual(ids(rankHome([old, clean, future, bad, old], now)).sort(), ['blank','repeated']);
  const alternatives = Array.from({ length: 6 }, (_, i) => video('recent-' + i, 60, 2));
  const layout = ids(rankHome([old, ...alternatives, ...[0,1,2].map(i => video('new-' + i, 12))], now));
  assert.ok(![0,2,5,6,9].some(i => layout[i] === 'repeated'));
});

test('first public submission survives withdrawals; fresh uses the exact 48-hour boundary', () => {
  const fresh = [0,1,2].map(i => video('fresh-' + i, 48, 1));
  const revived = video('revived', 1, 1, { firstRecommendedAt: ago(240) });
  const hot = Array.from({ length: 5 }, (_, i) => video('week-' + i, 100, 5));
  const selected = ids(rankHome([...fresh, ...hot, revived, video('old', 49)], now));
  assert.deepEqual([selected[1],selected[4],selected[7]].sort(), ids(fresh));
  assert.deepEqual([selected[3],selected[8]].sort(), ['old','revived']);
});

test('recommendation text and input order do not change rank; ties rotate after six hours', () => {
  const items = Array.from({ length: 30 }, (_, i) => video('rotate-' + i, 240));
  const before = ids(rankHome(items, now));
  const withReasons = items.toReversed().map(v => ({
    ...v, recommendations:v.recommendations.map(rec => ({ ...rec, reason:'a very long explanation' })),
  }));
  assert.deepEqual(ids(rankHome(withReasons, now + hour)), before);
  assert.notDeepEqual(ids(rankHome(items, now + 6 * hour)), before);
  const covered = new Set();
  for (let turn = 0; turn < 15; turn++) {
    rankHome(items, now + turn * 6 * hour).forEach(v => covered.add(v.bvid));
  }
  assert.equal(covered.size, items.length);
  assert.equal(items[0].bvid, 'rotate-0');
});

test('creator cap holds with alternatives and relaxes only to fill remaining seats', () => {
  const same = Array.from({ length: 12 }, (_, i) => video('same-' + i, 72, 10, { creator:'shared' }));
  const others = Array.from({ length: 8 }, (_, i) => video('other-' + i, 240));
  const mixed = rankHome([...same, ...others], now);
  assert.equal(mixed.length, 10);
  assert.equal(mixed.filter(v => v.creator === 'shared').length, 2);
  assert.equal(rankHome(same, now).length, 10);
  assert.deepEqual(new Set(ids(rankHome(same.slice(0, 3), now))), new Set(ids(same.slice(0, 3))));
});

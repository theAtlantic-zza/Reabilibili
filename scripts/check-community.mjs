#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const usage = 'Usage: node scripts/check-community.mjs <API base URL> --read-only|--write';
const origin = 'https://theatlantic-zza.github.io';
const bvid = 'BV1Q34y1E72s';

async function checkCommunity(base, mode) {
  const api = new URL(base);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname);
  assert(api.protocol === 'https:' || (api.protocol === 'http:' && loopback), 'Use HTTPS or a loopback preview');
  assert(!api.username && !api.password && !api.search && !api.hash, 'Expected a plain API base URL');
  api.pathname = api.pathname.replace(/\/+$/, '').replace(/\/api$/, '') + '/api/';

  async function request(path, { method = 'GET', token, body, preflight = false, allowMissing = false } = {}) {
    const headers = { Origin: origin };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';
    if (preflight) {
      headers['Access-Control-Request-Method'] = 'PUT';
      headers['Access-Control-Request-Headers'] = 'authorization, content-type';
    }
    const response = await fetch(new URL(path, api), {
      method, headers, body: body && JSON.stringify(body),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    if (allowMissing && response.status === 404) return response;
    assert(response.ok, method + ' ' + path.split('?')[0] + ' returned HTTP ' + response.status);
    assert([origin, '*'].includes(response.headers.get('access-control-allow-origin')), 'Pages origin missing from CORS response');
    return response;
  }
  const read = async (path, options) => (await request(path, options)).json();
  const feed = async () => {
    const { videos } = await read('feed');
    assert(Array.isArray(videos), 'Public feed missing videos');
    return videos;
  };
  const preflight = await request('recommend', { method:'OPTIONS', preflight:true });
  const methods = (preflight.headers.get('access-control-allow-methods') || '').toUpperCase().split(/\s*,\s*/);
  const headers = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase().split(/\s*,\s*/);
  assert(methods.includes('PUT') && methods.includes('DELETE'), 'CORS missing PUT or DELETE');
  assert(headers.includes('authorization') && headers.includes('content-type'), 'CORS missing request headers');
  const preview = await read('preview?' + new URLSearchParams({ url:'https://www.bilibili.com/video/' + bvid + '/' }));
  assert(preview.bvid === bvid && preview.title && preview.creator, 'Bilibili preview returned unexpected metadata');
  const initial = await feed();
  console.log('Public feed (' + initial.length + ' videos), preview and Pages CORS passed.');
  if (mode === '--read-only') return;

  const clients = await Promise.all(['A', 'B'].map(async label => {
    const token = randomBytes(32).toString('hex');
    const { userId, nickname } = await read('me', { token });
    assert(typeof userId === 'string' && userId && userId !== token && !nickname, 'Expected a fresh identity');
    assert(!initial.some(v => v.recommendations.some(r => r.userId === userId)), 'Identity already has public activity');
    return { userId, token, nickname:'试用检查' + label + randomBytes(3).toString('hex') };
  }));
  const [alice, bob] = clients;
  assert(alice.userId !== bob.userId, 'Independent clients share an identity');
  const put = async (client, reason) => {
    const result = await read('recommend', {
      method:'PUT', token:client.token, body:{ bvid, nickname:client.nickname, reason },
    });
    assert(result.userId === client.userId, 'PUT response changed identity');
  };
  const withdraw = client => request('recommend?bvid=' + bvid, { method:'DELETE', token:client.token, allowMissing:true });
  const publicRows = async () => (await feed()).find(v => v.bvid === bvid)?.recommendations || [];
  function findOne(rows, client) {
    const matches = rows.filter(r => r.userId === client.userId);
    assert.equal(matches.length, 1, 'Expected one public recommendation per identity');
    assert(matches[0].nickname === client.nickname, 'Public nickname does not match');
    return matches[0];
  }

  try {
    await put(alice);
    const original = findOne(await publicRows(), alice);
    assert(!original.reason && Number.isFinite(Date.parse(original.createdAt)), 'Blank reason or creation time is invalid');
    await put(alice);
    const reason = '自动检查完成后撤回';
    await put(alice, reason);
    await put(bob);
    const shared = await publicRows();
    const edited = findOne(shared, alice);
    assert(edited.reason === reason && edited.createdAt === original.createdAt, 'Edit changed original time or lost reason');
    assert(!findOne(shared, bob).reason, 'Other client unexpectedly has a reason');
    const own = await read('me', { token:alice.token });
    assert(own.nickname === alice.nickname && own.userId === alice.userId, 'Identity readback failed');
    await withdraw(bob);
    const after = await publicRows();
    assert(!after.some(r => r.userId === bob.userId), 'Withdrawal did not remove own recommendation');
    assert(findOne(after, alice).reason === reason, 'One account changed another account’s recommendation');
  } finally {
    // Retrying a DELETE is safe even if the first response was lost.
    const clean = await Promise.allSettled(clients.map(client => withdraw(client).catch(() => withdraw(client))));
    assert(clean.every(r => r.status === 'fulfilled'), 'Cleanup request failed; check the two temporary recommendations');
    const remaining = await publicRows();
    assert(!remaining.some(r => clients.some(c => c.userId === r.userId)), 'Temporary recommendations still appear in the feed');
  }
  console.log('Two-client write, public readback, edit, undo and cleanup passed.');
}

try {
  const [base, mode, ...extra] = process.argv.slice(2);
  assert(base && ['--read-only', '--write'].includes(mode) && !extra.length, usage);
  await checkCommunity(base, mode);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

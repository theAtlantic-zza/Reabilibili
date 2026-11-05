import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyLibrary, normalizeLibrary, mergeLibraries, filterVideos, videoUrl, duration } from '../dist/core.js';
const { videos, collections } = JSON.parse(readFileSync(new URL('../dist/catalog.json',import.meta.url)));
const linear = videos.find(v=>v.bvid==='BV1ys411472E');

test('world knowledge separates mathematics and finance; compound search intersects terms',()=>{
  const math=filterVideos(videos,{category:'world',topic:'math'});
  assert.equal(math.length,3);
  assert.ok(math.includes(linear));
  assert.equal(filterVideos(videos,{q:'3blue1brown 线性代数'})[0].id,linear.id);
  assert.ok(filterVideos(videos,{category:'world',topic:'finance'}).every(v=>v.creator==='小Lin说'));
  assert.equal(filterVideos(videos,{q:'这个视频不存在92832'}).length,0);
});
test('duration and format filters compose and do not mutate curated order',()=>{
  const ids=videos.map(v=>v.id);
  const selected=filterVideos(videos,{category:'sports',time:'short',kind:'practice',sort:'short'});
  assert.ok(selected.length>=3);
  assert.ok(selected.every(v=>v.duration<600));
  assert.ok(selected.every((v,i)=>i===0||selected[i-1].duration<=v.duration));
  assert.deepEqual(videos.map(v=>v.id),ids);
});
test('each course part opens its own public URL and official player CID',()=>{
  assert.equal(linear.pages.length,16);
  for(const part of linear.pages){
    assert.equal(new URL(videoUrl(linear,part.page)).searchParams.get('p'),String(part.page));
    const embed=new URL(videoUrl(linear,part.page,true));
    assert.equal(embed.hostname,'player.bilibili.com');
    assert.equal(embed.searchParams.get('cid'),String(part.cid));
    assert.equal(embed.searchParams.get('autoplay'),'0');
  }
  assert.equal(videoUrl(linear,999),videoUrl(linear,1));
  assert.throws(()=>videoUrl({...linear,bvid:'javascript:alert(1)'}));
});
test('a chapter with a separate BVID opens its own archive at p=1', () => {
  const episode = { page: 23, bvid: 'BV1uK411x7cp', aid: 495863559, cid: 1393925618 };
  const series = { bvid: 'BV1Q34y1E72s', aid: 811846121, pages: [episode] };
  assert.equal(videoUrl(series, 23), 'https://www.bilibili.com/video/BV1uK411x7cp/?p=1');
  const params = new URL(videoUrl(series, 23, true)).searchParams;
  for (const key of ['bvid', 'aid', 'cid']) assert.equal(params.get(key), String(episode[key]));
  assert.equal(params.get('p'), '1');
  assert.throws(() => videoUrl({ ...series, pages: [{ ...episode, bvid: '../wrong' }] }, 23));
});
test('old library migrates, deduplicates and drops unknown IDs without losing valid records',()=>{
  const raw={version:1,favorites:[linear.id,linear.id,'unknown'],later:[],history:[{id:linear.id,at:'2026-10-01T00:00:00Z'},{id:linear.id,at:'2026-10-02T00:00:00Z'}]};
  const state=normalizeLibrary(raw,videos);
  assert.deepEqual(state.favorites,[linear.id]);
  assert.equal(state.history.length,1);
  assert.equal(state.history[0].at,'2026-10-02T00:00:00Z');
  assert.equal(state.version,2);
});
test('import merges instead of replacing and rejects unsupported data',()=>{
  const old={...emptyLibrary(),favorites:[videos[0].id],parts:{[linear.id]:2}};
  const incoming={...emptyLibrary(),favorites:[videos[1].id],parts:{[linear.id]:999}};
  const merged=mergeLibraries(old,incoming,videos);
  assert.deepEqual(merged.favorites,[videos[0].id,videos[1].id]);
  assert.equal(merged.parts[linear.id],2);
  assert.throws(()=>normalizeLibrary({version:9},videos));
  assert.throws(()=>normalizeLibrary({version:2,favorites:'invalid'},videos));
});
test('collections never contain broken or duplicate video references',()=>{
  const known=new Set(videos.map(v=>v.id));
  for(const collection of collections){assert.ok(collection.videos.length);assert.equal(new Set(collection.videos).size,collection.videos.length);assert.ok(collection.videos.every(id=>known.has(id)));}
});
test('duration formatting handles short clips and long courses',()=>{
  assert.equal(duration(68),'1:08');assert.equal(duration(10363),'2:52:43');assert.equal(duration(-1),'0:00');
});

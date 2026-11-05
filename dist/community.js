import { rankHome } from './community-rank.js';
import { API_BASE } from './community-config.js';

const main = document.querySelector('#content');
const people = document.querySelector('#people');
const editor = document.querySelector('#editor');
const notice = document.querySelector('#notice');
const identityKey = 'reabili-community-device-v1';
const bvidPattern = /^BV[a-zA-Z0-9]{10}$/;
const userPattern = /^[0-9a-f]{64}$/;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byNewest = (a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
const pathFor = (type,id) => `#/${type}/${encodeURIComponent(id)}`;
let videos = [], loaded = false, loading = false, loadError = '', mutating = false;
let me = {userId:'', nickname:''}, token = '', meReady = false;
let preview = null, formText = '', previewError = '', checking = false, previewSeq = 0;
let pendingEditor = null, lastPeopleHash = '', noticeTimer, refreshAgain = false;

function route(hash = location.hash) {
  const [path, query] = hash.replace(/^#\/?/, '').split('?');
  const [view, id] = path.split('/');
  return {view: view || 'home', id: id || '', params: new URLSearchParams(query)};
}
function go(hash, replace = false) {
  if (hash === location.hash && !replace) return;
  history[replace ? 'replaceState' : 'pushState']({from:location.hash || '#/'}, '', hash);
  changeRoute();
}
function baseHash() {
  const from = route().params.get('from');
  return /^#\/(?:latest|me|profile\/[0-9a-f]{64}|video\/BV[0-9a-zA-Z]{10})?$/.test(from || '') ? from : '#/';
}
function closePeople() {
  if (history.state?.from === baseHash()) history.back();
  else go(baseHash(), true);
}
function toast(message) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 3700);
}
function message(error) {
  return error instanceof Error ? error.message : '操作失败，请重试。';
}
async function api(path, {method = 'GET', body, authorized = false} = {}) {
  const headers = {Accept:'application/json'};
  if (authorized) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18000);
  try {
    const response = await fetch(API_BASE.replace(/\/$/,'') + '/api' + path, {
      method, headers, body:body === undefined ? undefined : JSON.stringify(body),
      signal:ctrl.signal, credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '请求未完成，请重试。');
    return data;
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError || error.name === 'AbortError')
      throw new Error('暂时连不上社区，请稍后重试。');
    throw error;
  } finally { clearTimeout(timer); }
}
function readToken() {
  try { const t = localStorage.getItem(identityKey); return userPattern.test(t || '') ? t : ''; }
  catch { return ''; }
}
async function identify() {
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const nextToken = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
    try { localStorage.setItem(identityKey, nextToken); }
    catch { throw new Error('请允许浏览器保存此站点的数据，以便管理自己的推荐。'); }
    token = nextToken;
  }
  if (!meReady) {
    me = await api('/me', {authorized:true});
    meReady = true;
  }
}
function lookup(id) {
  return videos.find(v => v.bvid === id) || (preview?.bvid === id ? preview : null);
}
function mine(video) { return video.recommendations?.find(r => r.userId === me.userId); }
function avatar(person) {
  const initial = Array.from(person.nickname || '友')[0];
  const color = parseInt((person.userId || '0').slice(-2),16) % 4;
  return `<span class="avatar c${color}" aria-hidden="true">${esc(initial)}</span>`;
}
function original(video) { return `https://www.bilibili.com/video/${video.bvid}/`; }
function displayTitle(video) {
  return video.metadataPending || !video.title ? 'B 站视频 · 标题暂未读取' : video.title;
}
function byline(video) {
  if (video.metadataPending) return `<p class="meta"><a class="inline-link" href="${original(video)}" target="_blank" rel="noopener noreferrer">推荐前去 B 站核对视频 ↗</a></p>`;
  return video.creator ? `<p class="meta">${esc(video.creator)}</p>` : '';
}
function cover(video,href,external=false) {
  let image = '';
  try { const src = new URL(video.cover); if (src.protocol === 'https:' && /(^|\.)(hdslb\.com|biliimg\.com)$/.test(src.hostname))
    image = `<img src="${esc(src.href)}" alt="" loading="lazy" referrerpolicy="no-referrer">`; } catch {}
  const fallback = `<span class="cover-bvid" aria-hidden="true">${esc(video.bvid)}</span>`;
  return `<a class="cover" href="${esc(href)}" aria-label="${esc((external?'在 B 站播放：':'查看推荐：') + displayTitle(video))}" ${external?'target="_blank" rel="noopener noreferrer"':''}>${fallback}${image}</a>`;
}
function peopleLink(video) {
  const recs = [...(video.recommendations || [])].sort(byNewest);
  if (!recs.length) return '';
  const back = route().view === 'people' ? baseHash() : location.hash || '#/';
  const href = pathFor('people',video.bvid) + '?from=' + encodeURIComponent(back);
  return `<a class="count" href="${esc(href)}" aria-label="查看推荐这期视频的 ${recs.length} 个人"><span class="avatars">${recs.slice(0,3).map(avatar).join('')}</span>${recs.length} 人推荐 ›</a>`;
}
function recButton(video) {
  const active = Boolean(mine(video));
  return `<button class="btn recommend" data-action="recommend" data-id="${video.bvid}" aria-pressed="${active}" ${mutating?'disabled':''} aria-label="${active?'撤回推荐':'推荐'}：${esc(displayTitle(video))}">${active?'✓ 已推荐':'＋ 推荐'}</button>`;
}
function reasonButton(video) {
  const existing = mine(video);
  return existing ? `<button class="card-edit" data-action="reason" data-id="${video.bvid}">${existing.reason?'编辑推荐理由':'写两句'}</button>` : '';
}
function card(video, profileId = '') {
  const href = pathFor('video',video.bvid);
  const recs = video.recommendations || [];
  const note = profileId ? recs.find(r => r.userId === profileId) : recs.find(r => r.reason);
  return `<article class="card">${cover(video,href)}<h2 class="card-title"><a href="${href}">${esc(displayTitle(video))}</a></h2>${byline(video)}
    <div class="card-actions">${peopleLink(video)}${recButton(video)}</div>
    ${note?.reason?`<p class="reason card-note">${esc(note.nickname)}：${esc(note.reason)}</p>`:''}${reasonButton(video)}</article>`;
}
function grid(items,profileId='') { return `<div class="grid">${items.map(v=>card(v,profileId)).join('')}</div>`; }
function submitForm(empty = false) {
  return `<form id="preview-form" class="submit-box">
    ${empty?'<h2>分享第一部视频</h2>':''}
    <label for="video-input">B 站视频链接</label><div class="field-row"><input id="video-input" name="url" type="text" placeholder="粘贴链接、分享文字或 BV 号" required maxlength="2000" value="${esc(formText)}"><button class="btn primary" type="submit" ${checking?'disabled':''}>${checking?'读取中…':'查看视频'}</button></div>
    <p class="help"><a class="inline-link" href="./index.html#/browse">从原片单选一部 ↗</a></p>
    <p class="error" role="alert">${esc(previewError)}</p></form>${preview ? previewCard() : ''}`;
}
function previewCard() {
  const v = lookup(preview.bvid);
  return `<article class="preview">${cover(v,original(v),true)}<h2 class="card-title">${esc(displayTitle(v))}</h2>${byline(v)}
    <div class="card-actions">${recButton(v)}${reasonButton(v)}</div></article>`;
}
function feedPage(latest) {
  const hasFeed = videos.length > 0;
  const head = `<div class="head"><h1>社区推荐</h1>${hasFeed?'<a class="btn primary" href="#/submit">＋ 推荐视频</a>':''}</div>
    <div class="bar"><div class="tabs"><a href="#/" ${latest?'':'aria-current="page"'}>首页</a><a href="#/latest" ${latest?'aria-current="page"':''}>最新推荐</a></div><button class="plain" data-action="refresh" ${loading?'disabled':''}>${loading?'刷新中…':'刷新'}</button></div>`;
  if (!loaded) return head + statePanel();
  if (!hasFeed) return head + submitForm(true);
  const recent = v => Math.max(...v.recommendations.map(r=>Date.parse(r.createdAt)));
  const items = latest ? [...videos].sort((a,b) => recent(b)-recent(a)) : rankHome(videos);
  const ordering = latest ? '' : '<details class="ordering"><summary>首页怎样排序？</summary><p>最多展示 10 部。优先留 5 席给近 7 天有多人推荐的作品，3 席给近 48 小时首次分享的作品，2 席给较早分享、推荐较少的作品。同分轮换，空席由其他作品补上。每人推荐一部作品只计一次，填写理由不加权。</p></details>';
  return head + grid(items) + ordering;
}
function statePanel() {
  if (loadError) return `<div class="feedback"><h2>社区暂时无法读取</h2><p>${esc(loadError)}</p><div class="actions"><button class="btn" data-action="refresh">重试</button><a class="btn" href="./index.html#/browse">浏览原片单</a></div></div>`;
  return '<p class="status" role="status">正在读取社区推荐…</p>';
}
function profilePage(id,isMe) {
  const label = isMe ? '我的推荐' : '公开片单';
  if (!loaded || (isMe && token && !meReady)) return '<h1>'+label+'</h1>'+statePanel();
  const items = videos.filter(v => v.recommendations.some(r=>r.userId === id));
  const rec = v => v.recommendations.find(r=>r.userId===id);
  items.sort((a,b)=>byNewest(rec(a),rec(b)));
  const person = items.length ? rec(items[0]) : isMe && me.nickname ? me : null;
  const head = person ? `<div class="profile-title">${avatar(person)}<div><h1>${esc(person.nickname)}</h1><p class="meta">公开片单 · ${items.length} 部视频</p></div></div>` : `<h1>${label}</h1>`;
  return `<a class="crumb" href="#/">‹ 社区首页</a><div class="head profile-head">${head}${items.length?`<button class="btn" data-action="share" data-hash="${pathFor('profile',id)}">分享片单</button>`:''}</div>` +
    (items.length ? grid(items,id) : `<p class="status">${isMe?'你还没有推荐过视频。':'这个片单里还没有公开推荐。'}</p><a class="btn" href="#/submit">推荐视频</a>`);
}
function detailPage(id) {
  if (!loaded) return statePanel();
  const v = lookup(id);
  if (!v || !videos.some(item=>item.bvid===id)) return `<p class="status">这部视频目前还没有公开推荐。</p><a class="btn" href="#/submit?bvid=${encodeURIComponent(id)}">查看原视频</a>`;
  const edit = reasonButton(v);
  return `<a class="crumb" href="#/">‹ 社区首页</a><article class="detail">${cover(v,original(v),true)}
    <h1>${esc(displayTitle(v))}</h1>${byline(v)}
    <div class="card-actions">${peopleLink(v)}${recButton(v)}${edit}</div>
    <div class="actions"><a class="btn" href="${original(v)}" target="_blank" rel="noopener noreferrer">在 B 站播放 ↗</a><button class="btn" data-action="share" data-hash="${pathFor('video',v.bvid)}">转发链接</button></div></article>`;
}
function page(r) {
  switch (r.view) {
    case 'home': case 'latest': return feedPage(r.view==='latest');
    case 'profile': return profilePage(r.id, r.id===me.userId);
    case 'me': return profilePage(me.userId,true);
    case 'video': if (bvidPattern.test(r.id)) return detailPage(r.id); break;
    case 'submit': return `<a class="crumb" href="#/">‹ 社区首页</a><div class="head"><h1>推荐视频</h1></div>${submitForm()}`;
  }
  return '<h1>页面未找到</h1><a href="#/">返回社区首页</a>';
}
function draw() {
  const editingLink = document.activeElement?.id === 'video-input';
  const cursor = editingLink ? document.activeElement.selectionStart : null;
  const r = route();
  const overlay = r.view === 'people' && bvidPattern.test(r.id);
  const contentRoute = overlay ? route(baseHash()) : r;
  main.innerHTML = page(contentRoute);
  if (loaded && loadError && contentRoute.view !== 'submit') main.insertAdjacentHTML('afterbegin', `<p class="error" role="status">${esc(loadError)} <button class="plain" data-action="refresh">重试</button></p>`);
  if (editingLink && !overlay) {
    const input = main.querySelector('#video-input');
    input?.focus({preventScroll:true});
    if (input && cursor !== null) input.setSelectionRange(cursor,cursor);
  }
  if (overlay) {
    const video = lookup(r.id);
    const recs = [...(video?.recommendations || [])].sort(byNewest);
    const heading = loaded ? `推荐这期的 ${recs.length} 个人` : '推荐人';
    people.innerHTML = `<div class="dialog-top"><h2 id="people-title">${heading}</h2><button class="close" data-action="close-people" aria-label="关闭推荐人列表">×</button></div>` +
      (!loaded ? statePanel() : recs.map(p=>`<a class="person" href="${pathFor('profile',p.userId)}">${avatar(p)}<div><p class="person-name">${esc(p.nickname)}</p>${p.reason?`<p class="reason">${esc(p.reason)}</p>`:''}</div><small>片单 ›</small></a>`).join('') || '<p class="form-body">还没有人推荐这期。</p>');
    if (!people.open) people.showModal();
    if (location.hash !== lastPeopleHash) people.scrollTop = 0;
    lastPeopleHash = location.hash;
  } else if (people.open) people.close();
}
async function refresh() {
  if (loading) { refreshAgain = true; return; }
  loading = true;
  try {
    const [feed, account] = await Promise.all([
      api('/feed'), token && !meReady ? api('/me',{authorized:true}) : Promise.resolve(null),
    ]);
    if (account) { me = account; meReady = true; }
    videos = feed.videos;
    loaded = true; loadError = '';
  } catch (error) { loadError = message(error); }
  finally {
    loading = false;
    draw();
    if (refreshAgain) { refreshAgain = false; void refresh(); }
  }
}
async function checkLink(value) {
  formText = value.trim();
  const sequence = ++previewSeq;
  checking = true; preview = null; previewError = '';
  draw();
  try {
    const found = await api('/preview?url=' + encodeURIComponent(formText));
    if (!bvidPattern.test(found.bvid)) throw new Error('没有找到可推荐的 B 站视频。');
    if (sequence === previewSeq) {
      preview = found;
      const known = videos.find(v => v.bvid === found.bvid);
      if (known?.metadataPending && !found.metadataPending) {
        Object.assign(known, {title:found.title, creator:found.creator, cover:found.cover, metadataPending:false});
      }
    }
  } catch (error) { if (sequence === previewSeq) previewError = message(error); }
  finally { if (sequence === previewSeq) { checking = false; draw(); } }
}
function changeRoute() {
  if (editor.open) { editor.close(); pendingEditor = null; }
  previewSeq++; checking = false; previewError = '';
  const r = route();
  if (r.view === 'submit' && bvidPattern.test(r.params.get('bvid') || '')) {
    const id = r.params.get('bvid');
    formText = id; preview = videos.find(v=>v.bvid===id) || null;
    if (!preview || preview.metadataPending) { void checkLink(id); return; }
  } else if (r.view !== 'people') { formText = ''; preview = null; }
  draw();
  if (r.view !== 'people') window.scrollTo(0,0);
}
function openEditor(mode, video, initial = '') {
  pendingEditor = {mode,video};
  const nickname = mode === 'nickname';
  const share = mode === 'share';
  const title = share?'复制链接':nickname?'你希望大家怎么称呼你？':'写两句';
  const field = share?`<label for="edit-value">分享链接</label><input id="edit-value" value="${esc(initial)}" readonly>` :
    nickname?`<label for="edit-value">公开昵称</label><input id="edit-value" required maxlength="24" autocomplete="nickname"><p class="help">昵称和推荐会公开。请用当前浏览器管理你的片单。</p>`:
    `<label for="edit-value">推荐理由（选填）</label><textarea id="edit-value" maxlength="300">${esc(initial)}</textarea>`;
  editor.innerHTML = `<div class="dialog-top"><h2 id="editor-title">${title}</h2><button class="close" data-action="close-editor" aria-label="关闭">×</button></div>
    <form class="form-body" id="editor-form">${field}<p class="error" id="editor-error" role="alert"></p>${share?'':`<div class="actions"><button type="submit" class="btn primary">${nickname?'使用昵称并推荐':'保存'}</button></div>`}</form>`;
  editor.showModal(); document.querySelector('#edit-value').focus();
  if (share) document.querySelector('#edit-value').select();
}
async function publish(video, nickname, reason) {
  const existing = mine(video);
  const body = {bvid:video.bvid, nickname};
  if (reason !== undefined) body.reason = reason;
  const result = await api('/recommend',{method:'PUT',authorized:true,body});
  me = {userId:result.userId,nickname}; meReady = true;
  const item = videos.find(v=>v.bvid===video.bvid) || {...video,recommendations:[]};
  item.recommendations = [{...me,reason:reason??existing?.reason??'',createdAt:existing?.createdAt||new Date().toISOString()},
    ...item.recommendations.filter(r=>r.userId!==me.userId)];
  if (!videos.includes(item)) videos.unshift(item);
  if (editor.open) editor.close();
  pendingEditor = null;
  if (!existing && (route().view==='submit' || preview?.bvid===video.bvid)) go(pathFor('video',video.bvid));
  toast(existing?'推荐理由已保存':'已推荐，可以稍后写两句');
}
async function perform(fn) {
  if (mutating) return;
  mutating = true;
  document.querySelectorAll('[data-action="recommend"],[data-action="reason"],#editor-form button[type=submit]').forEach(b=>b.disabled=true);
  try { await fn(); }
  catch (error) {
    if (editor.open) document.querySelector('#editor-error').textContent = message(error);
    else toast(message(error));
  } finally {
    mutating = false;
    const submit = editor.querySelector('[type=submit]');
    if (submit) submit.disabled = false;
    draw();
  }
}
async function toggle(video) {
  await identify();
  if (!me.nickname) { openEditor('nickname',video); return; }
  if (mine(video)) {
    await api('/recommend?bvid='+video.bvid,{method:'DELETE',authorized:true});
    video.recommendations = video.recommendations.filter(r=>r.userId!==me.userId);
    videos = videos.filter(v=>v.recommendations.length);
    toast('已撤回推荐');
  } else await publish(video,me.nickname);
  await refresh();
}
async function share(hash) {
  const link = new URL(location.href);
  link.search = ''; link.hash = hash;
  try { await navigator.clipboard.writeText(link.href); toast('链接已复制'); }
  catch { openEditor('share',null,link.href); }
}
document.addEventListener('error',event=>{
  if (event.target.matches?.('.cover img')) event.target.hidden = true;
},true);
document.addEventListener('click',event=>{
  if (event.target.closest('.skip')) { event.preventDefault(); main.focus(); return; }
  const anchor = event.target.closest('a[href^="#/"]');
  if (anchor && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault(); go(anchor.getAttribute('href')); return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const v = lookup(button.dataset.id);
  switch (button.dataset.action) {
    case 'recommend': if (v) void perform(()=>toggle(v)); break;
    case 'reason': if (v && mine(v)) openEditor('reason',v,mine(v).reason); break;
    case 'share': void share(button.dataset.hash); break;
    case 'refresh': void refresh(); break;
    case 'close-editor': if (!mutating) editor.close(); break;
    case 'close-people': closePeople(); break;
  }
});
document.addEventListener('submit',event=>{
  if (event.target.id === 'preview-form') {
    event.preventDefault();
    void checkLink(document.querySelector('#video-input').value); return;
  }
  if (event.target.id !== 'editor-form') return;
  event.preventDefault();
  if (!pendingEditor || pendingEditor.mode==='share') return;
  const {mode,video} = pendingEditor;
  const value = document.querySelector('#edit-value').value.trim();
  if (mode==='nickname' && !value) { document.querySelector('#editor-error').textContent = '请输入昵称。'; return; }
  void perform(async()=>{
    await publish(video,mode==='nickname'?value:me.nickname,mode==='reason'?value:undefined);
    await refresh();
  });
});
document.addEventListener('input',event=>{
  if (event.target.id !== 'video-input') return;
  formText = event.target.value; previewSeq++; preview = null; checking = false; previewError = '';
  main.querySelector('.preview')?.remove();
  const form = event.target.form;
  form.querySelector('.error').textContent='';
  const action = form.querySelector('button[type=submit]');
  action.disabled = false; action.textContent = '查看视频';
});
people.addEventListener('cancel',event=>{event.preventDefault();closePeople();});
editor.addEventListener('cancel',event=>{if(mutating) event.preventDefault();});
people.addEventListener('click',event=>{if(event.target===people) closePeople();});
editor.addEventListener('close',()=>{pendingEditor=null;});
window.addEventListener('popstate',changeRoute);
window.addEventListener('online',()=>void refresh());
window.addEventListener('storage',event=>{
  if (event.key===identityKey || event.key===null) {
    token=readToken(); me={userId:'',nickname:''}; meReady=false; void refresh();
  }
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden && !editor.open && !mutating) void refresh();});
token = readToken();
const inputId = new URLSearchParams(location.search).get('bvid');
if (!location.hash && bvidPattern.test(inputId || '')) history.replaceState(null,'',location.pathname+'#/submit?bvid='+inputId);
changeRoute();
void refresh();

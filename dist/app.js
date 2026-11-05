import { CATEGORIES, TOPICS, KINDS, LIBRARY_KEY, emptyLibrary, normalizeLibrary, mergeLibraries, filterVideos, duration, videoUrl, escapeHtml as esc } from './core.js';

const $ = selector => document.querySelector(selector);
const icons = {
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>', list:'<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10 8 5 3-5 3zM7 21h10"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15c3 0 3 3 3 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', heart:'<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 3 11 8 15 5-4 13-10 8-15Z"/>',
  history:'<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l4 2"/>', check:'<path d="m5 12 4 4L19 6"/>',
  ai:'<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  code:'<path d="m7 7-5 5 5 5M17 7l5 5-5 5M14 4l-4 16"/>', world:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  english:'<path d="M3 5h10M8 3v2c0 6-2 9-5 11M4 9c2 3 5 5 8 6M13 21l4-12 4 12M14 18h6"/>',
  health:'<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 3 11 8 15 5-4 13-10 8-15Z"/><path d="M8 11h8M12 8v6"/>',
  sports:'<path d="M3 8v8M6 5v14M6 12h12M18 5v14M21 8v8"/>', book:'<path d="M12 5c-3-2-7-2-10 0v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0Zm0 0v15"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3Z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.5"/>', moon:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
  github:'<path d="M9 21v-4c-4 1-4-2-6-3M15 21v-4c0-1 0-2-1-2 4-.4 6-2 6-5 0-2-1-3-2-4 0-1 0-3-1-3-2 0-3 1-3 1h-4S8 3 6 3c-1 0-1 2-1 3-1 1-2 2-2 4 0 3 2 5 6 5-1 0-1 1-1 2"/>',
  play:'<path d="m8 4 13 8-13 8z"/>', external:'<path d="M14 3h7v7M21 3l-10 10M10 4H4v16h16v-6"/>', close:'<path d="m5 5 14 14M19 5 5 19"/>', filter:'<path d="M3 6h18M6 12h12M10 18h4"/>', download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>', upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 17v4h16v-4"/>',
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[name] || icons.list}</svg>`;
let catalog, videos = [], allVideos = [], library = emptyLibrary(), storageAvailable = true, currentRoute, activePlayer = null, toastTimer;
const libraryTitles = { favorites:'我的收藏', later:'稍后看', history:'最近打开', completed:'已看完' };

function getRoute() {
  const raw = location.hash.slice(1) || '/';
  const [path, query] = raw.split('?');
  const segments = path.replace(/^\//, '').split('/');
  return { view: segments[0] || 'home', id: segments[1] || '', params: new URLSearchParams(query || '') };
}
function href(view = '', id = '', params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([,v]) => v !== '' && v != null));
  return `#/${view}${id ? '/' + encodeURIComponent(id) : ''}${query.size ? '?' + query.toString() : ''}`;
}
function navigate(url, replace = false) {
  if (location.hash === url) { render(); return; }
  if (replace) { history.replaceState(null, '', url); render(); }
  else location.hash = url;
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3000);
}
function save() {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); storageAvailable = true; }
  catch { storageAvailable = false; toast('浏览器未允许保存，本次操作只在当前页面保留'); }
}
function readLibrary() {
  try { const raw = localStorage.getItem(LIBRARY_KEY); if (raw) library = normalizeLibrary(JSON.parse(raw), allVideos); }
  catch { storageAvailable = false; }
}
function recordOpen(v, page) {
  library.history = [{ id:v.id, at:new Date().toISOString() }, ...library.history.filter(x => x.id !== v.id)].slice(0,200);
  library.parts[v.id] = page; save(); renderSidebar();
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme-button').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  $('#theme-button').setAttribute('aria-label', theme === 'dark' ? '切换浅色模式' : '切换深色模式');
  try { localStorage.setItem('reabili-theme', theme); } catch {}
}
function routeParams(changes = {}) { return { ...Object.fromEntries(currentRoute.params), ...changes }; }
function categoryLink(key, topic = '') { return href('browse','',{ category:key, topic }); }
function navItem(label, symbol, url, active, count) {
  return `<a class="nav-item ${active?'active':''}" href="${esc(url)}" ${active?'aria-current="page"':''}>${icon(symbol)}<span>${esc(label)}</span>${count!=null?`<span class="count">${count}</span>`:''}</a>`;
}
function renderSidebar() {
  const r = currentRoute || getRoute(), cat = r.params.get('category');
  $('#sidebar').innerHTML = `<nav>
    <div class="nav-section">${navItem('首页','home','#/',r.view==='home')}${navItem('学习片单','list','#/collections',['collections','collection'].includes(r.view))}${navItem('UP 主','users','#/creators',['creators','creator'].includes(r.view))}</div>
    <div class="nav-section"><p class="nav-title">学习方向</p>${Object.entries(CATEGORIES).map(([key,label])=>navItem(label,key,categoryLink(key),r.view==='browse'&&cat===key)).join('')}</div>
    <div class="nav-section"><p class="nav-title">我的片单</p>${[['later','clock'],['favorites','heart'],['history','history'],['completed','check']].map(([key,symbol])=>navItem(libraryTitles[key],symbol,href(key),r.view===key,library[key].length||'')).join('')}</div>
    <div class="nav-section">${navItem('延伸阅读','book','#/readings',r.view==='readings')}<button class="nav-item" data-action="settings">${icon('settings')}<span>片单备份</span></button>${navItem('关于 ReaBili','info','#/about',r.view==='about')}</div>
  </nav><div class="nav-footer">给大学生的学习片单<br>公开浏览 · 无需登录<br><a href="https://github.com/theAtlantic-zza/Reabilibili" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div>`;
}
function toggleLabel(key, selected) {
  return key==='later' ? selected?'已加入稍后看':'稍后看' : key==='favorites' ? selected?'已收藏':'收藏' : selected?'已看完':'标为已看';
}
function toggleButton(v, key, compact = false) {
  const selected = library[key].includes(v.id), symbol = key==='favorites'?'heart':key==='later'?'clock':'check';
  return `<button class="${compact?'quick-save':'button'} ${selected?'selected':''}" data-action="toggle" data-key="${key}" data-id="${v.id}" aria-pressed="${selected}" aria-label="${toggleLabel(key,selected)}：${esc(v.title)}" title="${toggleLabel(key,selected)}">${icon(selected&&key==='later'?'check':symbol)}${compact?'':`<span>${toggleLabel(key,selected)}</span>`}</button>`;
}
function thumbnail(v, url, options = {}) {
  return `<a href="${esc(url)}" class="thumbnail" tabindex="${options.tabindex??'-1'}" aria-label="${esc(v.title)}"><img src="${esc(v.cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="duration">${v.pages.length>1?'总计 ':''}${duration(v.duration)}</span>${v.pages.length>1?`<span class="part-count">${v.pages.length} 集</span>`:''}</a>`;
}
function videoCard(v) {
  return `<article class="video-card">${thumbnail(v,href('video',v.id))}${toggleButton(v,'later',true)}<h2 class="video-title"><a href="${href('video',v.id)}">${esc(v.title)}</a></h2><div class="card-meta"><a href="${v.unlisted ? esc(v.creatorUrl) : href('creator', v.creatorMid)}"><span class="up">UP</span>${esc(v.creator)}</a></div><div class="card-foot"><span>${esc(TOPICS[v.topic]||CATEGORIES[v.category])}</span><span class="dot"></span><span>${esc(KINDS[v.kind]||'精选')}</span>${library.completed.includes(v.id)?'<span class="watched">✓ 已看</span>':''}</div></article>`;
}
function emptyState(title, text, reset = false) {
  return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p>${reset?'<button class="button" data-action="reset-filters">清除筛选</button>':'<a class="button" href="#/">去首页看看</a>'}</div>`;
}
function footer() {
  return `<footer class="browse-footer"><span>编辑精选 · ${videos.length} 条内容 · 保留原始出处</span><a href="#/about">了解收录方式 ↗</a></footer>`;
}
function chips() {
  const p = currentRoute.params, cat=p.get('category')||'';
  const link = key => href(currentRoute.view==='search'?'search':'browse','',{q:p.get('q'),category:key});
  return `<nav class="chipbar" aria-label="内容分类"><a class="chip ${!cat?'active':''}" href="${esc(link(''))}">全部</a>${Object.entries(CATEGORIES).map(([key,label])=>`<a class="chip ${cat===key?'active':''}" href="${esc(link(key))}" ${cat===key?'aria-current="true"':''}>${label}</a>`).join('')}</nav>${cat==='world'?`<nav class="subtopics" aria-label="世界通识分类"><a class="${!p.get('topic')?'active':''}" href="${esc(href(currentRoute.view,'',routeParams({topic:''})))}">全部通识</a>${Object.entries(TOPICS).map(([key,label])=>`<a class="${p.get('topic')===key?'active':''}" href="${esc(href(currentRoute.view,'',routeParams({topic:key})))}">${label}</a>`).join('')}</nav>`:''}`;
}
function select(name, label, choices) {
  const value = currentRoute.params.get(name)||'';
  return `<label class="filter-label">${name==='kind'?icon('filter'):''}<select name="${name}" aria-label="${label}">${Object.entries(choices).map(([key,text])=>`<option value="${key}" ${key===value?'selected':''}>${text}</option>`).join('')}</select></label>`;
}
function toolbar(title, count, withFilters = true) {
  return `<div class="toolbar"><h1>${esc(title)}<span class="count">${count} 条内容</span></h1><div class="filters">${withFilters?select('kind','按内容形式筛选',{'':'全部形式',...KINDS})+select('time','按视频总时长筛选',{'':'全部时长',short:'10 分钟以内',medium:'10–60 分钟',long:'60 分钟以上'}):''}${select('sort','排序',{'':currentRoute.view==='history'?'最近打开':'精选顺序',newest:'最新发布',short:'时长从短到长',long:'时长从长到短'})}</div></div>`;
}
function renderBrowse() {
  const p = currentRoute.params;
  const filters = Object.fromEntries(p);
  const result = filterVideos(videos,filters);
  const title = currentRoute.view==='search' ? `“${p.get('q')||''}”的搜索结果` : TOPICS[p.get('topic')]||CATEGORIES[p.get('category')]||'推荐浏览';
  $('#content').innerHTML = chips()+toolbar(title,result.length)+`<div class="video-grid">${result.map(videoCard).join('')}</div>`+(result.length?'':emptyState('没有找到符合条件的视频','试试更短的关键词，或放宽形式与时长筛选。',true))+footer();
}
function renderLibrary() {
  const key=currentRoute.view;
  const ids=key==='history'?library.history.map(x=>x.id):library[key];
  const list=ids.map(id=>allVideos.find(v=>v.id===id)).filter(Boolean);
  const result=filterVideos(list,Object.fromEntries(currentRoute.params));
  const notes={favorites:'把值得反复看的内容留在这里。',later:'先存下来，等有一段完整的时间。',history:'记录你打开播放器或原站的内容，不代表已看完。',completed:'由你手动标记。课程的“已看完”表示整个合集。'};
  $('#content').innerHTML=`<div class="page-head"><div><h1>${libraryTitles[key]}</h1><p>${notes[key]}</p></div><button class="button" data-action="settings">${icon('download')}备份片单</button></div>`+toolbar('全部内容',result.length)+`<div class="video-grid">${result.map(videoCard).join('')}</div>`+(result.length?'':emptyState(ids.length?'当前筛选没有结果':'这里还没有内容',ids.length?'调整筛选后再试一次。':'在视频卡片或详情里，把内容加入你的片单。',!!ids.length))+footer();
}
function collectionCover(collection) {
  const v=videos.find(v=>v.id===collection.videos[0]);
  return `<div class="collection-cover"><img src="${esc(v.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer"><div class="collection-band"><span>${collection.videos.length}</span>${icon('list')}</div></div>`;
}
function renderCollections() {
  $('#content').innerHTML=`<div class="page-head"><div><h1>学习片单</h1><p>从一个问题开始，按自己的节奏往下看。</p></div><span class="muted">${catalog.collections.length} 个片单</span></div><div class="collection-grid">${catalog.collections.map(c=>`<article class="collection-card"><a href="${href('collection',c.id)}">${collectionCover(c)}<h2>${esc(c.title)}</h2></a><p>${esc(c.description)}</p></article>`).join('')}</div>`+footer();
}
function renderCollection() {
  const c=catalog.collections.find(c=>c.id===currentRoute.id);
  if(!c){renderNotFound();return;}
  const list=c.videos.map(id=>videos.find(v=>v.id===id)).filter(Boolean);
  $('#content').innerHTML=`<div class="breadcrumbs"><a href="#/collections">学习片单</a><span>/</span><span>${CATEGORIES[c.category]}</span></div><div class="collection-detail">${collectionCover(c)}<div><div class="eyebrow">${list.length} 条内容 · 建议按顺序浏览</div><h1>${esc(c.title)}</h1><p>${esc(c.description)}</p><a class="button primary" href="${href('video',list[0].id)}">${icon('play')}从第一条开始</a></div></div><ol class="ordered-videos">${list.map((v,i)=>`<li><span class="order-number">${String(i+1).padStart(2,'0')}</span>${thumbnail(v,href('video',v.id))}<div class="ordered-info"><h2><a href="${href('video',v.id)}">${esc(v.title)}</a></h2><p>${esc(v.summary)}</p><div class="card-meta"><a href="${v.unlisted ? esc(v.creatorUrl) : href('creator', v.creatorMid)}">${esc(v.creator)}</a> · ${KINDS[v.kind]}${v.pages.length>1?` · ${v.pages.length} 集`:''}</div></div><button class="icon-button" data-action="toggle" data-key="later" data-id="${v.id}" aria-label="${toggleLabel('later',library.later.includes(v.id))}：${esc(v.title)}" aria-pressed="${library.later.includes(v.id)}">${icon(library.later.includes(v.id)?'check':'clock')}</button></li>`).join('')}</ol>`+footer();
}
function creatorList() {
  const map=new Map();
  for(const v of videos){if(!map.has(v.creatorMid))map.set(v.creatorMid,{mid:v.creatorMid,name:v.creator,avatar:v.creatorAvatar,url:v.creatorUrl,videos:[]});map.get(v.creatorMid).videos.push(v);}
  return [...map.values()].sort((a,b)=>b.videos.length-a.videos.length);
}
function avatar(c) { return c.avatar?`<img class="avatar" src="${esc(c.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<span class="avatar" aria-hidden="true"></span>`; }
function renderCreators() {
  const creators=creatorList();
  $('#content').innerHTML=`<div class="page-head"><div><h1>UP 主</h1><p>从喜欢的讲述者出发。这里展示已收录的视频，不等于作者的全部作品。</p></div><span class="muted">${creators.length} 位</span></div><div class="creator-grid">${creators.map(c=>`<article class="creator-tile"><a href="${href('creator',c.mid)}" tabindex="-1">${avatar(c)}</a><div><h2><a href="${href('creator',c.mid)}">${esc(c.name)}</a></h2><p>${[...new Set(c.videos.map(v=>CATEGORIES[v.category]))].join(' · ')}</p><small><a href="${href('creator',c.mid)}">已收录 ${c.videos.length} 条</a></small></div></article>`).join('')}</div>`+footer();
}
function renderCreator() {
  const c=creatorList().find(c=>String(c.mid)===currentRoute.id);
  if(!c){renderNotFound();return;}
  const result=filterVideos(c.videos,Object.fromEntries(currentRoute.params));
  $('#content').innerHTML=`<div class="page-head"><div class="creator-head">${avatar(c)}<div><h1>${esc(c.name)}</h1><p>ReaBili 已收录 ${c.videos.length} 条内容</p></div></div><a class="button" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">B 站主页 ${icon('external')}</a></div>`+toolbar('收录视频',result.length)+`<div class="video-grid">${result.map(videoCard).join('')}</div>`+(result.length?'':emptyState('没有符合筛选的视频','放宽时长或内容形式再试试。',true))+footer();
}
function selectedPage(v) {
  const requested=Number(currentRoute.params.get('p'))||library.parts[v.id]||1;
  return v.pages.find(p=>p.page===requested)||v.pages[0];
}
function renderVideo() {
  const v=allVideos.find(v=>v.id===currentRoute.id);
  if(!v){renderNotFound();return;}
  const part=selectedPage(v), multi=v.pages.length>1;
  if (currentRoute.params.has('p') && library.parts[v.id] !== part.page) { library.parts[v.id] = part.page; save(); }
  const related=videos.filter(x=>x.id!==v.id&&x.category===v.category).slice(0,3);
  document.title=`${v.title} · ReaBili`;
  const sourceNote=v.sourceProvenance?`${esc(v.sourceProvenance)}。`:'';
  const chapters=multi?`<aside class="chapters"><div class="chapters-head"><h2>分集目录 <span class="muted">${v.pages.length} 集</span></h2><p>当前第 ${part.page} 集 · 本集 ${duration(part.duration)} · 合集 ${duration(v.duration)}</p></div><ol class="chapter-list">${v.pages.map(p=>`<li><a class="chapter ${p.page===part.page?'active':''}" href="${href('video',v.id,{p:p.page})}" ${p.page===part.page?'aria-current="true"':''}><span class="number">${String(p.page).padStart(2,'0')}</span><span>${esc(p.title)}</span><time>${duration(p.duration)}</time></a></li>`).join('')}</ol></aside>`:`<aside class="related-side"><h2>接着看看</h2><div class="video-grid">${related.map(videoCard).join('')}</div></aside>`;
  $('#content').innerHTML=`<div class="breadcrumbs"><a href="#/">首页</a><span>/</span><a href="${categoryLink(v.category,v.topic||'')}">${TOPICS[v.topic]||CATEGORIES[v.category]}</a><span>/</span><span>${KINDS[v.kind]}</span></div><div class="watch-layout"><section class="watch-primary"><div id="player" class="player"><img src="${esc(v.cover)}" alt="" referrerpolicy="no-referrer"><div class="player-cover"><button class="play-button" data-action="play" data-id="${v.id}">${icon('play')}加载${multi?'第 '+part.page+' 集':''}播放器</button><small>${multi?esc(part.title):esc(v.creator)} · ${duration(part.duration)}</small></div></div><div class="player-links"><span>${multi?"第 "+part.page+" 集 · ":""}${duration(part.duration)} · 播放器无画面时，可直接打开原站</span><a class="button" href="${videoUrl(v,part.page)}" target="_blank" rel="noopener noreferrer" data-action="open" data-id="${v.id}">在 B 站打开${multi?'本集':''} ↗</a></div><h1 class="watch-title">${esc(v.title)}</h1><div class="creator-strip"><a class="creator-identity" href="${v.unlisted ? esc(v.creatorUrl) : href('creator', v.creatorMid)}">${avatar({avatar:v.creatorAvatar})}<span>${esc(v.creator)}<small>${v.publishedAt} 发布${multi?' · '+v.pages.length+' 集':''}</small></span></a><div class="action-row">${toggleButton(v,'favorites')}${toggleButton(v,'later')}${toggleButton(v,'completed')}</div></div><section class="description">${v.unlisted ? '<p class="muted">这条内容已从公开推荐中收起。你仍可从自己的片单访问。</p>' : ''}<h2>为什么收录</h2><p>${esc(v.summary)}</p><p class="muted">${esc(v.audience||v.reason)}</p>${v.note?`<p class="muted">${esc(v.note)}</p>`:''}<div class="tags">${v.tags.map(tag=>`<a href="${href('search','',{q:tag})}"># ${esc(tag)}</a>`).join('')}</div><details><summary>出处与收录说明</summary><p>${sourceNote}${esc(v.sourceType||'编辑精选')}。标题、作者、分集和时长来自 B 站公开元数据；最近核验于 ${(v.verifiedAt||'').slice(0,10)}${v.metadataStale?'（最近刷新未成功，当前使用缓存）':''}。导读根据标题、目录和发布者简介整理，未逐帧审核内容。</p><p>${v.evidence.qualified?`已核验 ${v.evidence.accounts} 个同平台账号、跨 ${v.evidence.months} 个月的正向推荐。`:'本条为编辑精选，尚无满足本站门槛的社区推荐记录。'}</p>${v.evidence.records.map(e=>`<p><a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(e.platform)} · ${esc(e.publishedAt)}</a> ${esc(e.summary)}</p>`).join('')}<p><a href="${esc(v.creatorUrl)}" target="_blank" rel="noopener noreferrer">作者 B 站主页 ↗</a>${v.originalSource?` · <a href="${esc(v.originalSource)}" target="_blank" rel="noopener noreferrer">原作入口 ↗</a>`:''}</p></details></section></section>${chapters}</div>${multi?`<section class="related"><h2>接着看看</h2><div class="video-grid">${related.map(videoCard).join('')}</div></section>`:''}`;
  if(activePlayer===v.id) loadPlayer(v,false);
  const chapter=$('.chapter.active');if(chapter){const container=$('.chapter-list');container.scrollTop=Math.max(0,chapter.offsetTop-container.offsetTop-80);}
}
function loadPlayer(v, record = true) {
  const part=selectedPage(v);activePlayer=v.id;
  const iframe=document.createElement('iframe');
  iframe.title=`${v.title} · 第 ${part.page} 集`;
  iframe.src=videoUrl(v,part.page,true);iframe.allow='fullscreen; picture-in-picture';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';
  $('#player').replaceChildren(iframe);
  if(record)recordOpen(v,part.page);
}
function renderReadings() {
  $('#content').innerHTML=`<div class="page-head"><div><h1>延伸阅读</h1><p>把视频里产生的问题，带到更完整的资料中。</p></div></div><div class="readings">${catalog.readings.map(r=>`<article class="reading"><span class="reading-label">${esc(r.label)}</span><div><h2><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a></h2><p>${esc(r.description)}</p><small>${esc(r.source)}</small></div></article>`).join('')}<div class="prose"><p>这里借鉴 HowToLiveBetter 的主题组织方式，保留原始链接。介绍为本站整理，未转载正文；原项目的证据评级不自动适用于本站视频。</p></div></div>`+footer();
}
function renderAbout() {
  $('#content').innerHTML=`<div class="page-head"><div><h1>关于 ReaBili</h1><p>一个面向大学生的 B 站学习入口。</p></div></div><article class="prose"><p>从你愿意完整看完的视频开始。ReaBili 把 AI、编程、世界通识、英语、健康与运动放在一个可搜索的片单里。数理基础、财经和人文归在“世界通识”中，也可以分别筛选。</p><h2>片单从哪里来</h2><p>目前收录 ${videos.length} 条内容，来自 ${creatorList().length} 位 UP 主。片单里有直接点名的作品，也有从提名的作者中挑选的单集和编辑补充的课程。每条作品的「出处与收录说明」标明选题来源。</p><p>每条视频均核验 B 站标题、作者、链接与分集信息。编辑导读根据标题、目录和发布者简介整理，不等于逐字稿摘要或对全部观点的认可。健康内容分清科普、训练经验与职业运动纪录；财经内容以理解概念和机制为主。</p><h2>“反复推荐”需要真实依据</h2><p>只有同一平台至少 3 个可区分账号、跨至少 3 个不同年月的正向推荐，经来源审核后，才会标记为“社区验证”。目前这份片单均为编辑精选，不显示未经核验的推荐人数或跨月记录。</p><h2>你自己的片单</h2><p>收藏、稍后看、最近打开、已看标记与上次选择的分集，均保存在当前浏览器。无需注册，也没有跨设备同步。更换设备或清理浏览器前，可在“片单备份”中导出 JSON，再在新浏览器导入。</p><p>“最近打开”记录打开播放器或原站的动作；“已看完”由你手动标记，系列课程按整个合集计算。本站不获取 B 站观看进度。</p><h2>参考与出处</h2><ul><li>发现思路：<a href="https://hackertube.org/" target="_blank" rel="noopener noreferrer">HackerTube</a>；浏览与片单交互参考：<a href="https://anlibili-site-bxlxh4ai.teamily.run/" target="_blank" rel="noopener noreferrer">AnliBili</a>。</li><li>使用 <a href="https://github.com/morluto/rea" target="_blank" rel="noopener noreferrer">REA</a> 分析参考站的公开结构与交互，本站页面独立实现。</li><li>生活主题参考 <a href="https://github.com/eternity4719/HowToLiveBetter" target="_blank" rel="noopener noreferrer">HowToLiveBetter</a>，正文许可为 CC BY 4.0。本站提供原始链接与原创介绍，未转载正文。</li><li>视频、封面与作者信息来自 B 站，版权归各自权利人。本站仅索引与嵌入，不搬运视频。</li></ul><h2>公开维护</h2><p>站点使用 GitHub Pages 静态托管。<a href="https://github.com/theAtlantic-zza/Reabilibili" target="_blank" rel="noopener noreferrer">源码与片单公开在 GitHub ↗</a>。更新通过维护选题与核验元数据完成；首版尚未运行自动抓取或无人值守推荐。</p><p>片单更新：${catalog.updatedAt.slice(0,10)}。外部视频的播放、账号要求和清晰度由 B 站决定，详情页始终提供原站入口。</p></article>`;
}
function renderNotFound() { $('#content').innerHTML=emptyState('这个页面还没有内容','可能是链接已变更，回到首页重新找找。'); }
function closeNav() {
  document.body.classList.remove('nav-open');$('#scrim').hidden=true;$('#menu-button').setAttribute('aria-expanded','false');
}
function render(options = {}) {
  const previous=currentRoute;currentRoute=getRoute();
  if(['discover','collections','favorites','later','history'].includes(location.hash.slice(1))) {navigate(location.hash==='#discover'?'#/':`#/${location.hash.slice(1)}`,true);return;}
  if(currentRoute.view!=='video'||currentRoute.id!==previous?.id)activePlayer=null;
  if(!options.keepScroll)window.scrollTo(0,0);
  if(!options.keepFocus)closeNav();
  renderSidebar();document.title='ReaBili · 大学生的学习片单';
  if(document.activeElement!==$('#search-input'))$('#search-input').value=currentRoute.view==='search'?currentRoute.params.get('q')||'':'';
  const renders={home:renderBrowse,browse:renderBrowse,search:renderBrowse,collections:renderCollections,collection:renderCollection,creators:renderCreators,creator:renderCreator,video:renderVideo,readings:renderReadings,about:renderAbout};
  if(libraryTitles[currentRoute.view])renderLibrary();else(renders[currentRoute.view]||renderNotFound)();
}
function openSettings() {
  $('#settings-dialog').innerHTML=`<div class="dialog-head"><h2 id="settings-title">片单备份</h2><button class="icon-button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></div><p>个人片单只保存在当前浏览器。导出一份备份，可带到另一台设备继续使用。</p><p class="stats">${library.favorites.length} 条收藏 · ${library.later.length} 条稍后看 · ${library.completed.length} 条已看</p>${!storageAvailable?'<p>当前浏览器没有允许持久保存，建议及时导出。</p>':''}<div class="action-row"><button class="button primary" data-action="export">${icon('download')}导出片单</button><button class="button" data-action="import">${icon('upload')}导入片单</button></div><p><small>导入会合并现有记录，只保留本站收录的视频；不会覆盖已有收藏。最多 1 MB。</small></p>`;
  $('#settings-dialog').showModal();
}
function exportLibrary() {
  const blob=new Blob([JSON.stringify(library,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`ReaBili-片单-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('片单已导出');
}

$('#menu-button').innerHTML=icon('menu');$('#search-button').innerHTML=icon('search');$('#github-link').innerHTML=icon('github');
let theme='light';try{theme=localStorage.getItem('reabili-theme')||'light';}catch{}setTheme(theme==='dark'?'dark':'light');
$('#theme-button').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
$('#menu-button').addEventListener('click',()=>{
  if(matchMedia('(max-width:980px)').matches){const open=document.body.classList.toggle('nav-open');$('#scrim').hidden=!open;$('#menu-button').setAttribute('aria-expanded',String(open));}
  else{const collapsed=document.body.classList.toggle('collapsed');$('#menu-button').setAttribute('aria-expanded',String(!collapsed));}
});
$('#scrim').addEventListener('click',closeNav);
$('#search-form').addEventListener('submit',event=>{event.preventDefault();const q=$('#search-input').value.trim();navigate(q?href('search','',{q}):'#/');$('#search-input').blur();});
$('#search-input').addEventListener('search',()=>{if(!$('#search-input').value&&currentRoute?.view==='search')navigate('#/');});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeNav();if(event.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)&&!$('#settings-dialog').open){event.preventDefault();$('#search-input').focus();}});
document.addEventListener('change',event=>{if(event.target.matches('.filters select'))navigate(href(currentRoute.view,currentRoute.id,routeParams({[event.target.name]:event.target.value})));});
document.addEventListener('error',event=>{if(event.target.matches?.('.thumbnail img'))event.target.closest('.thumbnail').classList.add('image-missing');},{capture:true});
document.addEventListener('click',event=>{
  if (event.target.closest('.skip-link')) { event.preventDefault(); $('#content').focus(); return; }
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action, v=allVideos.find(v=>v.id===button.dataset.id);
  if(action==='settings'){openSettings();return;}
  if(action==='close-dialog'){$('#settings-dialog').close();return;}
  if(action==='export'){exportLibrary();return;}
  if(action==='import'){$('#import-file').click();return;}
  if(action==='reset-filters'){
    navigate(href(['favorites','later','history','completed','creator'].includes(currentRoute.view)?currentRoute.view:'browse',currentRoute.view==='creator'?currentRoute.id:''));return;
  }
  if(!v)return;
  if(action==='play'){loadPlayer(v);return;}
  if(action==='open'){recordOpen(v,selectedPage(v).page);return;}
  if(action==='toggle'){
    const key=button.dataset.key;if(!['favorites','later','completed'].includes(key))return;
    const selected=library[key].includes(v.id);library[key]=selected?library[key].filter(id=>id!==v.id):[...library[key],v.id];save();
    const message=selected?`已从${key==='completed'?'已看记录':libraryTitles[key]}移除`:`${key==='completed'?'已标记为看完':key==='later'?'已加入稍后看':'已收藏'}`;
    // Update buttons in-place so saving a video never reloads its player.
    document.querySelectorAll(`[data-action="toggle"][data-id="${v.id}"][data-key="${key}"]`).forEach(el=>{
      el.classList.toggle('selected',!selected);el.setAttribute('aria-pressed',String(!selected));el.setAttribute('aria-label',`${toggleLabel(key,!selected)}：${v.title}`);el.title=toggleLabel(key,!selected);
      const symbol=key==='favorites'?'heart':key==='later'?(!selected?'check':'clock'):'check';el.innerHTML=icon(symbol)+(el.classList.contains('button')?`<span>${toggleLabel(key,!selected)}</span>`:'');
    });
    renderSidebar();if(currentRoute.view===key)render({keepScroll:true,keepFocus:true});toast(message);
  }
});
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>1024*1024)throw new Error('文件超过 1 MB');library=mergeLibraries(library,JSON.parse(await file.text()),allVideos);save();$('#settings-dialog').close();render({keepScroll:true});toast('片单已合并');}
  catch(error){toast(`导入失败：${error.message}`);}finally{event.target.value='';}
});
window.addEventListener('hashchange',()=>render());
window.addEventListener('storage',event=>{if(event.key===LIBRARY_KEY){readLibrary();render({keepScroll:true});}});
async function init(){
  try{
    const response=await fetch('./catalog.json');if(!response.ok)throw new Error('片单暂时无法读取');catalog=await response.json();videos=catalog.videos;
    allVideos = [...videos, ...(catalog.unlistedVideos || [])];
    readLibrary();render();
  }catch(error){$('#content').innerHTML=`<div class="empty"><h1>片单加载失败</h1><p>${esc(error.message)}。请刷新重试。</p><a class="button" href="https://github.com/theAtlantic-zza/Reabilibili">查看 GitHub 仓库</a></div>`;}
}
init();

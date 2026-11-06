# ReaBili

分享 B 站视频的小型社区。朋友用昵称公开推荐，原片单和私人收藏另有入口。

- 站点：[ReaBili](https://theatlantic-zza.github.io/Reabilibili/)
- 源码：[theAtlantic-zza/Reabilibili](https://github.com/theAtlantic-zza/Reabilibili)
- 当前公开片单：34 条内容、8 个学习片单。课程和纪录片系列各占一个条目，分集单独展示。英语目前收录薛麦Max，编程收录鱼C-小甲鱼、CrashCourse 字幕组和黑马程序员。

## 朋友试用版

- [社区首页](https://theatlantic-zza.github.io/Reabilibili/community.html) 支持粘贴 B 站链接、预览、用昵称推荐、补写理由和撤回。点推荐人数可选一位推荐者，查看对方的公开片单。朋友可以直接把试用感受发给邀请人。
- 初次使用会在本浏览器生成随机身份凭据。公开信息包括昵称、视频、推荐时间和自愿填写的理由。清除站点数据或换设备会失去原身份的编辑能力。本版没有跨设备账号、关注或评论。昵称可重名，人数按不同浏览器身份统计。
- 「首页」最多 10 部。「近 7 天多人推荐」5 席、「首次在社区出现不满 48 小时」3 席、「较早出现且推荐者少」2 席，候选不足时互补。同一视频只占一席，同一 UP 主通常不超过两席。计数不看推荐理由长度。同分候选每 6 小时轮换；首版用推荐者人数近似冷门程度，没有收集曝光量。
- 「最新」可看本次试用库的全部推荐。站主维护的[原片单](https://theatlantic-zza.github.io/Reabilibili/index.html#/browse)可作分享入口。私人收藏、历史和观看进度仍只保存在浏览器。
- 界面在 `dist/community.html`、`dist/community.js` 和 `dist/community.css`，排序在 `dist/community-rank.js`。GitHub Pages 提供页面，站主的 Cloudflare Worker 接收推荐并写入 D1。生产接口由 `dist/community-config.js` 中的 `PRODUCTION_API` 指定，发布时的双身份读写检查也使用这个地址。后端按浏览器身份鉴权，数据库按身份和 BVID 去重。

### 在本机试用社区

从仓库根目录运行（Node.js 22 或更新版本）：

```sh
npx wrangler@4 d1 migrations apply reabili-community --local --config community-api/wrangler.jsonc
npx wrangler@4 dev --local --port 8876 --config community-api/wrangler.jsonc
```

打开 `http://127.0.0.1:8876/community.html`。普通窗口和无痕窗口可模拟两位朋友；本地数据与线上分开。独立部署时创建自己的 D1，替换示例数据库 ID、应用 migrations，再发布 Worker。前端与 API 同源时默认访问当前站点的 `/api`。

## 原片单内容与交互

七个入口：**AI、编程、世界通识、英语、健康、运动、看世界**。「看世界」可单独收录作者主页。世界通识可继续筛选数理基础、财经、人文与社会。

首页直接展示视频网格，支持关键词搜索、形式和总时长筛选、排序。学习片单提供建议顺序；UP 主页面可浏览本站已收录的作品。课程详情有完整分集目录，例如 3Blue1Brown 的线性代数共 16 集。

收藏、稍后看、最近打开、已看标记和上次选择的分集保存在浏览器 `localStorage`。可导出 JSON 备份并合并导入，兼容首版片单。最近打开记录打开播放器或原站的动作，不代表看完；已看标记由用户手动设置，课程按整个合集计算。原片单的私人收藏没有云同步。

## 本地使用与目录

原片单是原生 HTML / CSS / JavaScript 静态页面，可以单独启动。

```sh
python3 -m http.server 8876 --bind 127.0.0.1 --directory dist
```

打开 `http://127.0.0.1:8876/`。通过 HTTP 使用主站；不要直接双击 `dist/index.html`。

- `dist/`：唯一的公开站点目录，入口为 `index.html`；`app.js` 管理页面与交互，`core.js` 维护筛选、片单校验和分集链接，`style.css` 提供响应式布局。
- `data/seeds.json`：选题、分类、标签、原创导读和来源性质。
- `data/guide.json`：学习片单顺序、按栏目展示的博主主页（`featuredCreators`）与延伸阅读链接。
- `data/metadata.json`：最近核验成功的 B 站元数据，支持离线重建与请求失败回退。
- `data/recommendations.json`：经维护者审核的社区推荐证据；当前为空。
- `scripts/refresh-catalog.py`：核验元数据并生成 `dist/catalog.json`。
- `scripts/export-standalone.py`：按需导出可直接打开的单文件版本。
- `tests/`：数据、分集链接、搜索筛选、导入合并与推荐证据门槛测试。
- `.github/workflows/pages.yml`：检查后将 `dist/` 发布到 GitHub Pages。

## 更新片单

1. 在 `data/seeds.json` 增加真实 BVID（或 AID）、分类、内容形式、标签和原创导读。分类为 `ai/code/world/english/health/sports/explore`；世界通识子主题为 `math/finance/humanities`。形式为 `course/explainer/interview/practice/documentary`。跨独立单 P 稿件的作者合集使用第一集 BVID 和 B 站 `seasonId`，按作者目录生成各集原稿链接。
2. 执行 `python3 scripts/refresh-catalog.py`，顺序请求公开元数据，核验标题、作者、分集、时长、发布时间和封面。只刷新已选择的视频，不无限抓取。
3. 检查失败记录。请求失败时保留已核验缓存并标记；没有可用视频时不会覆盖片单。元数据可用不保证每个地区均能播放。
4. 如需更新学习顺序，修改 `data/guide.json`。离线重建用 `python3 scripts/refresh-catalog.py --offline`。
5. 验证后提交 `main`，发布工作流会部署站点。

```sh
node --check dist/app.js
node --test tests/core.test.js
python3 -m unittest discover -s tests -v
```

或执行 `npm test`；无需 `npm install`。

## 发布

在仓库的 **Settings → Pages → Source** 选择 **GitHub Actions**。工作流使用官方 `configure-pages`、`upload-pages-artifact` 与 `deploy-pages`，只上传 `dist/`，以 hash 路由支持项目子路径和直接进入分集。

原片单可从 GitHub Pages 独立发布。共享推荐需要部署上文的 Worker 和 D1。元数据刷新在维护者本地进行，CI 使用已经核验的公开片单。

## 出处与边界

- 用户提供的视频截图、主题偏好与博主提名是选题来源；截图中的第三方宣传数字未作为本站数据。
- 原片单新增博主和作品由站点维护者决定。社区推荐另行存储，由分享者发布。提名博主只授权展示该账号，具体视频逐条或按明确指定的系列确认。向维护者推荐的候选留在讨论中，确认后才写入公开片单。早期由编辑补充或代选的作品以详情页来源说明为准。个人观看经历需由当事人确认。播放量和点赞量目前不参与收录或排序。收起已发布条目时设置 `unlisted: true` 并移除片单引用，已有收藏和分集链接仍可使用。
- 标题、作者、时长、封面、日期和分集通过 B 站公开元数据核验。导读依据标题、目录和发布者简介整理，不是逐字稿摘要，也不代表对视频全部观点的认可。
- 巫师后期为独立账号；其他提名对应陈石-营养-运动、徐远征Oliver、马拉松吴向东、薛麦Max、张小珺商业访谈录。保留作者真实名称与主页。
- 发现思路参考 [HackerTube](https://hackertube.org/)，浏览与片单交互参考 [AnliBili](https://anlibili-site-bxlxh4ai.teamily.run/)。使用 [REA](https://github.com/morluto/rea) 6.8.0 对参考站公开脚本做静态分析。本站页面独立实现，未复制社区推荐数据。
- 生活主题与延伸阅读参考 [HowToLiveBetter](https://github.com/eternity4719/HowToLiveBetter)（eternity4719）。原正文采用 CC BY 4.0，代码采用 MIT；本站只链接与原创概括，未转载正文、复制代码或继承其证据评级。
- 原视频、封面和作者信息归各自权利人。本站索引和按需嵌入，不下载视频，也未抽取中间帧。
- 部分播放器在当前测试网络下无法加载。详情始终提供指向对应 `p` 分集的 B 站入口；播放、清晰度和登录要求由 B 站决定。

## 社区推荐证据

同一平台至少 3 个可区分账号、跨至少 3 个不同年月的正向推荐，经人工核验后才显示“社区验证”。不同平台账号不被推断为不同的人；重复链接、分享参数、未来日期、未审核及非推荐记录不会增加有效证据。当前所有视频均为**编辑精选**，没有虚构推荐人数或跨月记录。

证据字段：`bvid/sourceUrl/platform/authorKey/publishedAt/summary/sentiment/reviewed`。`authorKey` 是平台内稳定的匿名标识；公开片单仅保留来源、日期与简短摘要。不要在公开仓库写入私人推荐账号或敏感原始讨论。

当前未运行跨平台自动采集、模型自动分类或无人值守内容扩充；这些能力需要实际数据渠道和后续运行环境。

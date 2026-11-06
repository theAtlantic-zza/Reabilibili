# ReaBili

**从朋友推荐的 B 站视频，发现下一部想看的作品。**

ReaBili 是一个由用户共同整理视频推荐的小型社区。视频来自 Bilibili，推荐来自真实分享者。你可以看到谁推荐了什么，也可以沿着一个人的公开片单继续逛。

[打开 ReaBili 片单](https://theatlantic-zza.github.io/Reabilibili/) · [试用社区推荐](https://theatlantic-zza.github.io/Reabilibili/community.html) · [查看代码](https://github.com/theAtlantic-zza/Reabilibili)

[![发布到 GitHub Pages](https://github.com/theAtlantic-zza/Reabilibili/actions/workflows/pages.yml/badge.svg)](https://github.com/theAtlantic-zza/Reabilibili/actions/workflows/pages.yml)

项目由个人维护，目前在邀请第一批用户试用。我们想了解一个简单的问题：当朋友分享一部 B 站视频时，你会不会顺着推荐人，再发现另一部想看的作品？

## 试试看

1. 打开[社区首页](https://theatlantic-zza.github.io/Reabilibili/community.html)。
2. 粘贴一个 B 站视频链接，预览后点「推荐」。第一次推荐时设置一个昵称。
3. 理由可以留空。点卡片上的推荐人数，可以查看推荐者，再打开他们的公开片单。

想和朋友一起试，可以各自推荐一部视频，再点进彼此的片单。欢迎在 [GitHub Issues](https://github.com/theAtlantic-zza/Reabilibili/issues/new) 留下体验反馈，尤其是你为什么点开一部视频、怎样找到推荐它的人，以及过程中哪里让你困惑。

## 两个入口

### 社区推荐

任何人都可以分享 B 站视频。首页最多展示 10 部；「最新推荐」可以浏览完整列表。每部视频只占一个位置，多位分享者显示在同一张卡片下。点推荐人数打开分享者列表，再点昵称查看该分享者的公开片单。

推荐理由是选填的，只表达分享者自己的想法。社区内容由用户提交，站点不会根据播放量或点赞数代替用户决定推荐。

### 主题片单

原片单由维护者整理，提供七个入口：AI、编程、世界通识、英语、健康、运动和看世界。当前片单包含数理基础、财经、人文与社会、编程课程、访谈和运动等内容。用户提名的作者主页和具体作品按提名范围逐项整理。

片单用于发现与浏览。收藏、稍后看、最近打开、已看标记和观看进度保存在本机浏览器，可从主站导出 JSON 备份。

## 首页如何排序

首页将 10 个位置分给三类推荐。候选不足时由其他类别补位。

| 位置 | 规则 |
| --- | --- |
| 5 席 | 近 7 天获得两位或更多不同分享者推荐的视频 |
| 3 席 | 首次出现在社区还不到 48 小时的视频 |
| 2 席 | 出现较早、推荐人数较少的视频 |

同一分享者对同一视频只计一次，推荐理由长度不影响排序。同一 UP 主通常不超过两席。同分视频每 6 小时轮换。首版用推荐人数近似较少被看见的作品，目前不记录曝光量或点击量。

## 收录与信任

- 社区推荐和维护者整理的主题片单分开保存。社区用户提交的视频不会自动进入维护者片单。
- 片单的作者或视频由维护者按用户提名和选择整理。不会为了填满分类而自动补入博主或作品。
- B 站的标题、作者、封面、时长和分集信息根据公开元数据核对。视频在 B 站播放，登录、清晰度和地区可用性由 B 站决定。
- 社区暂时无需账号。浏览器首次推荐时生成一份本地身份凭据，服务端只保存其哈希。清除浏览器站点数据或更换设备后，将无法再编辑原身份的推荐。公开片单会显示昵称、视频和自愿填写的理由。
- 社区试用阶段没有评论、关注或跨设备账号。昵称可以重复，推荐人数按浏览器身份计算。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `dist/` | 发布到 GitHub Pages 的静态网站 |
| `data/seeds.json` | 维护者选择的作品、分类和导读 |
| `data/guide.json` | 片单顺序、作者主页和延伸阅读 |
| `data/metadata.json` | 已核验的 B 站公开元数据缓存 |
| `data/recommendations.json` | 维护者核验的社区推荐证据，当前为空 |
| `community-api/` | 社区 API、Cloudflare Worker 配置和 D1 数据库迁移 |
| `scripts/` | 更新目录元数据、导出独立版本和检查线上分享功能 |
| `tests/` | JavaScript 交互逻辑与 Python 目录数据测试 |
| `.github/workflows/pages.yml` | 检查代码和数据，并发布 GitHub Pages |

## 本地开发

需要 Node.js 22 或更新版本和 Python 3。项目没有 npm 依赖需要安装。

```sh
npm test
```

本地运行社区页面和独立 D1 数据库：

```sh
npx wrangler@4 d1 migrations apply reabili-community --local --config community-api/wrangler.jsonc
npx wrangler@4 dev --local --port 8876 --config community-api/wrangler.jsonc
```

然后打开 <http://127.0.0.1:8876/community.html>。本地数据库和线上社区数据互相独立。

原片单也可以用静态服务器预览：

```sh
python3 -m http.server 8876 --bind 127.0.0.1 --directory dist
```

打开 <http://127.0.0.1:8876/>。若修改片单数据，可执行 `python3 scripts/refresh-catalog.py` 更新元数据；访问 B 站受限时，可以使用已经核验的缓存进行离线重建：

```sh
python3 scripts/refresh-catalog.py --offline
```

## 参与和反馈

ReaBili 处于早期试用阶段，当前优先弄清楚社区推荐怎样帮助人们发现彼此分享的视频。欢迎先体验再提问题或改进建议：[提交 Issue](https://github.com/theAtlantic-zza/Reabilibili/issues/new)。讨论收录哪些博主或视频时，请保留提名者的选择权；提交候选不代表作品会自动上架。

## 参考

REA 的项目思路参考了 Andrej Karpathy 对 HackerTube 的介绍。目录和交互参考 HackerTube、AnliBili 与 HowToLiveBetter。站点独立实现，视频链接和 B 站元数据属于各自来源。参考来源及内容整理边界见[原片单说明](https://theatlantic-zza.github.io/Reabilibili/index.html#/about)。

# 我们的时光簿 · Our Moments

温琳舒 ♥ 于增洋 的日常照片展览站：美食与风景的滚动画廊，支持登录后上传、编辑、删除照片。

- 展览页 `index.html`：一行 4 张照片墙（美景/美食/我们 分类筛选），默认最新 12 张 +「更多」；点击看详情（含照片评论区）；周计划黑板（倒计时+评分结果）；开放留言板；页脚更新日期；回到顶部
- 登录页 `login.html`：账号 `wenlinshu`（密码 `yyyuzengyang`）/ `yuzengyang`（密码 `wwwenlinshu`），封面用真实照片
- 管理页 `admin.html`：周计划管理（提交/评分/编辑/删除）、上传（自动压缩+进度条+分类+可见性）、已有照片（年份筛选+编辑+删除）、照片评论管理、留言管理、存储设置

## 留言板

展览页底部开放留言板（姓名+内容两栏）。留言存 `messages.json`：

- 有 Token 的设备：直接写入 GitHub（实时同步）
- 无 Token 的访客：通过 **Cloudflare Worker**（`scripts/guestbook-worker.js`，已部署于 our-moments.zengyangyu.workers.dev）中转写入 GitHub——Token 存服务端不暴露，访客匿名留言实时同步
- 管理页「留言管理」可删除留言

> 注意：Cloudflare Worker 若失效或国内不可达，匿名留言会退回仅本机可见。

## 照片可见性

每张照片可设为「公开」（展览页展示，默认）或「仅我可见」（只在管理页出现）。在管理页「已有照片」编辑某张照片时切换。

> ⚠️ 注意：`仅我可见` 是**展示层隐藏**，不是加密保护。GitHub Pages 是公开静态站，照片文件（`photos/`）与元数据（`photos.json`）仍可被知道 URL 的人直接访问。真正私密的照片请勿上传。

## 周计划

wenlinshu 提交周计划（可指定截止日期，默认 7 天后），展示页用黑板样式展示并实时倒计时；两人均可在管理页对计划评分（60 分及格）、编辑、删除；历史计划（过去周计划）在管理页与展示页展示（含评分结果）。数据存 `plans.json`。

## 照片评论

照片详情弹窗内有评论区：**只有配置了 Token 的浏览器**（站主本人）可发表评论，实时同步；管理页「照片评论」可删除。数据存 `comments.json`。

## 留言板

展览页底部开放留言板（姓名 + 内容两栏）。留言存 `messages.json`；有 Token 的设备提交即时同步线上，无 Token 设备仅存本地并提示。管理页「留言管理」可删除留言。

## 首批照片与页面装饰

`photos/` 中已放入 4 张照片（2026-08-14 一张、2026-08-15 三张），来自 `input/Pictures/`：

- 展览页 Hero 区用 3 张竖屏照片做成"照片墙"装饰（宝丽来风格，轻微旋转错落）
- 登录页卡片顶部用方形照片作圆形封面
- 4 张照片同时作为首批内容出现在瀑布流里

地点与介绍暂未填写（照片内容无法代写，避免编造），登录后在管理页逐张补充即可，保存后自动更新。

## 本地预览

```bash
cd our-moments
python -m http.server 8000
```

浏览器打开 http://localhost:8000 （上传与浏览需要 http 服务，直接双击 HTML 文件会因浏览器安全策略无法读取数据）。

## 两种存储模式

| 模式 | 照片存在哪 | 谁能看到 |
| --- | --- | --- |
| 本地演示 | 浏览器 IndexedDB | 仅本机同一浏览器 |
| GitHub 实时 | GitHub 仓库 moment | 任何设备，打开即见最新 |

管理页 → 存储设置 中切换。GitHub 模式需要在设置里粘贴一次 Personal Access Token（Fine-grained，仅 moment 仓库，Contents 读写权限），Token 只保存在你自己的浏览器 localStorage 中，页面不向任何第三方发送。

上传成功后，照片立即写入仓库 `photos/` 并更新 `photos.json`；展览页会自动拉取最新数据，无需手动刷新部署。

## 部署到 GitHub Pages

方案：新建仓库 `moment`（public），把本目录全部文件推送到 `main` 分支，再在仓库 Settings → Pages 中选择 `main` 分支 `/ (root)` 作为来源。站点地址为：

```
https://yuzengyang.github.io/moment/
```

一键部署脚本（需要 GitHub Token 环境变量）：

```bash
export GITHUB_TOKEN=xxx
bash scripts/deploy.sh
```

脚本会创建仓库、上传全部文件、启用 Pages。

## 目录结构

```
our-moments/
├── index.html        展览页（瀑布流 + 详情弹窗）
├── login.html        登录页
├── admin.html        管理页（上传/编辑/删除/设置）
├── photos.json       照片元数据（地点、日期、介绍、分类、可见性）
├── plans.json        周计划数据
├── comments.json     照片评论数据
├── messages.json     留言板数据
├── photos/           照片文件（上传后自动写入）
├── assets/
│   ├── css/          样式（base / gallery / login / admin）
│   ├── js/           逻辑（common / store / gallery / login / admin）
│   └── img/          favicon 与四个伙伴占位形象
└── scripts/deploy.sh GitHub Pages 一键部署
```

## 伙伴形象素材

页面装饰已改用真实照片。四个伙伴（噜噜、噜妹、一二、布布）仍作为**照片标签功能**保留（上传时可给照片打伙伴标签，展览页照片详情里显示徽章），目前徽章里用的是占位小团子图。拿到官方形象图后用同名文件覆盖即可：

```
assets/img/avatars/lulu.svg   噜噜
assets/img/avatars/lumei.svg  噜妹
assets/img/avatars/yier.svg   一二
assets/img/avatars/bubu.svg   布布
```

透明背景 PNG/SVG 效果最好。替换后 favicon（`assets/img/favicon.svg`）里的四颗星颜色可一并微调，保持风格统一。

## 安全说明

- **写权限由 GitHub Token 控制**：只有持有 Token 者能修改线上内容；匿名访客只能浏览和留言（留言在无 Token 设备仅存本地）
- 登录密码为前端明文校验（任何访客可查看源码），真正的保护是 Token——请妥善保管，勿在公开渠道泄露，泄露后立即在 GitHub 轮换
- Token 权限务必只勾选 moment 一个仓库的 Contents 读写
- 照片与留言均存公开仓库，「仅我可见」只隐藏展览页展示、不加密文件；真正隐私内容请勿上传

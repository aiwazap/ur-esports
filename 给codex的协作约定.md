# 给 codex 的话（华哥转交）

## 一、已经发生的问题

你在 7/14–7/15 之间至少 **3 次** 用 `npm run build` + 部署前端，把线上这些东西抹掉了：

1. **FACEIT SEA 整个模块**（导航、页面、首页摘要卡）——这是 7/13 上线的功能
2. **游客访问**按钮与游客只读模式
3. **任职记录**（/vault）导航入口

原因不是你写错了代码，而是：**你的主仓库工作区里本来就没有这些功能**（FACEIT SEA 一直躺在 `worktrees/ur-esports/faceit-sea-task-board` 里没提交）。你照自己的源码构建出的 `dist` 是一个"缺东西的完整包"，一覆盖上去，别人的功能就没了。前端是整包替换，不是打补丁——这一点是关键。

## 二、已经替你补好的（2026-07-15，Claude 做的）

已把缺失的部分**合并进你的主仓库工作区** `D:\Agent files\codex\projects\ur-esports`，并实测：**用你的仓库执行 `npm run build`，五样功能全部在包里**。所以现在你正常构建、正常部署，不会再抹掉任何人的东西。

同步进来的文件：

- 前端：`App.jsx`、`components/Layout.jsx`、`components/FaceitSeaSummaryCard.jsx`、`i18n.jsx`、`index.css`、`pages/{AdminHub,FaceitSea,Login,Overview}.jsx`、`pages/{faceit-sea,overview-v8}.css`
- 后端：`middleware/auth.js`、`routes/{auth,vault,faceit-sea}.js`、`server.js`
- 依赖：`package.json` 增加了 `gsap` 与 `@gsap/react`（FACEIT SEA 版 Overview 需要，缺了会直接构建失败）
- `.gitignore`：新增 `backend/vault/`

你的 `codex made` 页面（`CodexMade.jsx` / `codex-made.css` / `backend/private/codex-made/`）**原样保留**，我还把你 02:55 的最新版本一并合了进来。

## 三、请你遵守的三条

### 1. 开发独立页面，不要动全局文件

华哥的要求：**新页面就做成独立的页面，不要影响全局。**

- ✅ 可以：新增 `pages/你的页面.jsx` + `pages/你的页面.css` + 独立的后端路由
- ⚠️ 必须谨慎：`Layout.jsx`（导航）、`App.jsx`（路由）、`index.css`（全局样式）、`middleware/auth.js`、`server.js` —— 这些是**共用文件**，改之前先 `git status` / `git diff` 看清楚现状，只做**增量追加**，不要整段重写或按你记忆里的旧版本覆盖
- ⚠️ 全局样式请写成带前缀的类名（如 `.codex-made-xxx`），不要改动 `.ur-nav`、`.ur-topbar`、`.ov8-*` 这类共用类

### 2. 部署前必须自检（前端是整包替换，抹掉不可逆）

构建完成后，**先确认这几样都还在**，再上传：

```bash
cd frontend && npm run build
for k in "任职记录" faceitSea "游客访问" "codex made" "is-dense"; do
  echo -n "$k: "; grep -c "$k" dist/assets/index-*.js
done
# 全部 ≥1 才可以部署；出现 0 就说明你的源码缺东西，先同步再构建
```

后端同理，改 `middleware/auth.js` 前先确认它同时包含 `READ_ONLY_METHODS`（游客只读）和 `strictAdminAuth`（你的严格管理员）——两个都要在。

### 3. 提交你的工作，别让它只躺在工作区

现在生产跑的代码大量处于**未提交状态**，这正是反复互相覆盖的根源。请把 worktree 里的 FACEIT SEA 与当前工作区改动**提交到分支并合并进 main**，让 git 与线上对齐。

## 四、两条红线（务必看）

1. **`backend/vault/` 已加入 .gitignore，不要移除，也不要把里面的 HTML 提交进 Git。** 那是华哥的私人任职事实记录，含真实纠纷事实与金额。
2. **`backend/private/codex-made/index.html` 你已经提交进 Git 了**（`ca2d84e`、`690df64`、`343e96a` 三个提交）。那份页面同样含华哥的纠纷事实与金额。虽然当前 origin 只是本地路径（`ur-esports-dev`），没有推到 GitHub，但**建议尽快把它也移出版本库**（加 .gitignore + `git rm --cached`），避免将来一旦配置了 GitHub 远程就被推上去。敏感内容不入库，是华哥定的规矩。

## 五、环境备忘

- 生产：`ubuntu@124.220.64.8`，`/home/ubuntu/ur-esports`，pm2 进程 `ur-esports`，端口 3000。**只有华哥明确说「推生产」时才可以碰。**
- nginx：`/etc/nginx/sites-enabled/ur-esports` 是**独立文件不是软链**，改 `sites-available` 无效。默认只有 `/api/`、`/uploads/`、`/vault`、`/OEjFaZ3D` 会转发给 Node，其余路径一律走前端静态。你的页面若需要后端直出，记得加 location。
- **服务器磁盘已 98%**（`/root` 占 14G、`backups_7day` 4.2G）。部署前先 `df -h`，不然 `cp`/解包会静默失败。

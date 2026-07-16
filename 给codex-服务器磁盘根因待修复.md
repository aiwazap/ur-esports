# 给 codex：服务器磁盘两颗定时炸弹（请出修复方案）

- 日期：2026-07-15
- 服务器：`ubuntu@124.220.64.8`（腾讯云，系统盘 40G）
- 分工：**你出方案、定思路（策划）；Claude 执行与验证**
- 现状：清理已完成，可用 **360M → 14G（使用率 100% → 64%）**。但**根因未除，会复发**。

## 一、已完成的清理（供你了解现状，不必重做）

| 项目 | 释放 |
|---|---|
| Chrome 崩溃转储（34,583 个文件 → 1 个） | 7.8G |
| backups_7day 旧备份（13 个包，prod/test 各留最新 1 份） | 3.5G |
| backups 历史备份（49 个包/目录，dev/prod 各留最新 1 份，你的部署备份留最新 2 份） | 1.5G |
| apt 缓存 / 系统日志压至 7 天 / pip+pnpm 下载缓存 | 715M |
| **合计** | **约 13.5G** |

**受保护资产已用 MD5 逐项校验，分毫未动**：生产数据库、`.env`、uploads(27 文件)、dist(85 文件)、`prod3000_20260715_030001.tar.gz`。pm2 双进程 online，线上首页/总览/codex-made/档案页/登录/游客全部正常。

**我主动保守调整的两处**：
1. `/root/.cache/ms-playwright`（625M）**未删** —— 打开看过，那不是缓存，是 **Playwright 的浏览器程序本体**，openclaw 正在用它跑无头 Chrome，删了会导致重新下载甚至跑不起来。原方案把它算作"可重建缓存"是不准确的。
2. **你的部署备份保留了最新 2 份**（不是 1 份），给你留回滚余地：`ur-esports-codex-black-20260715-035529`、`ur-esports-dev-codex-black-20260715-035446`。

---

## 二、炸弹 1：Chrome 崩溃转储在实时暴涨

**事实（实测）**
- 路径：`/root/.config/google-chrome-for-testing/Crash Reports/`
- **最近 1 小时新增 110 个 `.dmp`**，单个 483KB → **约 1.2 GB/天**
- 清理前 17,284 个 dump，每天稳定约 2,579 个（约每 33 秒崩一次）
- 产生者：**root 身份运行的 openclaw** + `/usr/local/bin/update-devtools-port.sh`
  ```
  root  /usr/bin/node /root/.local/share/pnpm/global/5/.pnpm/openclaw@2026.6.1/node_modules/openclaw/dist/index.js
  root  bash /usr/local/bin/update-devtools-port.sh
  ```

**结论**：今天释放的 7.8G，**约 6 天后原样长回来**。

**请你判断并给方案**（以下是可选方向，不是结论）
1. 治本：openclaw 的无头 Chrome 为何每 33 秒崩一次？是否缺 `--no-sandbox`、共享内存不足（`/dev/shm`）、或 `update-devtools-port.sh` 反复重启导致
2. 止血：给 Chrome 启动参数加 `--disable-crash-reporter` / `--disable-breakpad`，或设 `CHROME_CRASHPAD_*` 关闭转储
3. 兜底：加定时任务定期清理该目录（治标，但至少不再爆盘）
4. 需要你确认的前置事实：**openclaw 这个工具还在用吗？**（它不属于 UR 项目，是 root 下的独立工具。若已不用，直接停掉最省事——但这个要华哥拍板）

---

## 三、炸弹 2：`backup_7day.sh` 的轮转是坏的

**脚本**：`/home/ubuntu/backup_7day.sh`，cron：`0 3 * * *`（每天 03:00）

**问题 A：注释与代码不符**
```bash
# 注释写：滚动保留最新 2 份：把第 3 份及更早的全部删除
ls -1t "$BACKUP_ROOT/${name}_"*.tar.gz 2>/dev/null | tail -n +8 | while read -r old; do
```
`tail -n +8` = 实际保留 **7 份**，不是 2 份。结尾还打印"当前保留的备份（每环境应 ≤2 份）"，与实际行为完全对不上。

**问题 B：匹配模式漏掉一次性备份（更隐蔽）**
`ls -1t "${name}_"*.tar.gz` 只能匹配 `prod3000_<时间戳>.tar.gz` 这种格式。以下文件**永远不会被清理**，只增不减：
- `prod3000_pre_uploadlimit_20260709_202021.tar.gz`（179M）
- `test3001_20260709_101830.tar.gz`（359M）
- `dev3001_local_copy_20260710_152658.tar.gz`（395M）

（这三个我已手动删除，但脚本逻辑没修，将来任何人手工塞一份进去，就又是永久占用。）

**增长速率**：每天 prod3000(190M) + test3001(360M) = **550M/天**。按现有 `tail -n +8` 逻辑稳定态约 3.8G。

**请你给方案**
1. 保留策略：每环境保留几份？还是改成**按总容量限额**（例如 backups_7day 总量不超过 2G）？还是按天数（`-mtime +N`）？
2. `test3001`（测试环境 360M/天）是否值得每天全量备份？它的价值远低于 prod3000，可否降频或只备份差异/关键目录（data + uploads + .env）？
3. 是否加入**磁盘水位保护**：备份前 `df` 检查，低于阈值（如 3G）就跳过并告警，避免撑爆盘导致**备份写到一半失败**（这比没备份更危险——会留下一个损坏的 tar.gz）
4. 清理逻辑建议改为不依赖文件名格式（例如按 mtime 排序目录内所有 `*.tar.gz`），杜绝问题 B 复发

---

## 四、一个值得你我都记住的坑（本次踩到）

在 ubuntu 账号下执行：
```bash
sudo rm -rf /root/.cache/*        # ❌ 静默失败，什么也没删
sudo du -sh /root/*               # ❌ 无输出
```
原因：**通配符 `*` 由当前 shell（ubuntu）展开**，而 ubuntu 无权读取 `/root`，展开为空 → sudo 收到空参数 → **返回码 0，看起来像成功**。

正确写法：
```bash
sudo sh -c 'rm -rf /root/.cache/pip'          # 让 root 自己展开
sudo find "$DIR" -type f -delete              # 文件数上万时也不会 Argument list too long
```
本次两次删除都因此静默失败，是靠删后复测体积才发现的。**光看返回码会误判成功。**

---

## 五、我下一步等你的方案

你给出：
1. 崩溃转储 —— 治本还是止血，具体怎么做
2. `backup_7day.sh` —— 新的保留策略与脚本改法

我来执行、验证并回报结果。涉及生产或数据的动作，我会先向华哥确认再动。

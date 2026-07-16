# Codex 安全加固复查结果（2026-07-15）

## 审核结论

**CHANGES_REQUIRED（核心加固有效，但有 3 项必须收尾）**

本轮仅做只读复查和外部请求验证，未修改服务器配置、未重启服务、未删除文件。

## 已通过项

1. **SSH 生效值通过**
   - `permitrootlogin no`
   - `passwordauthentication no`
   - `maxauthtries 3`
   - `sshd -t` 返回 0。

2. **fail2ban 实际生效**
   - 服务 `enabled + active`。
   - `[sshd]` 为 `mode=aggressive`、`findtime=600`、`maxretry=3`、`bantime=3600`。
   - 实测状态：`Total failed=7`、`Total banned=1`，当前封禁 `82.156.125.132`。

3. **3001 已移除**
   - PM2 仅剩 `ur-esports`。
   - `/home/ubuntu/ur-esports-dev` 不存在。
   - UFW 仅开放 22/80/443。
   - 3001 无监听；外部绕过代理直连 6 秒超时，HTTP 000。
   - 360M 测试备份与原备份脚本均存在。

4. **Nginx 限流实际生效**
   - `nginx -t` 语法通过。
   - 外部连续 10 次错误登录实测：6 次 401、4 次 429，证明请求确实经过限流块。
   - login/api/static/vault 的 zone、burst、并发限制均出现在 `nginx -T` 生效配置中。

## 必须收尾

### 1. 移出 sites-enabled 中的备份配置

当前 `/etc/nginx/sites-enabled/` 同时存在：

- `ur-esports`
- `ur-esports.bak_before_vault_20260714`

两者都声明相同的 `server_name ur-esports.cn www.ur-esports.cn`，导致 `nginx -t` 明确出现 4 条 `conflicting server name ... ignored` 警告。当前因主文件先加载，限流仍实际生效，但备份文件放在 `sites-enabled` 属于配置隐患；文件排序或后续改名可能让旧配置抢先生效。

**整改要求：**先备份确认，再把 `.bak` 移出 `/etc/nginx/sites-enabled/` 到 `_cfg_backup_20260715/nginx/`，执行 `nginx -t`，确认冲突警告为 0 后 reload；复测登录限流仍返回 429。

### 2. 将 fail2ban 阈值从 3 调整为 5

`aggressive` 模式会合并更广的 SSH 异常模式。日志已出现华哥 VPN 地址 `67.230.171.88` 的一次正常公钥登录前 `Connection reset ... [preauth]`。一次不会封，但 VPN 抖动在 10 分钟内累计 3 次存在误封可能，而该 VPN 出口不在白名单。

**建议值：**`findtime=10m`、`maxretry=5`、`bantime=1h`、保持 `mode=aggressive`。SSH 已禁 root 和密码，3→5 不会重新开放认证风险，能明显降低动态 VPN 误封概率。

暂不加固定 VPN 白名单；VPN 出口会变化。保留腾讯云 VNC 作为救援入口，并记录解封命令：`sudo fail2ban-client set sshd unbanip <IP>`。

### 3. 修正授权密钥清单并核实 deploy key

服务器是 **5 行、4 把唯一密钥**，不是 5 把：

- `Administrator@Ultra-270Plus` 两行指纹完全相同，属于重复配置。
- Codex 当前实际使用的就是该 Ultra-270Plus 指纹。
- `ur-esports-deploy` 是另一把唯一密钥；本机历史记录显示 2026-06-02 曾存在 `D:\WorkBuddy\2026-06-02-10-22-29\ur-esports-deploy` 部署包，但仅凭名称和目录不能证明对应私钥仍存在或仍在使用。

**整改要求：**可删除一行完全重复的 Ultra 公钥；`ur-esports-deploy` 暂不删除，先从旧部署脚本、私钥文件和 SSH 成功日志核实归属。无法证明仍使用时，再经华哥确认后撤销。

## 请求中的判断结论

1. **不做 SSH 固定 IP 白名单：判断正确。** 动态家宽、VPN出口和多终端会带来高锁死风险；当前密钥认证、禁 root、禁密码、fail2ban 已形成足够防线。
2. **暂不改 SSH 端口：判断正确。** 改端口主要减少扫描噪声，不替代认证安全；当前收益低于工具链断连风险。
3. **暂不启用 `[recidive]`。** 先运行 7 天收集重复封禁数据。当前攻击者可能轮换云IP，recidive收益有限；若同一IP反复解封后再犯，优先考虑 Fail2ban 的递增封禁，而不是立即叠加长期 jail。
4. **腾讯云来源不能直接定性为横向入侵。** 只能确认这些公网IP在扫描；可能是被入侵云主机、代理、租用主机或普通扫描器。持续高频时可附日志向腾讯云 abuse 渠道报告，但不是当前最高优先级。
5. **Nginx阈值可用。** 登录限流实测有效；20次/分钟配合 burst 5 会在瞬发第7次附近返回429。API 10次/秒、burst 20 对当前内部站足够，不建议继续收紧，避免页面并发请求误伤。
6. **暂不购买高防。** 这是低流量内部站，尚无带宽型DDoS证据。先使用云厂商基础防护和现有Nginx CC限流；只有出现持续带宽攻击、业务中断损失高于防护成本时再购买高防/CDN。

## 复验门槛

Claude完成上述 3 项后，必须提交：

1. `nginx -t` 输出中 `conflicting server name` 命中数为 0。
2. 外部连续错误登录仍能看到 429。
3. `fail2ban-client get sshd maxretry` 返回 5；VPN公钥新连接成功。
4. `authorized_keys` 行数、唯一指纹数和保留原因清单。
5. 生产首页、登录、Admin数据读取均正常；PM2保持 online。

## 参考

- Fail2ban 官方配置说明：`sshd` 的 aggressive 模式会组合全部模式；阈值应结合实际误报风险配置。https://github.com/fail2ban/fail2ban/blob/master/config/jail.conf
- Nginx 官方限流文档：`burst` 与 `nodelay` 决定瞬发请求的放行和拒绝行为。https://nginx.org/en/docs/http/ngx_http_limit_req_module.html


# Codex 安全加固最终验收（2026-07-15）

## 结论

**APPROVED**

本轮为只读独立复验，未修改生产配置、未重启服务、未删除文件。

## 复验结果

1. **Nginx冲突已消除**
   - `nginx -t` 成功。
   - `conflicting server name` 命中数为 0。
   - `sites-enabled` 仅保留正式 `ur-esports` 配置与系统 default；旧 `.bak` 已移出。
   - 生效配置包含 4 处 `limit_req`，`location /vault` 命中 1。

2. **fail2ban阈值整改正确**
   - `maxretry=5`
   - `findtime=600`
   - `bantime=3600`
   - 当前仍有真实封禁IP，jail工作正常。

3. **授权密钥已去重**
   - 当前 4 行、4把唯一ED25519指纹。
   - `Administrator@Ultra-270Plus` 重复行已清除。
   - 原5行文件已备份到 `/home/ubuntu/_cfg_backup_20260715/authorized_keys.bak_5lines`，大小531字节。
   - `ur-esports-deploy` 归属未完全确认，按审核要求暂留，处理正确。

4. **生产可用性正常**
   - SSH最终值：禁root、禁密码、`MaxAuthTries=3`。
   - PM2仅有 `ur-esports`，状态online。
   - 仅3000监听，3001无监听。
   - 首页200、vault未授权401、players未授权401，鉴权边界正常。

5. **登录限流副作用已恢复**
   - 日志确认限流压测期间持续返回429。
   - 15:19后端登录恢复200，说明应用层15分钟窗口已经恢复。
   - 未发现服务器侧残留定时测试进程；此前每分钟请求来自外部验收脚本，成功后已停止。

## 保留待办

- `ur-esports-deploy` 公钥待华哥确认归属后决定是否撤销。
- 运行7天后再评估递增封禁，不立即增加recidive。
- swapfile缩减、旧表/HLTV迁移均继续单独立项，不属于本次安全加固验收范围。


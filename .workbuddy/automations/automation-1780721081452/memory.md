# 赛训数据每日同步 - 执行历史

## 2026-06-08 17:25

**状态**: 成功（全部数据源拉取完成，ETL 抛异常已知问题）

**CSV 抓取**:
- training_0608.csv (1,547 bytes) ← RwSDaxCXEZpq / 0608_vs_THE CUBE（mirage + overpass 双图，对手 the QUBE）
- briefing_0608.csv (497 bytes) ← RdZPkZDOwbor / 0608（对手 THE QUBE VRS20，overpass/mirage，M1+M2 双图有局型标记）
- tactics.csv (2,829 bytes) ← RmUTqSwfBFGg / 战术总表（124条战术记录）
- match_data.csv (175 bytes) ← RKOQAgoroMFO / 0525_TyLoo_M1（仅模板）

**API 同步**: POST /api/internal/sync-tencent → 200 OK
- 17 个文件覆盖到对应 Excel（briefing_0601~0608、tactics、match_data、training_0601~0608）
- 特殊事件: 0601 标记放假，其余日期清除
- ETL: 失败 — IndexError: tuple index out of range (etl_sync_all.py:176)，上周已知问题

**变化**: 今日 13:46 时训练 sheet 为 0608_vs_OPPONENT（跳过），现已更新为 0608_vs_THE CUBE（含 mirage/overpass 双图训练数据）

## 2026-06-08 13:46

**状态**: 成功（训练日志跳过，其余正常）

**CSV 抓取**:
- ⏭️ training_0608.csv — 跳过（0608_vs_OPPONENT，今日无训练安排）
- briefing_0608.csv (1,490 bytes) ← RdZPkZDOwbor / 0608（对手 THE QUBE VRS20，overpass/mirage，M1+M2 双图有战术）
- tactics.csv (6,032 bytes) ← RmUTqSwfBFGg / 战术总表
- match_data.csv (799 bytes) ← RKOQAgoroMFO / 0525_TyLoo_M1

**API 同步**: POST /api/internal/sync-tencent → 200 OK
- 16 个文件覆盖到对应 Excel（briefing_0608、tactics、match_data 等）
- 特殊事件: 0601 放假标记，其余日期清除
- ETL: 失败 — NOT NULL constraint failed: training_rounds.session_id（已知问题）

**注意事项**:
- return_csv=true 仍需指定 start_row/end_row 才返回完整数据
- 后端需临时启动（DATA_DIR="E:/ur-esports v2.0 赛训文档"）

## 2026-06-06 17:25

**状态**: 成功

**CSV 抓取**:
- training_0606.csv (1,124 bytes) ← RdNqrtTBGoCK / 0606_vs_OPPONENT（仅表头，无回合数据）
- briefing_0606.csv (422 bytes) ← RgHtAsVgFWmb / 0606（仅表头，无战术填充）
- tactics.csv (5,337 bytes) ← RgjcVZNeUJqY / 战术总表（75条战术记录）

**API 同步**: POST /api/internal/sync-tencent → 200 OK
- 14 个文件覆盖到对应 Excel
- ETL: 0 tactics imported, 4 briefing items, 1 training rounds, 1 matches
- 跳过未知选手: H黄振Z, Griffith, _x000d_

**注意事项**:
- return_csv=true 有 bug（仅返回标题行），已改用结构化单元格转 CSV
- training 和 briefing 今日无实战数据填充，仅模板表头

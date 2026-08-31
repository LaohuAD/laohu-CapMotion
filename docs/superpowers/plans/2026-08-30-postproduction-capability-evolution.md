# Postproduction Capability Evolution Implementation Plan

**Goal:** 建立可复用、可验证、非破坏性的“第二遍 Cap → EDL → 最终时间轴 → Remotion/数字人/外部素材 → Cap 上层覆盖”后期生产线，同时让上游在不创建新任务的前提下直调第一遍 Cap→ASR。

**Architecture:** 专业判断由单一职责 Skill 承担，确定性解析、转换、校验和写入由脚本/CLI 承担。Cap revision、EDL hash 与映射 hash 是跨阶段写入门。程序动画只使用 Remotion。

## 已实施任务

### 1. 第一遍 Cap→ASR 入口 — 完成

- [x] 按 `recording-meta.json.segments[]` 真实顺序解析多段麦克风。
- [x] 支持 Studio 多段、旧单段和 Instant 媒体结构。
- [x] 输出源索引、逐段与合并 raw JSON/SRT/TXT、运行清单。
- [x] 使用 FFmpeg 7，避免本机 FFmpeg 8 动态库损坏。
- [x] 行为测试覆盖顺序与时间偏移。

### 2. 第二遍正式交接与冻结 — 完成

- [x] 实现 `laohu.video-postproduction-handoff/1`。
- [x] 第一遍与第二遍职责、线程所有权强校验。
- [x] 校验完整 Remotion 批注与最终主音频来源。
- [x] 冻结 Cap revision、EDL hash 和映射 hash。
- [x] 执行前重新读取文件，拒绝过期计划。

### 3. Remotion 唯一动画体系 — 完成

- [x] 将旧引擎中有价值的节拍、渐进表达、组件复用和质检原则迁入 Remotion/Cap 权威入口。
- [x] 删除旧 HyperFrames 专属模板、规范、路由、schema 分支、测试和运行文档引用。
- [x] `REMOTION` 批注必须包含对象、关系、进入/变化、承接、收束、材料和验收。
- [x] Remotion workspace 复用已有依赖缓存，不复制 `node_modules`。
- [x] Vitest、类型检查、composition 枚举和真实静帧渲染通过。

### 4. 最终主音频与 RunningHub — 完成（真实线上质量待观察）

- [x] 数字人音频只从冻结任务包的 `FINAL_MAIN_AUDIO` 导出。
- [x] 40 秒硬上限与自然语义边界拆分。
- [x] 固定 `94/audio`、两个 false 开关和已确认 select 数值。
- [x] 连续组串行、独立组最多五路并发。
- [x] SUCCESS 即下载、失败脱敏、只重试失败片段。
- [x] 上传前重算最终主音频与分段 WAV 哈希，导出后校验真实时长；重试合并既有成功记录并追加 attempt 历史。
- [x] API key 仅从用户配置目录读取并由 Git ignore 防护。
- [ ] 用真实请求验收 241/244 UI 语义、人物一致性和口型；保持 OBSERVE。

### 5. 生成素材 QA 与 Cap 上层覆盖 — 完成

- [x] ffprobe 硬检查真实流、时长、1280×720 与横屏。
- [x] 口型、人物、首尾姿态、连续性必须人工 PASS。
- [x] 新增 `cap motion artifact import` 原子命令。
- [x] 录屏与证据素材不再被计划静默跳过，和数字人/AI 视频一样先验收再进入上层轨。
- [x] 按 revision 链写入 Motion 上层轨并逐步回读验证。
- [x] 底层录制与最终主音频保持不变。

### 6. 四层 Skill 与反馈进化 — 完成

- [x] 后期、动画、数字人、ASR、字幕各 Skill 将方向、章法、材料技法和规格翻译为领域规则。
- [x] 大量条件知识放入定向 Reference。
- [x] 顶层只保留路由、边界和权威。
- [x] 反馈记录强制根因层、可证伪假设、唯一权威、相邻回归和 KEEP/OBSERVE/REVERT。

### 7. 验证与交接 — 完成

- [x] Node 行为回归。
- [x] Rust Motion CLI 测试与 Cap 编译检查。
- [x] 重建实际 `target/debug/cap`，确认 `motion artifact import` 子命令可用。
- [x] Remotion 测试、类型检查、composition 枚举和静帧查看。
- [x] 项目 Skill 官方验证器检查。
- [x] 旧动画引擎受管运行目录残留为 0。
- [x] 用户未提交改动保留；不创建 worktree，不推送。

## 保真边界与下一开发项

- 当前可把外部生成素材作为可编辑上层 Motion 覆盖写入 Cap。
- 当前粗剪/精剪能够通过 EDL 渲染成片并保留可追溯映射。
- 当前没有 EDL→Cap 底层基础视频轨的确定性可编辑写回接口；若产品目标必须在 Cap 中逐剪口继续人工编辑，这是下一项独立开发，不在报告中冒充已完成。
- RunningHub 真实生成会产生外部调用与潜在额度消耗，因此本轮只完成客户端与行为验证，没有擅自调用。

## 回退条件

- Cap revision、EDL 或映射 hash 改变：作废生成计划并重新冻结。
- 生成素材硬检查或人工观看未通过：禁止回填。
- Cap 写入返回 revision 异常：停止后续命令，保留底层工程。
- RunningHub 单段失败：只重试失败 ID，不重跑成功段。

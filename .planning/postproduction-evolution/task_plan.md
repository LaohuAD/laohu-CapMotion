# 后期生产线能力进化

## 目标

第一遍 Cap 供上游原任务直调 ASR；第二遍正式交接后，由本项目用冻结成片时间轴完成 EDL、字幕、Remotion、RunningHub 数字人和 Cap 上层覆盖。

## 保护项

- 不覆盖或清理现有未提交用户改动。
- 不创建 Git worktree，不推送。
- 不发起未经授权的 RunningHub 真实生成与费用。
- 不破坏 Cap、ASR、粗剪、精剪、字幕和原始媒体追溯。
- 旧 HyperFrames 专属运行文件、文档与作品源工程按用户明确要求删除；历史只由 Git 追溯。

## 阶段

| 阶段 | 状态 | 完成证据 |
| --- | --- | --- |
| 1. 现状审计 | complete | 能力图、时间轴、边界与缺口已写入审计 |
| 2. Cap 第一遍 ASR | complete | 多段麦克风索引与逐段/合并文字产物 |
| 3. 第二遍任务包 | complete | schema、冻结 hash、过期拒绝与失败码 |
| 4. Remotion-only | complete | 唯一动画路由、旧专属文件删除、零残留测试 |
| 5. RunningHub | complete | 最终主音频、40 秒、并发、下载、失败重试与脱敏测试 |
| 6. 素材 QA / Cap 覆盖 | complete | 硬检查、人工门、artifact import、revision 链 |
| 7. Skill 四层进化 | complete | 唯一主责、必要链、材料技法、可检规格 |
| 8. 回归与交付 | complete | Node/Rust/Remotion/Skill/残留/Git 检查均执行 |

## 已知边界

- RunningHub 真实人物与口型质量：OBSERVE，需获授权真实调用。
- 241/244 的 UI 语义：OBSERVE，接口数值已固定但附件未证明标签。
- EDL 直接写入 Cap 基础可编辑轨：UNKNOWN，当前只有媒体渲染和上层覆盖写入。

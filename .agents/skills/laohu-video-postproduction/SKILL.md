---
name: laohu-video-postproduction
description: 第二遍 Cap 正式录制完成后，接收单条教学视频制作任务包，冻结 EDL 与 S2→T2 映射，路由字幕、Remotion、RunningHub 数字人和 Cap 上层覆盖轨，并在同一独立任务中持续返工。第一遍自由录制不得使用本 Skill。
---

# 老胡教学视频后期总装

**声音定路，画面作证。** 第二遍最终声音决定成片时间；字幕、动画和数字人只能解释、证明或承接这条主线。完整信息和可追溯性优先于盲目压短；覆盖效果优先放在上层，不以破坏底层录制换取方便。

**剪辑不是把素材排进时间轴，而是让观众只走一条路。** 后期先确定这条视频许诺观众什么、观众从哪里进入、最后带走什么，再决定删哪一句、补哪幅画面。技术任务齐全不等于作品成立。

## 边界与权威

- 第一遍自由录制属于“老胡文稿”。上游只调用 `scripts/cap-project-asr.mjs`，本 Skill 必须拒绝第一遍任务。
- 第二遍正式录制后，每条视频建立一个独立 Codex 任务。上游只创建并发送首份任务包，之后由老胡直接在该任务返工。
- `S2` 是第二遍源时间，`T2` 是冻结 EDL 后的成片时间。所有覆盖任务只写 `T2`；第一遍 `F1` 永不进入成片映射。
- 任务包唯一契约和状态见 [handoff-contract.md](references/handoff-contract.md)。先运行 `node scripts/postproduction-package.mjs validate <package.json>`。
- 任务包必须先写 `intent`、`knowledgeActivations` 和每个覆盖任务的 `narrative`。没有观众变化、媒介理由和前后交接的任务，即使时码与接口正确，也不能进入制作。

## 按需读取知识

- 设计整条后期链与交付状态时，读 `workflows/laohu-video/规范/制作流程.md`。
- 判断画面是否真正补充口播、选用什么视觉形式时，读 `workflows/laohu-video/规范/画面补充策略.md` 与 `workflows/laohu-video/规范/画面表达规则.md`。
- 进入最终观看验收时，读 `workflows/laohu-video/规范/质检清单.md`。
- 只有需要向外部模型或其他项目交付生成指令时，才读 `workflows/laohu-video/规范/提示词模板.md`；它不是内部后期策划模板。

读取后留下内部激活回执：触发原因、取得的判断、改变或确认的具体决定、落点和未采用边界。只写“参考了某文件”不算激活。

## 必要运行链

```text
RECEIVED
→ 第二遍 Cap 新 ASR
→ 观众、承诺、主线、主胜负手与视觉策略
→ 粗剪 EDL
→ 内容导演精剪 EDL
→ 剪辑疑难确认
→ EDL_FROZEN（Cap revision + EDL hash + S2→T2 hash）
→ Remotion / 数字人 / 录屏 / 证据 / AI 视频并行制作
→ Cap Motion 上层覆盖写入
→ 修正 SRT 与展示字幕
→ REVIEW
→ DELIVERED 或 FAILED
```

任一步都必须给下一步留下可验证产物。EDL 或 Cap revision 改变时，旧覆盖计划作废并重新映射；不得在过期时间轴上“挪一挪继续用”。

整条视频还必须有一条可复述的观看路径。相邻任务的 `handoffOut` 必须能被下一任务的 `handoffIn` 接住；同一种信息已经由录屏或证据承担时，不再用动画重复解释。删除、调换或替换一个覆盖任务而不影响理解，说明它只是装饰，不是章法的一部分。

## 材料怎样变成画面

| 任务 | 改变观众什么 | 使用条件与材料 | 开始—变化—收束 | 错用风险 |
| --- | --- | --- | --- | --- |
| `SCREEN_RECORDING` | 看清真实操作 | 第二遍录屏、操作语句、指针状态 | 先定位界面，再完成动作，最后停在结果 | 乱序会让操作状态断裂 |
| `EVIDENCE` | 相信结论 | 截图、数据、出处与引用位置 | 先提出判断，再显证据，最后回扣结论 | 无出处会把推测伪装成事实 |
| `REMOTION` | 看懂对象关系与变化 | 完整批注、ASR、前后文、素材 | 承接前镜、逐步变化、停在可读收束帧 | 平均铺效果会喧宾夺主 |
| `AVATAR` | 保持人物讲述连续性 | T2 对应的最终真实音频、连续组 | 延续前姿态、完成一段语义、在自然边界收束 | 按 40 秒机械截断会断句和跳姿态 |
| `AI_VIDEO` | 建立情绪或场景入口 | 已验收外部成片与用途 | 清楚进入、服务主线、及时退出 | 漂亮但无关系会抢走信息焦点 |

`REMOTION` 必须调用 `laohu-animation-director`；`AVATAR` 必须调用 `runninghub-avatar`；字幕分别调用 `correct-srt-subtitles` 和 `burn-subtitles`。

每个任务都要说明：它承接什么、要把观众从什么状态带到什么状态、为什么当前媒介比口播或现有画面更合适、把什么结果交给下一段。技法名称、任务类型和时间范围不能代替这些判断。

## 法度与验收

- 输入任务包必须是 `laohu.video-postproduction-handoff/1`，phase 固定 `SECOND_PASS_POSTPRODUCTION`。
- 底层原始录制与最终主音频必须保留；媒体在仓库外，仓库内只存文字记录和索引。
- 程序动画唯一引擎是 Remotion；外部数字人和 AI 视频是覆盖素材，不冒充 Remotion 源动画。
- 上层写入前用 `verifyFrozenPackageFiles()` 复核 EDL 与映射哈希，再用 `buildOverlayCommandPlan()` 和 `executeOverlayCommandPlan()` 执行 revision-safe Motion 命令；revision 冲突立即失败，不覆盖新修改。
- 硬校验通过只证明规格成立。还必须观看检查口播自然、节奏、焦点、动画克制和数字人连续性。
- 底线门检查可播放、可追溯、时码与接口正确；巅峰门检查主线、观众变化、关键材料、跨段承接、专业知识增益和最强段落。两道门必须分别给出结论。
- 关键段落存在真实表达取舍时，比较至少两个方向不同的候选；只换颜色、词序和组件皮肤不算候选。
- 如果仍有一个已知、可执行并会明显提高主胜负手的修改，不能因为任务包、渲染和 Cap 写入已经成功就交付。
- 最终回传实际输入、产物路径、revision、哈希、测试、失败项和 `PASS / OBSERVE / FAIL / UNKNOWN`。

## 失败回传

使用稳定错误码，不隐瞒缺口：`WRONG_PHASE`、`CAP_REVISION_CONFLICT`、`EDL_NOT_FROZEN`、`MAPPING_STALE`、`REMOTION_ANNOTATION_INCOMPLETE`、`AVATAR_SEGMENT_TOO_LONG`、`RUNNINGHUB_FAILED`、`MEDIA_QA_FAILED`。只重试失败资产，不整批无脑重跑。

## 反馈进化

收到失败或反馈时，依次记录：现象 → 根因属于方向/链路/材料/规格哪一层 → 可证伪假设 → 修改最接近根因的唯一权威 → 回归当前、旧任务和相邻任务 → 标记 `KEEP / OBSERVE / REVERT`。一次反馈不能直接变成无边界永久禁令。

项目级规则修改不由本 Skill 自行沉淀，交给 `laohu-video-evolution`。写回前用 `validateEvolutionRecord()`（`scripts/evolution-record.mjs`）验证记录；回归必须分别覆盖当前失败、旧能力保护和相邻任务，不能用三个同类新案例冒充保真。

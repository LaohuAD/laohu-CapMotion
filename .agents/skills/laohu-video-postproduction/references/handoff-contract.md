# 第二遍后期任务包契约

## 必须字段

```json
{
  "schema": "laohu.video-postproduction-handoff/1",
  "videoId": "稳定视频 ID",
  "phase": "SECOND_PASS_POSTPRODUCTION",
  "intent": {
    "audience": "最终观众及其观看处境",
    "promise": "这条视频向观众兑现什么",
    "mainLine": "从开头到结尾唯一的理解路径",
    "primaryWin": "本条视频最该赢的一点",
    "visualStrategy": "什么内容交给原画面、录屏、证据、动画或数字人"
  },
  "knowledgeActivations": [{
    "asset": "被激活的 Skill 或 Reference",
    "trigger": "为什么此刻需要",
    "judgment": "从中取得了什么判断",
    "changedDecision": "改变或确认了哪个具体决定",
    "resultLocation": "该决定落在何处",
    "unusedBoundary": "哪些内容本轮没有采用"
  }],
  "thread": {"ownership": "DEDICATED_VIDEO_TASK", "upstreamCreatesOnce": true},
  "capProject": {"path": "/absolute/second.cap", "expectedRevision": 0},
  "sources": {
    "secondPassAsr": "/absolute/cap-asr.raw.json",
    "productionScript": "/absolute/production-script.json",
    "finalMainAudio": "/absolute/final-main-audio.wav"
  },
  "edit": {
    "edlPath": "/absolute/final.edl.json",
    "sourceToFinalMapPath": "/absolute/source-to-final.json"
  },
  "protection": {
    "preserveBaseRecording": true,
    "preserveFinalMainAudio": true,
    "mediaOutsideRepository": true
  },
  "tasks": []
}
```

任务可用 `BASE / SCREEN_RECORDING / EVIDENCE / REMOTION / AVATAR / AI_VIDEO`。每项必须有唯一 `id`、冻结成片 `finalRange` 与 `narrative`：

```json
{
  "narrative": {
    "purpose": "UNDERSTAND / TRUST / ACT / FEEL / TRANSITION",
    "viewerBefore": "进入这段前观众知道或误解什么",
    "viewerAfter": "离开这段后观众能理解、相信、感受或做到什么",
    "whyThisMedium": "为什么必须使用当前画面形式，而不是口播或现有画面",
    "handoffIn": "承接前段的什么问题、动作或视觉状态",
    "handoffOut": "把什么结果、压力或视线交给下一段"
  }
}
```

相邻任务的交接必须构成一条连续观看路径。存在时间空档不等于断裂，但前一段的结果必须能解释下一段为何出现。

`REMOTION.annotation` 只保存动画独有信息，必须包含：`object`、`relationship`、`entrance`、`change`、`resolutionFrame`、非空 `materials` 和 `acceptance`。观众前后状态、媒介理由和前后交接以任务 `narrative` 为唯一权威，不在 annotation 复制。

`AVATAR` 必须由 `FINAL_MAIN_AUDIO` 驱动，带 `mapRef`、`continuity.group` 和 `continuity.order`。单个上传片段不超过 40 秒；任务范围更长时必须提供 `semanticBoundaries`，并确保每个自然语义子段都不超过 40 秒。

## 状态

`RECEIVED → ASR_READY → EDIT_REVIEW → EDL_FROZEN → ASSETS_BUILDING → CAP_APPLIED → REVIEW → DELIVERED`。任何阶段可进入 `FAILED`，失败记录必须保留 task/segment ID、脱敏错误、可重试性和已完成资产。

## 冻结与失效

冻结前先运行任务包校验。`intent`、知识激活或任务叙事缺失属于内容设计失败，不得以“后面制作时再补”为由绕过。

运行：

```bash
node scripts/postproduction-package.mjs validate /absolute/package.json
node scripts/postproduction-package.mjs freeze /absolute/package.json /absolute/frozen.json
```

冻结记录 `projectRevision`、`edlSha256` 与 `mappingSha256`。Cap revision、EDL 内容或映射内容任一改变，覆盖计划立即失效。

数字人音频必须从冻结包导出，不接受任意音频路径：

```bash
node scripts/avatar-audio-jobs.mjs \
  --package /absolute/frozen.json \
  --output-dir /absolute/task-temp/avatar-audio
```

覆盖写入前再次运行 `verifyFrozenPackageFiles()`；随后由 `buildOverlayCommandPlan()` 建立连续 revision 计划，再由 `executeOverlayCommandPlan()` 逐步执行 Cap Motion 命令。任何一步 revision 不符合预期都停止，不继续写入后续轨道。

数字人和 AI 视频先运行 `generated-asset-qa.mjs`。脚本读取真实媒体而不是信任手填宽高，硬校验时长、分辨率和横屏；口型、人物一致性、首尾姿态与连续衔接仍需观看，`manualStatus` 未改为 `PASS` 前覆盖计划拒绝写入。

命令行执行：

```bash
CAP_BIN=/absolute/cap node scripts/postproduction-package.mjs \
  apply /absolute/frozen.json /absolute/assets.json
```

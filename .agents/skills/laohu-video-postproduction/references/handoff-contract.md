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
  "capProject": {
    "sourcePath": "/absolute/second-original.cap",
    "path": "/absolute/second-edited.cap",
    "expectedRevision": 0,
    "nonDestructiveCopy": true
  },
  "sources": {
    "secondPassAsr": "/absolute/cap-asr.raw.json",
    "productionScript": "/absolute/production-script.json",
    "finalMainAudio": "/absolute/final-main-audio.wav"
  },
  "edit": {
    "edlPath": "/absolute/final.edl.json",
    "sourceToFinalMapPath": "/absolute/source-to-final.json",
    "captionTracks": {
      "sourceMasterPath": "/absolute/source-captions.json",
      "displayTracksPath": "/absolute/final-bilingual-cap-tracks.json",
      "mode": "SEPARATE_BILINGUAL",
      "tracks": ["zh-CN", "en"]
    },
    "preEditReview": {
      "documentPath": "/absolute/full-pre-edit-review.md",
      "fullTimelineCovered": true,
      "segmentBoundariesIncluded": true,
      "virtualRoughCutComplete": true,
      "virtualFineCutComplete": true,
      "provisionalFinalTimelineIncluded": true,
      "crossCueSemanticReviewComplete": true,
      "atomicTermsPreserved": true,
      "uncertaintiesResolved": true,
      "userApproval": {
        "status": "APPROVED",
        "reference": "可追溯的用户确认回执"
      }
    }
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

`narrative.purpose=UNDERSTAND` 且任务类型为 `REMOTION / AI_VIDEO` 时，还必须提供 `knowledgeVisual`：

```json
{
  "knowledgeVisual": {
    "contractId": "kvc-001",
    "segmentId": "remotion-001",
    "spokenClaim": "本段口播正在证明的唯一主张",
    "viewerBefore": "观众进入前的未知或误解",
    "viewerAfter": "观众离开后能复述的理解",
    "knowledgeType": "DEFINITION / CAUSE / PROCESS / COMPARE / HIERARCHY / FEEDBACK / BOUNDARY",
    "entities": ["真正参与关系的语义对象"],
    "initialState": "动画开始前可见的关系状态",
    "interaction": "谁以什么方式作用于谁",
    "stateChanges": ["不可跳步的可见变化"],
    "resultState": "作用完成后留下的状态",
    "viewerInference": "观众应根据画面自己得出的关系或结论",
    "semanticAnchors": [{"spokenCue": "口播语义触发", "visualEvent": "对应的画面事件"}],
    "labelPlan": [{"text": "少量中文大标签", "target": "标签对象", "responsibility": "身份 / 动作 / 结果 / 边界"}],
    "cameraPurpose": "摄影机或视窗如何显露层级、路径、交接或焦点",
    "carrierDecision": "REMOTION_OVERLAY / AI_VIDEO_FULL",
    "silentTest": "静音时如何验收对象、作用、状态和结果",
    "audioSyncTest": "哪个口播语义触发哪个画面变化"
  }
}
```

`segmentId` 必须与任务 `id` 一致。`knowledgeVisual.viewerBefore / viewerAfter` 从任务 `narrative` 继承同一观众变化，可以为知识视觉补足对象与关系，但不得改成另一个承诺。`REMOTION` 任务的 `carrierDecision` 必须为 `REMOTION_OVERLAY`，`AI_VIDEO` 必须为 `AI_VIDEO_FULL`。`labelPlan` 可为空数组，但如果使用文字，只保留少量标题级中文和短标注；不把长句、密集小字、随机英文或乱码写入生成画面。合同缺失或字段不完整时返回 `KNOWLEDGE_VISUAL_CONTRACT_INCOMPLETE`。

每个 `REMOTION` 任务必须提供 `overlayContinuity`：

```json
{
  "overlayContinuity": {
    "groupId": "同一连续语义组",
    "order": 1,
    "role": "NAVIGATION / EXPLANATION / EVIDENCE / CONCLUSION / BRIDGE",
    "hostCarrier": "BASE / SCREEN_RECORDING / AVATAR / EVIDENCE / AI_VIDEO_FULL",
    "persistence": "SEGMENT / ACROSS_CUT / UNTIL_SECTION_END",
    "stateBefore": "进入本段前同一信息层的状态",
    "stateUpdate": "本段发生的唯一状态更新",
    "stateAfter": "交给下一段的状态",
    "contrastMode": "NONE / LOCAL_BACKPLATE / REGIONAL_SCRIM / FULL_SCRIM",
    "contrastReason": "依据真实底画可读性选择，不以出现Remotion为理由",
    "attentionPlan": [{"spokenCue": "语义触发", "focusOwner": "HOST / OVERLAY / EVIDENCE", "target": "唯一第一焦点", "reason": "为何此刻看它"}],
    "protectedRegions": [{"target": "FACE / HANDS / SUBTITLES / SOURCE_UI / AI_VISUAL_ANCHOR", "description": "不可覆盖的具体区域或轨迹"}],
    "handoff": "怎样把状态和第一注意力交给下一段"
  }
}
```

同一 `groupId` 的 `order` 必须连续，后一任务的 `stateBefore` 必须等于前一任务的 `stateAfter`。`contrastMode` 使用最低充分对比：底画已经够暗时合法值是 `NONE`；局部冲突优先 `LOCAL_BACKPLATE / REGIONAL_SCRIM`；只有全幅持续干扰时才允许 `FULL_SCRIM`。

当 `hostCarrier=AI_VIDEO_FULL` 时，`overlayContinuity` 还必须含：

```json
{
  "hostCompatibility": {
    "visualAnchor": "AI视频必须完整保留的语义动作、路径和结果",
    "stableNegativeSpace": "可叠加区域与成立时段；没有则明确写无",
    "luminanceProfile": "起始、过程、结果的亮度变化",
    "motionLoad": "各阶段运动负荷及来源",
    "forbiddenOverlayWindows": ["AI画面独占注意力、禁止新增叠层的时段"],
    "attentionHandoff": "何时从AI视频交给Remotion，何时交回",
    "actualPixelReview": "PENDING / PASS / FAIL"
  }
}
```

这份合同可以继承老胡AI视觉的生成前预判，但真实视频到位后必须重新观看；预判与真实像素冲突时以后者为准。

`REMOTION.annotation` 只保存动画独有信息，必须包含：`object`、`relationship`、`entrance`、`change`、`resolutionFrame`、非空 `materials` 和 `acceptance`。观众前后状态、媒介理由和前后交接以任务 `narrative` 为唯一权威，不在 annotation 复制。

`AVATAR` 必须由 `FINAL_MAIN_AUDIO` 驱动，带 `mapRef`、`continuity.group` 和 `continuity.order`。单个上传片段不超过 40 秒；任务范围更长时必须提供 `semanticBoundaries`，并确保每个自然语义子段都不超过 40 秒。

## 状态

`RECEIVED → ASR_READY → VIRTUAL_ROUGH_CUT → VIRTUAL_FINE_CUT → PRE_EDIT_REVIEW → PRE_EDIT_REVIEW_APPROVED → EDL_FROZEN → ASSETS_BUILDING → CAP_APPLIED → REVIEW → DELIVERED`。预剪辑审稿必须给出完整源片覆盖、逐候选片段决定和带目标时码的预期成片字幕时间轴；疑难未清零或没有用户批准时，不得进入 `EDL_FROZEN`。任何阶段可进入 `FAILED`，失败记录必须保留 task/segment ID、脱敏错误、可重试性和已完成资产。

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

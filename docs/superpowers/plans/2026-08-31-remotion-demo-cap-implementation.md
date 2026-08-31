# Cap Remotion 经典案例演示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在指定的约 27 秒 Cap 工程中非破坏性加入四段可预览、可继续调整的 Remotion 经典动画案例。

**Architecture:** 复用项目统一 Remotion workspace，以 Cap Motion definition + segment 描述动画，以 `cap motion render` 生成工程内部透明预览缓存。底层 recording timeline 和全部媒体保持不变，所有写入通过 revision-safe CLI 顺序执行。

**Tech Stack:** Cap Rust CLI、Cap `.cap` JSON 工程格式、Remotion 4、React 19、Zod schema、VP8 Alpha 预览缓存。

---

## 文件边界

- 修改：`/Users/a1/Library/Application Support/so.cap.desktop.dev/recordings/Mi Monitor (Area) 2026-08-30 06.23 PM.cap/project-config.json` — 追加 Motion definitions、segments 和 artifacts。
- 创建：`/Users/a1/Library/Application Support/so.cap.desktop.dev/recordings/Mi Monitor (Area) 2026-08-30 06.23 PM.cap/.codex-backup/remotion-demo-2026-08-31/` — 仅保存写入前的小型 JSON 配置备份。
- 创建：`/Users/a1/Library/Application Support/so.cap.desktop.dev/recordings/Mi Monitor (Area) 2026-08-30 06.23 PM.cap/motion/cache/` — Cap CLI 按内容哈希生成的预览缓存。
- 不修改：`recording-meta.json`、`content/segments/**`、录屏、摄像头、麦克风和系统声音媒体。
- 复用：`/Volumes/Laohu_Work/项目/老胡画面讲解/workflows/laohu-video/模板/remotion-assets/workspace/` — 唯一 Remotion workspace。

### Task 1: 写入前保护与基线验证

- [x] **Step 1: 验证工程时长、revision 和空 Motion 轨**

Run:

```bash
jq '{projectRevision, timelineSegments: .timeline.segments, motion: .motion}' '/Users/a1/Library/Application Support/so.cap.desktop.dev/recordings/Mi Monitor (Area) 2026-08-30 06.23 PM.cap/project-config.json'
```

Expected: `projectRevision` 为当前最新值；两个 recording segment 总时长约 `27.084917` 秒；Motion definitions、segments、artifacts 均为空。

- [x] **Step 2: 创建小型配置备份**

Run:

```bash
mkdir -p '/Users/a1/Library/Application Support/so.cap.desktop.dev/recordings/Mi Monitor (Area) 2026-08-30 06.23 PM.cap/.codex-backup/remotion-demo-2026-08-31'
cp '/Users/a1/Library/Application Support/so.cap.desktop.dev/recordings/Mi Monitor (Area) 2026-08-30 06.23 PM.cap/project-config.json' '/Users/a1/Library/Application Support/so.cap.desktop.dev/recordings/Mi Monitor (Area) 2026-08-30 06.23 PM.cap/.codex-backup/remotion-demo-2026-08-31/project-config.json'
cp '/Users/a1/Library/Application Support/so.cap.desktop.dev/recordings/Mi Monitor (Area) 2026-08-30 06.23 PM.cap/recording-meta.json' '/Users/a1/Library/Application Support/so.cap.desktop.dev/recordings/Mi Monitor (Area) 2026-08-30 06.23 PM.cap/.codex-backup/remotion-demo-2026-08-31/recording-meta.json'
```

Expected: 两个备份文件存在且非空。

- [x] **Step 3: 验证 Remotion workspace**

Run:

```bash
npm test -- --run
npm run typecheck
npm run compositions
```

Working directory:

```text
/Volumes/Laohu_Work/项目/老胡画面讲解/workflows/laohu-video/模板/remotion-assets/workspace
```

Expected: 测试和类型检查通过；输出包含 `KineticStatement`、`CompareTransform`、`FlowNodeGraph`、`EvidenceBoard`。

### Task 2: 注册四个 Remotion definition

- [x] **Step 1: 注册 `KineticStatement` definition**

使用当前 `projectRevision` 调用：

```bash
./target/debug/cap motion definition register "$CAP_PROJECT" --expected-revision "$REV" --id demo-kinetic-statement --version 1 --source 'laohu-remotion-workspace/KineticStatement' --composition-id KineticStatement --status approved --min-duration 2 --default-duration 6 --max-duration 12 --default-policy responsive --default-props-json '{"component":"KineticStatement","mode":"claim","title":"一条清楚的内容主线","subtitle":"先讲结论 再给证据 最后给行动","conclusion":"让观众知道重点 也知道下一步","communicationGoal":"remember","emotionalTone":"energetic","informationShape":"transformation","motionIntensity":"high","stylePreset":"momentum","renderMode":"standalone","durationInFrames":180,"items":[{"id":"conclusion","label":"先讲结论","description":"第一秒建立方向","status":"active","source":{"type":"illustrative","confidence":"illustrative"}},{"id":"evidence","label":"再给证据","description":"用关系和事实支撑","status":"default","source":{"type":"illustrative","confidence":"illustrative"}},{"id":"action","label":"最后给行动","description":"让观众知道怎么做","status":"positive","source":{"type":"illustrative","confidence":"illustrative"}}],"links":[{"from":"conclusion","to":"evidence"},{"from":"evidence","to":"action"}],"highlightOrder":["conclusion","evidence","action"],"supportingLabels":["KineticStatement"]}' --json
```

Expected: `ok: true`，revision 增加 1。

- [x] **Step 2: 注册 `CompareTransform` definition**

使用最新 revision 和以下关键 props：

```json
{
  "component": "CompareTransform",
  "mode": "wrong-right",
  "title": "同样的信息 两种表达结果",
  "subtitle": "不是堆得越多越专业 而是关系越清楚越容易理解",
  "conclusion": "删掉噪音 把关系讲明白",
  "communicationGoal": "compare",
  "emotionalTone": "satisfying",
  "informationShape": "comparison",
  "motionIntensity": "medium",
  "stylePreset": "clear",
  "renderMode": "standalone",
  "durationInFrames": 180,
  "items": [
    {"id":"wrong","label":"信息堆叠","description":"文字很多 重点却不清楚","status":"negative","source":{"type":"illustrative","confidence":"illustrative"}},
    {"id":"right","label":"关系清楚","description":"观众一眼看懂先后与重点","status":"positive","source":{"type":"illustrative","confidence":"illustrative"}}
  ],
  "links": [{"from":"wrong","to":"right","label":"重新组织"}],
  "highlightOrder": ["wrong","right"],
  "supportingLabels": ["CompareTransform"]
}
```

Expected: `ok: true`，revision 增加 1。

- [x] **Step 3: 注册 `FlowNodeGraph` definition**

使用最新 revision 和以下关键 props：

```json
{
  "component": "FlowNodeGraph",
  "mode": "linear",
  "title": "把复杂问题变成一条可执行路径",
  "subtitle": "每一步都接住上一步的结果",
  "conclusion": "问题 判断 方案 结果",
  "communicationGoal": "explain",
  "emotionalTone": "futuristic",
  "informationShape": "sequence",
  "motionIntensity": "medium",
  "stylePreset": "tech",
  "renderMode": "standalone",
  "durationInFrames": 180,
  "items": [
    {"id":"problem","label":"问题","description":"先定位真正卡点","status":"active","source":{"type":"illustrative","confidence":"illustrative"}},
    {"id":"judge","label":"判断","description":"明确取舍标准","status":"default","source":{"type":"illustrative","confidence":"illustrative"}},
    {"id":"plan","label":"方案","description":"形成可执行步骤","status":"default","source":{"type":"illustrative","confidence":"illustrative"}},
    {"id":"result","label":"结果","description":"留下可验证产物","status":"positive","source":{"type":"illustrative","confidence":"illustrative"}}
  ],
  "links": [
    {"from":"problem","to":"judge"},
    {"from":"judge","to":"plan"},
    {"from":"plan","to":"result"}
  ],
  "highlightOrder": ["problem","judge","plan","result"],
  "supportingLabels": ["FlowNodeGraph"]
}
```

Expected: `ok: true`，revision 增加 1。

- [x] **Step 4: 注册 `EvidenceBoard` definition**

使用最新 revision 和以下关键 props：

```json
{
  "component": "EvidenceBoard",
  "mode": "claim-evidence",
  "title": "观点不能只靠一句话成立",
  "subtitle": "让现象 证据和结论在同一张画面里互相支撑",
  "conclusion": "先看现象 再核证据 最后下结论",
  "communicationGoal": "prove",
  "emotionalTone": "confident",
  "informationShape": "hierarchy",
  "motionIntensity": "medium",
  "stylePreset": "editorial",
  "renderMode": "standalone",
  "durationInFrames": 180,
  "items": [
    {"id":"phenomenon","label":"现象","description":"先把观察对象说清楚","status":"active","source":{"type":"illustrative","confidence":"illustrative"}},
    {"id":"evidence","label":"证据","description":"检查来源和对应关系","status":"default","source":{"type":"illustrative","confidence":"illustrative"}},
    {"id":"conclusion","label":"结论","description":"只得出证据能支持的判断","status":"positive","source":{"type":"illustrative","confidence":"illustrative"}}
  ],
  "links": [
    {"from":"phenomenon","to":"evidence","label":"核验"},
    {"from":"evidence","to":"conclusion","label":"支持"}
  ],
  "highlightOrder": ["phenomenon","evidence","conclusion"],
  "supportingLabels": ["EvidenceBoard"]
}
```

Expected: `ok: true`，revision 增加 1。

### Task 3: 写入四个 Motion segment

- [x] **Step 1: 按最新 revision 依次添加四段**

Run:

```bash
./target/debug/cap motion add "$CAP_PROJECT" --expected-revision "$REV" --definition-id demo-kinetic-statement --definition-version 1 --segment-id remotion-demo-kinetic --start 0.5 --duration 6 --track 0 --z-index 100 --duration-policy responsive --json
./target/debug/cap motion add "$CAP_PROJECT" --expected-revision "$REV" --definition-id demo-compare-transform --definition-version 1 --segment-id remotion-demo-compare --start 7 --duration 6 --track 0 --z-index 100 --duration-policy responsive --json
./target/debug/cap motion add "$CAP_PROJECT" --expected-revision "$REV" --definition-id demo-flow-node-graph --definition-version 1 --segment-id remotion-demo-flow --start 13.5 --duration 6 --track 0 --z-index 100 --duration-policy responsive --json
./target/debug/cap motion add "$CAP_PROJECT" --expected-revision "$REV" --definition-id demo-evidence-board --definition-version 1 --segment-id remotion-demo-evidence --start 20 --duration 6 --track 0 --z-index 100 --duration-policy responsive --json
```

Before each command, refresh `REV` from `project-config.json` rather than reusing the first value.

Expected: 四条命令均 `ok: true`；Motion segment 时间分别为 `0.5–6.5`、`7–13`、`13.5–19.5`、`20–26`，全部位于工程总时长内。

### Task 4: 渲染并挂接四份透明预览

- [x] **Step 1: 按最新 revision 依次渲染 preview**

Run for each segment:

```bash
./target/debug/cap motion render "$CAP_PROJECT" --expected-revision "$REV" --segment remotion-demo-kinetic --quality preview --workspace "$REMOTION_WORKSPACE" --json
./target/debug/cap motion render "$CAP_PROJECT" --expected-revision "$REV" --segment remotion-demo-compare --quality preview --workspace "$REMOTION_WORKSPACE" --json
./target/debug/cap motion render "$CAP_PROJECT" --expected-revision "$REV" --segment remotion-demo-flow --quality preview --workspace "$REMOTION_WORKSPACE" --json
./target/debug/cap motion render "$CAP_PROJECT" --expected-revision "$REV" --segment remotion-demo-evidence --quality preview --workspace "$REMOTION_WORKSPACE" --json
```

Before each command, refresh `REV`.

Expected: 每条返回 `artifact.status: ready`；生成非空的 `motion/cache/<hash>/preview.webm`；artifact 为 `960×540`、30 fps、带 Alpha。

### Task 5: 工程和画面回归验证

- [x] **Step 1: 校验 Cap 工程结构**

Run:

```bash
jq '{projectRevision, recordingSegments: .timeline.segments, zoomSegments: .timeline.zoomSegments, definitions: .motion.definitions, segments: .motion.segments, artifacts: .motion.artifacts}' "$CAP_PROJECT/project-config.json"
```

Expected: 原 recording segments 和 zoom segment 不变；4 definitions、4 segments、4 ready preview artifacts 存在。

- [x] **Step 2: 校验缓存媒体**

Run:

```bash
find "$CAP_PROJECT/motion/cache" -name preview.webm -type f -size +0 -print
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate:format=duration -of json '<each-preview.webm>'
```

Expected: 4 个非空预览；VP8、约 960×540、30 fps、时长约 6 秒。

- [x] **Step 3: 抽取四张中段帧进行视觉自检**

Run for each preview:

```bash
ffmpeg -y -ss 3 -i '<preview.webm>' -frames:v 1 '/tmp/remotion-demo-<name>.png'
```

Expected: 四张图分别能辨认重点标题、对比、流程、证据板；无明显裁切、遮挡或中文断行。

- [x] **Step 4: 完成后状态记录**

检查目标工程路径、最终 revision、4 个 segment 时间、4 个 artifact 路径和验证结果。若任何写入或渲染失败，停止继续写入并从 `.codex-backup/remotion-demo-2026-08-31/project-config.json` 恢复配置。

本任务不提交 Git：当前仓库已有大量未提交用户改动，且主要交付物位于用户指定的外部 Cap 工程；避免把无关修改混入提交。

## 执行记录

- 2026-08-31：全部任务完成，目标工程 revision 从 `1` 增至 `13`。
- 4 个 preview 均由 `cap motion render` 返回 `ready`，每份为 `960×540`、30 fps、6 秒并带 Alpha；缓存文件均为非空 WebM。
- 写入前后的 `.timeline` 逐字段比较一致，底层录屏、缩放和音频相关时间线未改变。
- 本机 Homebrew `ffprobe` 因仍链接 `libx265.216.dylib`、而本机只存在 `libx265.217.dylib` 无法启动；未擅自修复系统依赖。媒体容器改用 `file` 和非空校验，画面改用 Remotion `still` 在 15、90、165 帧验证。四个 Composition 的三个阶段帧哈希均不同，中段帧人工检查通过。

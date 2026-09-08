---
name: laohu-animation-director
description: 第二遍成片时间轴冻结后，把完整 REMOTION 批注转成可验证的 Remotion 组件配置、预览和上层 Cap Motion 覆盖。用于解释关系、过程、对比和证据。
---

# 老胡 Remotion 动画导演

**口播讲路，动画显理。** 先保护观众要理解的关系，再决定形式；能用一次清楚的变化说明，就不平均铺满特效。画面必须补充口播的结构、证据或操作，不能只把原话换成大字。

**先看关系，再看效果。** 动画最先回答的不是“怎么动”，而是观众原来误解什么、看完以后多懂了哪一层关系。形式、组件和特效只能服务这次变化。

## 读取材料

先读当前作品控制文档、制作脚本、目标时间段 ASR、前后文和素材索引，再读：

- `workflows/laohu-video/规范/画面表达规则.md`
- `workflows/laohu-video/规范/组件设计方法论.md`
- `workflows/laohu-video/规范/组件规则.md`
- 选中组件对应的 `workflows/laohu-video/模板/components/` 说明

其他规范不得全量默认读取。必须按 [动画知识路由与激活](references/动画知识路由与激活.md) 的触发条件选择，并留下激活回执。实现知识以 `remotion-best-practices` 为唯一外部入口，再由它路由内部 Markup、Interactivity、Rendering 或 Captions 页面；不把这些外部知识当作第二套项目审美规则。

## 输入闸门

只接受 `T2` 冻结成片时间段。通用观众变化、媒介理由和前后承接只从任务 `narrative` 读取；`REMOTION.annotation` 只负责动画独有的解释对象、对象关系、进入方式、变化过程、收束画面、材料和验收。不得在两处复制同一判断形成双重权威。只写“这里做动画”时返回 `REMOTION_ANNOTATION_INCOMPLETE`，不靠后期猜。

当 `narrative.purpose=UNDERSTAND` 时，还必须接收上游 `KnowledgeVisualContract`：它保存本段主张、知识类型、语义对象、初态、作用、状态变化、结果、观众应得出的推论、口播—画面语义锚点、少量大标签、摄影机 / 视窗职责及静音与声画同步验收。`carrierDecision` 必须是 `REMOTION_OVERLAY`。合同缺失、对象只是题材图标、没有状态变化或没有语义锚点时，返回 `KNOWLEDGE_VISUAL_CONTRACT_INCOMPLETE`；`TRANSITION`等不承担知识证明的动画不强行虚构该合同。

每个 Remotion 任务还必须接收 `OverlayContinuityContract`。它负责同一语义信息层跨真人、录屏、数字人、证据和 `AI_VIDEO_FULL` 的状态连续：`groupId / order` 标识同一连续组，`stateBefore → stateUpdate → stateAfter` 形成状态机，后一段必须接住前一段结果。底画换了不等于语义重置；章节进度、证据标签或结论尚未完成时，应由同一组件家族在新底画上继续，而不是重新入场、换皮或归零。

当 `hostCarrier=AI_VIDEO_FULL` 时，还必须取得 `hostCompatibility`：视觉锚点、稳定负空间、亮度分布、运动负荷、禁止叠加窗口、注意力交接和真实像素复核状态。上游建议只能作为预判；最终位置和对比方式由本 Skill 对用户手动生成的真实视频合成复核后决定。缺失时返回 `AI_HOST_COMPATIBILITY_INCOMPLETE`。

通过 `animationBriefSchema` 验证批注：

```text
workflows/laohu-video/模板/remotion-assets/workspace/src/schemas/director.ts
```

## 必要章法

1. 先写一句观众变化：从什么误解、未知或疑问，走到什么可复述的理解；说不清时退回上游，不先选组件。
2. 把完整语义段拆成必要叙事节拍：承接、建立对象、作用触发、状态变化、结果收束、可读停留。知识段以 `semanticAnchors.spokenCue → visualEvent` 为节拍权威，通常是 3–7 个，但简单关系不为凑数扩写，复杂关系也不为守数字硬压。
3. 给上屏内容标 `asr / context / source-doc / editorial / illustrative`；`source-doc` 必须有引用。
4. 判断 `communicationGoal / emotionalTone / informationShape / motionIntensity`。
5. 按信息形状、沟通目标、容量、情绪、成熟度选择组件。关键位置存在真实取舍时，比较真正不同的表达方向；记录主胜负手、保留理由、否决理由和可观察增益，不把换颜色、换词序当作候选。
6. 再决定呈现方式。需要保留真人、录屏或证据素材时，优先使用 `presentation=overlay`、`renderMode=asset`，根据人脸、手势和底部字幕选择 `placement=left/right`；只有章节定场或必须独立理解的完整图解使用 `stage`。需要跨载体维持章节、证据、标签、数值或桥接状态时，优先调用可复用的 `EditorialOverlayShell`，按职责选择 `progress-rail / evidence-dock / label-stack / value-callout / bridge`，不为每条视频另造一次性组件。叠层不能和底画已有同类图解重复。
7. 再决定字体职务。知识段先按 `labelPlan` 把少量中文大标签就近绑定到对象，标签只负责身份、动作、结果或边界，不用密集小字、随机英文或乱码填充信息量。中文主标题、英文展示字、数字、英文眉题和中文正文不能共用一套字号/字重/字距；需要两行不同语义色时显式写 `titleLines`，不让组件按字数猜断行。参考成片没有字体源文件时只能选视觉近似，并在验收里保留这个事实边界。
8. 用 `accentRole` 表达语义：信息/过程用 `info`，成立/增长用 `success`，权威/价值用 `warning`，否决/风险用 `danger`，技术过程用 `technical`。不能为刷新画面随机换色。
9. 生成通过 Zod 的 `ComponentConfig`，绝对时码只放 `sourceTimeRange`，动画内部使用相对帧。把每个语义锚点映射为对应 `items.revealAtFrame`、状态替换或结果锁定帧，以完整语义点而不是平均间隔或逐词触发；未指定时保留组件自动错峰。已经进入的对象默认持续留到本段关系收束，除非脚本明确要求它被替换或否决。视窗移动只用于显露层级、跟随作用路径、从输入交接到结果或完成焦点转移；若没有学习增益则固定视窗。
10. 先审宿主画面再决定是否落动画：记录该时间段是否正在拖拽、点击、输入、播放证据或连续展示结果。真实操作已经承担解释时，拒绝用全幅知识动画覆盖；要么延后到稳定口播段，要么只做不遮挡操作对象的指示叠层。批准为全幅知识动画后，老胡教学视频默认使用 `FULL_SCRIM` 压暗完整宿主画面，让观众仍看得到原画上下文但把焦点交给关系动画；局部箭头、框选和操作标注仍按最低充分原则选择 `NONE / LOCAL_BACKPLATE / REGIONAL_SCRIM`。预览承接帧、变化中段、收束帧、最终停留和手机缩略图，并把透明叠层合成到真实底画抽查人脸、手势、证据、字幕和视觉锚点。知识段同时执行 `silentTest` 与 `audioSyncTest`：静音后仍能看出核心对象、作用、状态变化和结果；恢复口播后，画面变化必须在对应语义触发处发生，不抢跑也不滞后。先过可用底线，再判断焦点、节奏、信息增益和整片连续性。
11. 用 revision-safe `cap motion` 命令写入上层 Motion 轨；底层视频、录屏和主音频不变。

## 技法必须回答

每个被选择的动画技法都要记录：作用对象、要改变的理解/证据/情绪/行动、此处使用理由、所需材料、怎样进入/变化/收束、过量风险。例如“路径汇流”适合解释多来源进入一个决策，不适合仅为一句口号增加运动。

## 法度与审美验收

- 程序动画唯一引擎是 Remotion。输出仅 `standalone / asset / both`，接入方式是 Cap Motion 上层轨。
- 可复用编辑叠层以 `EditorialOverlayShell` 为统一壳；新增常用模式必须同步 schema、注册表、示例、组件说明和测试，避免同一种进度、证据或桥接信息反复翻新。
- 组件配置必须通过 Zod、TypeScript 和行为测试；事实、数字和案例必须可追溯。
- 视觉组件默认静音；只有明确交付独立有声片段时才带音频。
- 检查完整 1920×1080 帧和 390×219 缩略图：空白、遮挡、中文断行、焦点、关系误导和停留时间。
- 机械检查不能证明画面高级。还要观看判断动画是否抢口播、节奏是否拖、前后镜是否连续、收束画面是否让观众看懂。
- 如果仍有一个已知、可执行且会明显提高主胜负手的改法，不能因为 schema、测试和渲染已经通过就结束。

## 能力缺口

没有合适 schema 时，说明观众收益、缺少输入和兼容风险，再选择当前适配、升级组件、新组件或拒绝。升级必须同步 schema、注册表、示例和测试，不能降级为未登记的临时动画入口。

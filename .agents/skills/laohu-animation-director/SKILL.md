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

通过 `animationBriefSchema` 验证批注：

```text
workflows/laohu-video/模板/remotion-assets/workspace/src/schemas/director.ts
```

## 必要章法

1. 先写一句观众变化：从什么误解、未知或疑问，走到什么可复述的理解；说不清时退回上游，不先选组件。
2. 把完整语义段拆成必要叙事节拍：承接、建立对象、关系变化、结论收束、可读停留。通常是 3–7 个，但简单关系不为凑数扩写，复杂关系也不为守数字硬压。
3. 给上屏内容标 `asr / context / source-doc / editorial / illustrative`；`source-doc` 必须有引用。
4. 判断 `communicationGoal / emotionalTone / informationShape / motionIntensity`。
5. 按信息形状、沟通目标、容量、情绪、成熟度选择组件。关键位置存在真实取舍时，比较真正不同的表达方向；记录主胜负手、保留理由、否决理由和可观察增益，不把换颜色、换词序当作候选。
6. 生成通过 Zod 的 `ComponentConfig`，绝对时码只放 `sourceTimeRange`，动画内部使用相对帧。
7. 预览承接帧、变化中段、收束帧、最终停留和手机缩略图；先过可用底线，再判断焦点、节奏、信息增益和整片连续性。
8. 用 revision-safe `cap motion` 命令写入上层 Motion 轨；底层视频、录屏和主音频不变。

## 技法必须回答

每个被选择的动画技法都要记录：作用对象、要改变的理解/证据/情绪/行动、此处使用理由、所需材料、怎样进入/变化/收束、过量风险。例如“路径汇流”适合解释多来源进入一个决策，不适合仅为一句口号增加运动。

## 法度与审美验收

- 程序动画唯一引擎是 Remotion。输出仅 `standalone / asset / both`，接入方式是 Cap Motion 上层轨。
- 组件配置必须通过 Zod、TypeScript 和行为测试；事实、数字和案例必须可追溯。
- 视觉组件默认静音；只有明确交付独立有声片段时才带音频。
- 检查完整 1920×1080 帧和 390×219 缩略图：空白、遮挡、中文断行、焦点、关系误导和停留时间。
- 机械检查不能证明画面高级。还要观看判断动画是否抢口播、节奏是否拖、前后镜是否连续、收束画面是否让观众看懂。
- 如果仍有一个已知、可执行且会明显提高主胜负手的改法，不能因为 schema、测试和渲染已经通过就结束。

## 能力缺口

没有合适 schema 时，说明观众收益、缺少输入和兼容风险，再选择当前适配、升级组件、新组件或拒绝。升级必须同步 schema、注册表、示例和测试，不能降级为未登记的临时动画入口。

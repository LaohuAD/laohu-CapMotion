import type {ComponentConfig, VisualItem} from "../../schemas/components";

const sourcePath =
  "workflows/laohu-video/模板/remotion-assets/workspace/src/configs/examples/source-material.md";

const sourcedItems = (
  section: string,
  values: Array<{
    id: string;
    label: string;
    description?: string;
    status?: VisualItem["status"];
    revealAtFrame?: number;
    sourceSection?: string;
  }>,
): VisualItem[] =>
  values.map(({sourceSection, ...item}) => ({
    status: "default",
    ...item,
    source: {
      type: "source-doc",
      confidence: "confirmed",
      ref: `${sourcePath}#${sourceSection ?? section}`,
    },
  }));

const overlayContinuity: NonNullable<ComponentConfig["overlayContinuity"]> = {
  groupId: "flow-topology-demo",
  order: 1,
  role: "EXPLANATION",
  hostCarrier: "BASE",
  persistence: "SEGMENT",
  stateBefore: "关系尚未建立",
  stateUpdate: "沿真实连接逐步点亮节点",
  stateAfter: "流程关系完整并交给下一段",
  contrastMode: "LOCAL_BACKPLATE",
  contrastReason: "局部底板保证拓扑和文字可读，同时保留底画上下文",
  attentionPlan: [{
    spokenCue: "关系出现",
    focusOwner: "OVERLAY",
    target: "节点与连接边",
    reason: "叠层负责把真实流程关系明确画出",
  }],
  protectedRegions: [{target: "SUBTITLES", description: "底部字幕安全区"}],
  handoff: "完整路径交给下一段真实底画",
};

const base = {
  motionIntensity: "medium",
  stylePreset: "clear",
  renderMode: "standalone",
  presentation: "stage",
  placement: "center",
} as const;

export const flowNodeGraphExamples: Record<
  "workflow" | "branch" | "loop" | "overlay",
  ComponentConfig
> = {
  workflow: {
    ...base,
    component: "FlowNodeGraph",
    mode: "linear",
    title: "从选题到复盘的真实创作链",
    subtitle: "先锁定人群与场景，再用画面促成停留，最后回到反馈",
    conclusion: "复盘结果只改变下一条的一个变量",
    communicationGoal: "guide",
    emotionalTone: "satisfying",
    informationShape: "sequence",
    durationInFrames: 300,
    items: sourcedItems("场景-08：选题公式", [
      {id: "topic", label: "人群与情绪", description: "先锁定谁在什么场景下需要表达", revealAtFrame: 18, sourceSection: "场景-08：选题公式"},
      {id: "scene", label: "发生场景", description: "让观众能把自己放进去", revealAtFrame: 58, sourceSection: "场景-08：选题公式"},
      {id: "visual", label: "前三秒画面", description: "先让人停下来再继续看", revealAtFrame: 98, sourceSection: "场景-10：画面视频"},
      {id: "feedback", label: "真实反馈", description: "观察完播、互动、收藏与评论", revealAtFrame: 138, sourceSection: "场景-12：数据复盘"},
      {id: "next", label: "下一条只改一个变量", description: "把复盘结果带回下一次创作", status: "active", revealAtFrame: 178, sourceSection: "场景-12：数据复盘"},
    ]),
    links: [
      {from: "topic", to: "scene"},
      {from: "scene", to: "visual"},
      {from: "visual", to: "feedback"},
      {from: "feedback", to: "next"},
    ],
    highlightOrder: ["topic", "scene", "visual", "feedback", "next"],
  },
  branch: {
    ...base,
    component: "FlowNodeGraph",
    mode: "branch",
    title: "先判断问题，再选择解决路径",
    subtitle: "同一个起点可以分出不同任务，但每条边都要能说明去向",
    conclusion: "选择标准决定后续动作",
    communicationGoal: "choose",
    emotionalTone: "clear",
    informationShape: "network",
    durationInFrames: 330,
    items: sourcedItems("场景-12：数据复盘", [
      {id: "decision", label: "观察关键指标", description: "先确认反馈来自哪个窗口", status: "active", sourceSection: "场景-12：数据复盘"},
      {id: "surface", label: "只改标题", description: "只改变表面表达", sourceSection: "场景-12：数据复盘"},
      {id: "system", label: "改一个变量", description: "让下一条能验证具体原因", status: "positive", sourceSection: "场景-12：数据复盘"},
      {id: "effect", label: "反馈不稳定", description: "没有控制变量就无法复盘", sourceSection: "场景-12：数据复盘"},
      {id: "chain", label: "形成下一轮输入", description: "把结论带回下一条内容", sourceSection: "场景-12：数据复盘"},
    ]),
    links: [
      {from: "decision", to: "surface", label: "表面"},
      {from: "decision", to: "system", label: "根因"},
      {from: "surface", to: "effect"},
      {from: "system", to: "chain"},
    ],
    highlightOrder: ["decision", "surface", "system", "effect", "chain"],
  },
  loop: {
    ...base,
    component: "FlowNodeGraph",
    mode: "loop",
    title: "复盘结果回到下一条内容",
    subtitle: "反馈不是终点，而是下一轮唯一变量的输入",
    conclusion: "每轮只改一个关键变量",
    communicationGoal: "review",
    emotionalTone: "confident",
    informationShape: "sequence",
    durationInFrames: 300,
    items: sourcedItems("场景-12：数据复盘", [
      {id: "publish", label: "发布内容", description: "让内容进入真实反馈", revealAtFrame: 18, sourceSection: "场景-10：画面视频"},
      {id: "observe", label: "观察窗口", description: "看完播、互动、收藏与评论", revealAtFrame: 62, sourceSection: "场景-12：数据复盘"},
      {id: "review", label: "复盘信号", description: "找出最值得改的变量", status: "active", revealAtFrame: 106, sourceSection: "场景-12：数据复盘"},
      {id: "next", label: "下一条优化", description: "只改变一个关键变量", status: "positive", revealAtFrame: 150, sourceSection: "场景-12：数据复盘"},
    ]),
    links: [
      {from: "publish", to: "observe"},
      {from: "observe", to: "review"},
      {from: "review", to: "next"},
      {from: "next", to: "publish", label: "再跑一轮"},
    ],
    highlightOrder: ["publish", "observe", "review", "next"],
  },
  overlay: {
    ...base,
    component: "FlowNodeGraph",
    mode: "data-flow",
    renderMode: "asset",
    presentation: "overlay",
    stylePreset: "editorial-dark",
    placement: "right",
    accentRole: "technical",
    kicker: "DATA / FOUR LAYERS",
    title: "中间结果必须继续工作",
    subtitle: "叠层沿数据流保持状态，不把每一幕重新开场",
    conclusion: "底画切换，关系不归零",
    communicationGoal: "explain",
    emotionalTone: "futuristic",
    informationShape: "sequence",
    durationInFrames: 270,
    overlayContinuity,
    items: sourcedItems("编辑型信息叠层：四层运行链", [
      {id: "soul", label: "灵魂｜确定取舍", description: "决定观众变化", revealAtFrame: 18},
      {id: "structure", label: "筋骨｜建立章法", description: "保留输入与交接", revealAtFrame: 58},
      {id: "material", label: "血肉｜组织材料", description: "让真实证据进入", revealAtFrame: 98},
      {id: "form", label: "表皮｜完成法度", description: "收束为可观看结果", status: "active", revealAtFrame: 138},
    ]),
    links: [
      {from: "soul", to: "structure"},
      {from: "structure", to: "material"},
      {from: "material", to: "form"},
    ],
    highlightOrder: ["soul", "structure", "material", "form"],
  },
};

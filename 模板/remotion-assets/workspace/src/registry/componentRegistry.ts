import type {ZodType} from "zod";
import {
  createComponentSchema,
  type ComponentConfig,
} from "../schemas/components";
import type {
  CommunicationGoal,
  EmotionalTone,
  InformationShape,
} from "../schemas/director";

type Manifest = {
  id: ComponentConfig["component"];
  displayName: string;
  purpose: string;
  modes: readonly [string, ...string[]];
  communicationGoals: readonly CommunicationGoal[];
  emotionalTones: readonly EmotionalTone[];
  informationShapes: readonly InformationShape[];
  minDurationSeconds: number;
  maxItems: number;
  specPath: string;
  schema: ZodType;
  defaultProps: ComponentConfig;
};

const source = {type: "editorial", confidence: "inferred"} as const;

const manifests = [
  {
    id: "KineticStatement",
    displayName: "动势观点",
    purpose: "用问题、观点、关键词、数字或引语建立注意力和记忆锚点",
    modes: ["question", "claim", "keyword", "number", "quote"],
    communicationGoals: ["remember", "explain"],
    emotionalTones: ["energetic", "confident", "futuristic"],
    informationShapes: ["transformation"],
    minDurationSeconds: 2,
    maxItems: 4,
  },
  {
    id: "CompareTransform",
    displayName: "对比转化",
    purpose: "通过正误、前后、A/B 或误区与真相解释差异",
    modes: ["wrong-right", "before-after", "a-b", "myth-fact"],
    communicationGoals: ["compare", "choose"],
    emotionalTones: ["clear", "confident", "satisfying"],
    informationShapes: ["comparison", "transformation"],
    minDurationSeconds: 4,
    maxItems: 6,
  },
  {
    id: "FlowNodeGraph",
    displayName: "流程节点图",
    purpose: "解释步骤、因果推进、分支、闭环和产物流转",
    modes: ["linear", "branch", "loop", "artifact-flow"],
    communicationGoals: ["explain", "guide", "review"],
    emotionalTones: ["clear", "energetic", "futuristic", "satisfying"],
    informationShapes: ["sequence", "network"],
    minDurationSeconds: 6,
    maxItems: 8,
  },
  {
    id: "SystemMap",
    displayName: "系统关系图",
    purpose: "解释中心辐射、层级、包含和复杂关系网络",
    modes: ["hub-spoke", "hierarchy", "inclusion", "network", "radial"],
    communicationGoals: ["explain", "remember"],
    emotionalTones: ["clear", "calm", "futuristic"],
    informationShapes: ["hierarchy", "network"],
    minDurationSeconds: 7,
    maxItems: 8,
  },
  {
    id: "DecisionCanvas",
    displayName: "决策画布",
    purpose: "通过矩阵、决策树、排序或评分帮助观众做选择",
    modes: ["matrix", "decision-tree", "ranking", "scorecard", "radar"],
    communicationGoals: ["choose", "compare"],
    emotionalTones: ["clear", "confident", "calm"],
    informationShapes: ["comparison", "hierarchy", "quantitative"],
    minDurationSeconds: 7,
    maxItems: 8,
  },
  {
    id: "TimelineRoadmap",
    displayName: "时间路线图",
    purpose: "建立历史、阶段、里程碑和进度的时间感",
    modes: ["history", "phases", "milestones", "progress"],
    communicationGoals: ["explain", "guide", "review"],
    emotionalTones: ["clear", "energetic", "satisfying"],
    informationShapes: ["timeline", "sequence"],
    minDurationSeconds: 6,
    maxItems: 8,
  },
  {
    id: "DataStoryChart",
    displayName: "数据叙事图",
    purpose: "用趋势、柱状、排名、计数或指标面板解释变化",
    modes: ["trend", "bars", "ranking", "counter", "dashboard"],
    communicationGoals: ["prove", "review", "compare"],
    emotionalTones: ["confident", "clear", "energetic"],
    informationShapes: ["quantitative", "timeline"],
    minDurationSeconds: 5,
    maxItems: 8,
  },
  {
    id: "FunnelJourney",
    displayName: "漏斗旅程",
    purpose: "解释转化、注意力流失和逐层筛选过程",
    modes: ["conversion", "attention", "filter"],
    communicationGoals: ["explain", "review", "guide"],
    emotionalTones: ["clear", "confident", "urgent"],
    informationShapes: ["sequence", "quantitative"],
    minDurationSeconds: 6,
    maxItems: 6,
  },
  {
    id: "EvidenceBoard",
    displayName: "证据板",
    purpose: "把观点、来源、证据和结论组成可信证据链",
    modes: ["claim-evidence", "source-trail", "document", "quote", "proof-stack"],
    communicationGoals: ["prove", "explain"],
    emotionalTones: ["confident", "calm", "clear"],
    informationShapes: ["hierarchy", "sequence"],
    minDurationSeconds: 6,
    maxItems: 7,
  },
  {
    id: "FormTemplateBuilder",
    displayName: "模板生成器",
    purpose: "通过表单填写、清单、输入输出和结果生成引导行动",
    modes: ["form-fill", "checklist", "input-output", "result-card"],
    communicationGoals: ["guide", "remember"],
    emotionalTones: ["clear", "energetic", "satisfying"],
    informationShapes: ["sequence", "transformation"],
    minDurationSeconds: 6,
    maxItems: 8,
  },
  {
    id: "ScreenExplainer",
    displayName: "屏幕讲解器",
    purpose: "通过截图标注、界面演示、聚光或设备画框解释实际操作",
    modes: ["annotation", "walkthrough", "spotlight", "device", "side-by-side"],
    communicationGoals: ["explain", "guide", "prove"],
    emotionalTones: ["clear", "confident", "futuristic"],
    informationShapes: ["hierarchy", "comparison", "transformation"],
    minDurationSeconds: 5,
    maxItems: 6,
  },
  {
    id: "RiskActionLoop",
    displayName: "风险行动闭环",
    purpose: "把风险、触发、后果、动作和留痕组成解决闭环",
    modes: ["risk-action", "trigger-chain", "compliance", "redline"],
    communicationGoals: ["warn", "guide", "prove"],
    emotionalTones: ["urgent", "confident", "satisfying"],
    informationShapes: ["sequence", "transformation"],
    minDurationSeconds: 7,
    maxItems: 8,
  },
] as const;

export const componentRegistry: Manifest[] = manifests.map((manifest) => {
  const schema = createComponentSchema(
    manifest.id,
    manifest.modes,
    manifest.maxItems,
  );
  const items = Array.from({length: Math.min(4, manifest.maxItems)}, (_, index) => ({
    id: `item-${index + 1}`,
    label: ["识别问题", "建立关系", "形成判断", "落到行动"][index],
    description: ["先看真正卡住的位置", "把零散信息连接起来", "明确选择标准", "留下下一步产物"][index],
    value: 32 + index * 18,
    status: index === 0 ? "active" : "default",
    source,
  }));

  return {
    ...manifest,
    specPath: `模板/components/${manifest.id}.md`,
    schema,
    defaultProps: {
      component: manifest.id,
      mode: manifest.modes[0],
      title: manifest.displayName,
      subtitle: manifest.purpose,
      conclusion: "看懂关系，再决定下一步",
      communicationGoal: manifest.communicationGoals[0],
      emotionalTone: manifest.emotionalTones[0],
      informationShape: manifest.informationShapes[0],
      motionIntensity: "medium",
      stylePreset: manifest.id === "RiskActionLoop" ? "warning" : "clear",
      renderMode: "standalone",
      durationInFrames: Math.max(180, manifest.minDurationSeconds * 30),
      items,
      links: items.slice(0, -1).map((item, index) => ({
        from: item.id,
        to: items[index + 1].id,
      })),
      highlightOrder: items.map((item) => item.id),
    },
  } as Manifest;
});

export const getComponentManifest = (id: ComponentConfig["component"]) => {
  const manifest = componentRegistry.find((item) => item.id === id);
  if (!manifest) {
    throw new Error(`Unknown component family: ${id}`);
  }
  return manifest;
};

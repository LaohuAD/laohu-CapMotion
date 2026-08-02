import type React from "react";
import type {ComponentConfig} from "../schemas/components";
import {CompareTransform} from "./CompareTransform";
import {DataStoryChart} from "./DataStoryChart";
import {DecisionCanvas} from "./DecisionCanvas";
import {EvidenceBoard} from "./EvidenceBoard";
import {FlowNodeGraph} from "./FlowNodeGraph";
import {FormTemplateBuilder} from "./FormTemplateBuilder";
import {FunnelJourney} from "./FunnelJourney";
import {KineticStatement} from "./KineticStatement";
import {RiskActionLoop} from "./RiskActionLoop";
import {ScreenExplainer} from "./ScreenExplainer";
import {SystemMap} from "./SystemMap";
import {TimelineRoadmap} from "./TimelineRoadmap";

export const componentRenderers: Record<
  ComponentConfig["component"],
  React.FC<{config: ComponentConfig}>
> = {
  KineticStatement,
  CompareTransform,
  FlowNodeGraph,
  SystemMap,
  DecisionCanvas,
  TimelineRoadmap,
  DataStoryChart,
  FunnelJourney,
  EvidenceBoard,
  FormTemplateBuilder,
  ScreenExplainer,
  RiskActionLoop,
};

export const ComponentScene: React.FC<{config: ComponentConfig}> = ({config}) => {
  const Renderer = componentRenderers[config.component];
  return <Renderer config={config} />;
};

import React from "react";
import {useCurrentFrame} from "remotion";
import type {ComponentConfig, VisualItem} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {enterProgress} from "../visual/motion";
import {ConclusionBar, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {getVisualTheme} from "../visual/theme";

export const getRiskRows = (items: VisualItem[]) =>
  items.map((item) => ({
    risk: item.label,
    action: item.description ?? "补齐规避动作",
    proof: item.result ?? "保留记录",
  }));

export const RiskActionLoop: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  const rows = getRiskRows(config.items);
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="RISK / ACTION / PROOF" />
      <div style={{marginTop: 24, height: 620}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 54px 1fr 54px 0.8fr", gap: 14, marginBottom: 14}}>
          <div style={{fontSize: 30, color: theme.danger, fontWeight: 900}}>风险与触发</div>
          <div />
          <div style={{fontSize: 30, color: theme.accent, fontWeight: 900}}>规避动作</div>
          <div />
          <div style={{fontSize: 30, color: theme.accent2, fontWeight: 900}}>留痕文件</div>
        </div>
        <div style={{display: "grid", gap: 12}}>
          {rows.map((row, index) => {
            const progress = enterProgress(frame, index, rows.length, timing.buildEnd);
            return (
              <div key={config.items[index].id} style={{display: "grid", gridTemplateColumns: "1fr 54px 1fr 54px 0.8fr", gap: 14, alignItems: "center", opacity: progress}}>
                <Surface theme={theme} style={{padding: "18px 22px", minHeight: 92}}>
                  <div style={{fontSize: 35, lineHeight: 1.15, fontWeight: 900, color: theme.danger}}>{row.risk}</div>
                </Surface>
                <div style={{fontSize: 44, color: theme.accent, textAlign: "center"}}>→</div>
                <Surface theme={theme} active={index === 0} style={{padding: "18px 22px", minHeight: 92}}>
                  <div style={{fontSize: 34, lineHeight: 1.2, fontWeight: 850}}>{row.action}</div>
                </Surface>
                <div style={{fontSize: 44, color: theme.accent2, textAlign: "center"}}>→</div>
                <Surface theme={theme} style={{padding: "18px 20px", minHeight: 92, display: "flex", alignItems: "center", gap: 16}}>
                  <span style={{width: 32, height: 24, border: `4px solid ${theme.accent2}`, borderTopWidth: 9}} />
                  <div style={{fontSize: 31, lineHeight: 1.15, fontWeight: 900}}>{row.proof}</div>
                </Surface>
              </div>
            );
          })}
        </div>
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

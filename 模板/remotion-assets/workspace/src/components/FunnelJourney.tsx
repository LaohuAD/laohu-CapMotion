import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {enterProgress} from "../visual/motion";
import {ConclusionBar, SceneHeader, SceneStage} from "../visual/layout";
import {getVisualTheme} from "../visual/theme";

export const FunnelJourney: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="FUNNEL / JOURNEY" />
      <div style={{display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 54, marginTop: 18, height: 640}}>
        <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 16}}>
          {config.items.map((item, index) => {
            const progress = enterProgress(frame, index, config.items.length, timing.buildEnd);
            const width = 100 - index * (48 / Math.max(1, config.items.length - 1));
            return (
              <div
                key={item.id}
                style={{
                  width: `${width}%`,
                  minHeight: 102,
                  padding: "20px 40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: index === config.items.length - 1 ? theme.accent : theme.surface,
                  color: index === config.items.length - 1 && config.stylePreset !== "tech" ? "#FFFFFF" : theme.text,
                  border: `2px solid ${index === config.items.length - 1 ? theme.accent : theme.line}`,
                  clipPath: "polygon(4% 0, 96% 0, 100% 100%, 0 100%)",
                  opacity: progress,
                  scale: interpolate(progress, [0, 1], [0.92, 1]),
                }}
              >
                <span style={{fontSize: 43, fontWeight: 900}}>{item.label}</span>
                <span style={{fontSize: 32, fontWeight: 800}}>{item.value ?? `${100 - index * 18}%`}</span>
              </div>
            );
          })}
        </div>
        <div style={{padding: "34px 0", display: "flex", flexDirection: "column", justifyContent: "space-between"}}>
          {config.items.map((item, index) => (
            <div key={item.id} style={{borderLeft: `5px solid ${index === config.items.length - 1 ? theme.accent2 : theme.line}`, paddingLeft: 24}}>
              <div style={{fontSize: 36, fontWeight: 900}}>{item.label}</div>
              <div style={{fontSize: 29, lineHeight: 1.35, color: theme.muted, marginTop: 8}}>
                {item.description ?? "这一层决定观众是否继续往下走"}
              </div>
            </div>
          ))}
        </div>
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

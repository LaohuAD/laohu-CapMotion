import React from "react";
import {useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {ConclusionBar, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {enterProgress} from "../visual/motion";
import {compactTypography, getVisualTheme} from "../visual/theme";

export const EvidenceBoard: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="CLAIM / EVIDENCE" />
      <div style={{display: "grid", gridTemplateColumns: "0.78fr 1.22fr", gap: 40, marginTop: 28, height: 620}}>
        <Surface theme={theme} active style={{padding: 42, display: "flex", flexDirection: "column", justifyContent: "center"}}>
          <div style={{fontSize: 30, color: theme.accent, fontWeight: 900}}>核心判断</div>
          <div style={{fontSize: 66, lineHeight: 1.16, fontWeight: 950, marginTop: 24}}>{config.title}</div>
          {config.subtitle ? (
            <div style={{fontSize: 32, lineHeight: 1.4, color: theme.muted, marginTop: 28}}>{config.subtitle}</div>
          ) : null}
        </Surface>
        <div style={{display: "grid", gap: 18, alignContent: "center"}}>
          {config.items.map((item, index) => (
            <div key={item.id} style={{display: "grid", gridTemplateColumns: "68px 1fr", gap: 18, alignItems: "center"}}>
              <div style={{width: 54, height: 54, borderRadius: "50%", background: theme.accent, color: config.stylePreset === "clear" ? "#FFFFFF" : theme.background, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900}}>
                {index + 1}
              </div>
              <Surface
                theme={theme}
                active={item.status === "active" || index === 0}
                style={{
                  padding: "18px 24px",
                  minHeight: 108,
                  opacity: enterProgress(frame, index, config.items.length, timing.buildEnd),
                }}
              >
                <div style={{fontSize: compactTypography.item, lineHeight: 1.12, fontWeight: 900}}>{item.label}</div>
                {item.description ? (
                  <div style={{fontSize: compactTypography.body, lineHeight: 1.28, color: theme.muted, marginTop: 8}}>{item.description}</div>
                ) : null}
              </Surface>
            </div>
          ))}
        </div>
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

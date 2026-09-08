import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {enterProgress} from "../visual/motion";
import {ConclusionBar, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {getVisualTheme} from "../visual/theme";

export const TimelineRoadmap: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  const lineProgress = interpolate(frame, [timing.introduceEnd, timing.buildEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="TIME / ROADMAP" />
      <div style={{position: "relative", marginTop: 70, height: 560}}>
        <div
          style={{
            position: "absolute",
            left: "5%",
            right: "5%",
            top: 92,
            height: 8,
            background: theme.line,
          }}
        >
          <div style={{width: `${lineProgress * 100}%`, height: "100%", background: theme.accent}} />
        </div>
        <div style={{display: "grid", gridTemplateColumns: `repeat(${config.items.length}, 1fr)`, gap: 20}}>
          {config.items.map((item, index) => {
            const progress = enterProgress(frame, index, config.items.length, timing.buildEnd, item.revealAtFrame);
            return (
              <div key={item.id} style={{textAlign: "center", opacity: progress}}>
                <div style={{fontSize: 30, fontWeight: 900, color: theme.accent}}>
                  {item.value !== undefined ? item.value : `阶段 ${index + 1}`}
                </div>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    margin: "28px auto 34px",
                    background: index === config.items.length - 1 ? theme.accent2 : theme.accent,
                    outline: `10px solid ${theme.surfaceAlt}`,
                  }}
                />
                <Surface theme={theme} active={index === config.items.length - 1} style={{padding: 24, minHeight: 190}}>
                  <div style={{fontSize: 42, lineHeight: 1.14, fontWeight: 900}}>{item.label}</div>
                  {item.description ? (
                    <div style={{fontSize: 29, lineHeight: 1.4, color: theme.muted, marginTop: 14}}>
                      {item.description}
                    </div>
                  ) : null}
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

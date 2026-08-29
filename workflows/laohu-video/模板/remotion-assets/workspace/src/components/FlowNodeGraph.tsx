import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {enterProgress} from "../visual/motion";
import {ConclusionBar, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {getVisualTheme, typography} from "../visual/theme";

export const FlowNodeGraph: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  const columns = Math.min(config.items.length, 4);
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="FLOW / PATH" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: "58px 32px",
          marginTop: 42,
          alignItems: "stretch",
        }}
      >
        {config.items.map((item, index) => {
          const progress = enterProgress(frame, index, config.items.length, timing.buildEnd);
          const hasArrow = index < config.items.length - 1 && (index + 1) % columns !== 0;
          return (
            <div key={item.id} style={{position: "relative", opacity: progress}}>
              <Surface
                theme={theme}
                active={item.status === "active" || index === config.items.length - 1}
                style={{height: "100%", minHeight: 210, padding: "28px 30px"}}
              >
                <div style={{fontSize: 28, fontWeight: 900, color: theme.accent}}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div style={{fontSize: typography.item, fontWeight: 900, lineHeight: 1.12, marginTop: 14}}>
                  {item.label}
                </div>
                {item.description ? (
                  <div style={{fontSize: 32, lineHeight: 1.38, color: theme.muted, marginTop: 16}}>
                    {item.description}
                  </div>
                ) : null}
              </Surface>
              {hasArrow ? (
                <div
                  style={{
                    position: "absolute",
                    right: -44,
                    top: "50%",
                    width: 54,
                    height: 4,
                    background: theme.accent,
                    scale: `${interpolate(progress, [0, 1], [0, 1])} 1`,
                    transformOrigin: "left center",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      right: -1,
                      top: -8,
                      width: 0,
                      height: 0,
                      borderTop: "10px solid transparent",
                      borderBottom: "10px solid transparent",
                      borderLeft: `16px solid ${theme.accent}`,
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

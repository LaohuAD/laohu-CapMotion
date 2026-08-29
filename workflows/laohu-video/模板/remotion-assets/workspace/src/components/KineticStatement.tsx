import React from "react";
import {Easing, interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {ConclusionBar, SceneStage} from "../visual/layout";
import {getVisualTheme, typography} from "../visual/theme";

export const KineticStatement: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  const titleProgress = interpolate(frame, [0, timing.introduceEnd], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <SceneStage config={config}>
      <div
        style={{
          height: "calc(100% - 90px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: theme.accent,
            fontSize: typography.label,
            fontWeight: 900,
            opacity: titleProgress,
          }}
        >
          {config.mode.replaceAll("-", " ").toUpperCase()}
        </div>
        <div
          style={{
            marginTop: 26,
            maxWidth: 1540,
            fontSize: config.title.length > 16 ? 94 : typography.hero,
            lineHeight: 1.06,
            fontWeight: 950,
            letterSpacing: 0,
            opacity: titleProgress,
            scale: interpolate(titleProgress, [0, 1], [0.86, 1]),
          }}
        >
          {config.title}
        </div>
        {config.subtitle ? (
          <div
            style={{
              marginTop: 30,
              maxWidth: 1320,
              color: theme.muted,
              fontSize: 42,
              lineHeight: 1.4,
              opacity: interpolate(frame, [timing.introduceEnd * 0.7, timing.buildEnd], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {config.subtitle}
          </div>
        ) : null}
        <div style={{display: "flex", gap: 18, marginTop: 48, flexWrap: "wrap", justifyContent: "center"}}>
          {config.items.map((item, index) => {
            const progress = interpolate(
              frame,
              [timing.introduceEnd + index * 8, timing.introduceEnd + index * 8 + 18],
              [0, 1],
              {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
            );
            return (
              <div
                key={item.id}
                style={{
                  padding: "18px 28px",
                  border: `2px solid ${index === 0 ? theme.accent : theme.line}`,
                  background: index === 0 ? theme.accent : theme.surface,
                  color: index === 0 && config.stylePreset !== "tech" ? "#FFFFFF" : theme.text,
                  fontSize: 34,
                  fontWeight: 800,
                  opacity: progress,
                  translate: `0 ${interpolate(progress, [0, 1], [20, 0])}px`,
                }}
              >
                {item.label}
              </div>
            );
          })}
        </div>
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

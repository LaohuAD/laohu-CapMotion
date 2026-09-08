import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {enterProgress} from "../visual/motion";
import {ConclusionBar, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {getVisualTheme} from "../visual/theme";

const positions = [
  [10, 8], [39, 0], [68, 8], [76, 55], [39, 65], [2, 55], [4, 31], [74, 31],
];

export const SystemMap: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="SYSTEM / RELATION" />
      <div style={{position: "relative", height: 650, marginTop: 12}}>
        <svg width="100%" height="100%" style={{position: "absolute", inset: 0}}>
          {config.items.map((item, index) => {
            const [x, y] = positions[index] ?? positions[index % positions.length];
            const progress = enterProgress(frame, index, config.items.length, timing.buildEnd, item.revealAtFrame);
            return (
              <line
                key={`line-${item.id}`}
                x1="50%"
                y1="48%"
                x2={`${x + 11}%`}
                y2={`${y + 10}%`}
                stroke={theme.accent}
                strokeWidth="4"
                opacity={0.25 + progress * 0.75}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - progress}
              />
            );
          })}
        </svg>
        <Surface
          theme={theme}
          active
          style={{
            position: "absolute",
            left: "38%",
            top: "31%",
            width: "24%",
            minHeight: 190,
            padding: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: 58,
            lineHeight: 1.12,
            fontWeight: 900,
          }}
        >
          {config.title}
        </Surface>
        {config.items.map((item, index) => {
          const [x, y] = positions[index] ?? positions[index % positions.length];
          const progress = enterProgress(frame, index, config.items.length, timing.buildEnd, item.revealAtFrame);
          return (
            <Surface
              key={item.id}
              theme={theme}
              style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                width: "22%",
                minHeight: 130,
                padding: "22px 24px",
                opacity: progress,
                scale: interpolate(progress, [0, 1], [0.86, 1]),
              }}
            >
              <div style={{fontSize: 42, lineHeight: 1.15, fontWeight: 900}}>{item.label}</div>
              {item.description ? (
                <div style={{fontSize: 27, lineHeight: 1.35, color: theme.muted, marginTop: 10}}>
                  {item.description}
                </div>
              ) : null}
            </Surface>
          );
        })}
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

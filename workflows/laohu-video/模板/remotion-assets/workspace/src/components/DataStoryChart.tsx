import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {enterProgress} from "../visual/motion";
import {ConclusionBar, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {getVisualTheme} from "../visual/theme";

export const getDataPresentation = (mode: string) => {
  if (mode === "dashboard") return "dashboard";
  if (mode === "trend") return "trend";
  return "bars";
};

export const shouldRenderChartAxisLabels = (presentation: string) =>
  presentation !== "dashboard";

export const DataStoryChart: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  const values = config.items.map((item, index) => item.value ?? (index + 1) * 20);
  const max = Math.max(...values, 1);
  const chartProgress = interpolate(frame, [timing.introduceEnd, timing.buildEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const presentation = getDataPresentation(config.mode);
  const points = values
    .map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${100 - (value / max) * 80}`)
    .join(" ");
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="DATA / CHANGE" />
      <Surface theme={theme} style={{height: 610, padding: "36px 42px", marginTop: 28}}>
        {presentation === "dashboard" ? (
          <div style={{height: 520, display: "grid", gridTemplateRows: "1fr auto", gap: 32}}>
            <div style={{display: "grid", gridTemplateColumns: `repeat(${config.items.length}, 1fr)`, gap: 28}}>
              {config.items.map((item, index) => (
                <Surface key={item.id} theme={theme} active={item.status === "active"} style={{padding: 34, display: "flex", flexDirection: "column", justifyContent: "center", opacity: enterProgress(frame, index, config.items.length, timing.buildEnd)}}>
                  <div style={{fontSize: 72, fontWeight: 950, color: theme.accent}}>{item.label.split(" ")[0]}</div>
                  <div style={{fontSize: 38, lineHeight: 1.2, fontWeight: 900, marginTop: 18}}>{item.label.split(" ").slice(1).join(" ")}</div>
                  <div style={{fontSize: 30, lineHeight: 1.4, color: theme.muted, marginTop: 18}}>{item.description}</div>
                </Surface>
              ))}
            </div>
            <div style={{display: "grid", gridTemplateColumns: `repeat(${Math.max(1, config.supportingLabels?.length ?? 0)}, 1fr)`, gap: 18}}>
              {(config.supportingLabels ?? []).map((label) => (
                <div key={label} style={{padding: "18px 20px", background: theme.surfaceAlt, borderLeft: `6px solid ${theme.accent2}`, fontSize: 34, fontWeight: 900, textAlign: "center"}}>{label}</div>
              ))}
            </div>
          </div>
        ) : presentation === "trend" ? (
          <div style={{position: "relative", height: 410, margin: "24px 40px"}}>
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              {[20, 40, 60, 80].map((y) => (
                <line key={y} x1="0" y1={y} x2="100" y2={y} stroke={theme.line} strokeWidth="0.5" />
              ))}
              <polyline
                points={points}
                fill="none"
                stroke={theme.accent}
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - chartProgress}
              />
            </svg>
            <div style={{position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${values.length}, 1fr)`}}>
              {config.items.map((item, index) => (
                <div key={item.id} style={{position: "relative"}}>
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: `${100 - (values[index] / max) * 80}%`,
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      translate: "-50% -50%",
                      background: theme.accent2,
                      scale: chartProgress,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{height: 410, display: "flex", alignItems: "flex-end", gap: 28, padding: "20px 30px"}}>
            {config.items.map((item, index) => {
              const progress = enterProgress(frame, index, config.items.length, timing.buildEnd);
              return (
                <div key={item.id} style={{flex: 1, textAlign: "center"}}>
                  <div style={{fontSize: 36, fontWeight: 900, color: theme.accent}}>{values[index]}</div>
                  <div
                    style={{
                      height: 280 * (values[index] / max) * progress,
                      minHeight: 4,
                      marginTop: 14,
                      background: index === values.length - 1 ? theme.accent2 : theme.accent,
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
        {shouldRenderChartAxisLabels(presentation) ? (
          <div style={{display: "grid", gridTemplateColumns: `repeat(${config.items.length}, 1fr)`, gap: 18}}>
            {config.items.map((item) => (
              <div key={item.id} style={{fontSize: 31, lineHeight: 1.25, fontWeight: 800, textAlign: "center"}}>
                {item.label}
              </div>
            ))}
          </div>
        ) : null}
      </Surface>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

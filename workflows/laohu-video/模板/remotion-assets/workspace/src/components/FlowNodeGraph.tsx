import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {enterProgress} from "../visual/motion";
import {ConclusionBar, MicroLabel, OverlayRegion, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {getVisualTheme, resolveSemanticAccent, typography, typeStyles} from "../visual/theme";

export const getFlowColumns = (presentation: string | undefined, count: number) =>
  presentation === "overlay" ? 1 : Math.min(count, 4);

export const getFlowConclusionOpacity = (
  frame: number,
  timing: {buildEnd: number; resolveEnd: number},
) =>
  interpolate(frame, [timing.buildEnd, timing.resolveEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export const FlowNodeGraph: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const accent = resolveSemanticAccent(config.stylePreset, config.accentRole ?? "info");
  const timing = buildSceneTiming(config.durationInFrames);
  const columns = getFlowColumns(config.presentation, config.items.length);
  if (config.presentation === "overlay") {
    return (
      <SceneStage config={config}>
        <OverlayRegion config={config}>
          <MicroLabel config={config}>{config.kicker ?? "SYSTEM / SEQUENCE"}</MicroLabel>
          <div style={{...typeStyles.title, fontSize: 50, marginTop: 18}}>{config.title}</div>
          {config.subtitle ? <div style={{...typeStyles.body, fontSize: 24, color: theme.muted, marginTop: 10}}>{config.subtitle}</div> : null}
          <div style={{position: "relative", display: "grid", gap: 10, marginTop: 22}}>
            <div style={{position: "absolute", left: 25, top: 22, bottom: 22, width: 2, background: theme.line}} />
            {config.items.map((item, index) => {
              const progress = enterProgress(frame, index, config.items.length, timing.buildEnd, item.revealAtFrame);
              const itemAccent = item.status === "negative" ? theme.danger : item.status === "positive" ? theme.success : accent;
              return (
                <Surface key={item.id} theme={theme} style={{position: "relative", minHeight: 92, padding: "15px 18px 15px 64px", border: `1px solid ${item.status === "active" ? itemAccent : theme.line}`, opacity: progress, translate: `${interpolate(progress, [0, 1], [-22, 0])}px 0`, boxShadow: "none"}}>
                  <div style={{...typeStyles.number, position: "absolute", left: 13, top: 21, width: 26, height: 26, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: itemAccent, color: "#08100F", fontSize: 14}}>{index + 1}</div>
                  <div style={{...typeStyles.cardTitle, fontSize: 29}}>{item.label}</div>
                  {item.description ? <div style={{...typeStyles.body, fontSize: 20, color: theme.muted, marginTop: 5}}>{item.description}</div> : null}
                </Surface>
              );
            })}
          </div>
          {config.conclusion ? <div style={{...typeStyles.cardTitle, marginTop: 14, color: accent, fontSize: 23, opacity: getFlowConclusionOpacity(frame, timing)}}>{config.conclusion}</div> : null}
        </OverlayRegion>
      </SceneStage>
    );
  }

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
          const progress = enterProgress(frame, index, config.items.length, timing.buildEnd, item.revealAtFrame);
          const hasArrow = index < config.items.length - 1 && (index + 1) % columns !== 0;
          return (
            <div key={item.id} style={{position: "relative", opacity: progress}}>
              <Surface
                theme={theme}
                active={item.status === "active" || index === config.items.length - 1}
                style={{height: "100%", minHeight: 210, padding: "28px 30px"}}
              >
                <div style={{...typeStyles.number, fontSize: 28, color: theme.accent}}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div style={{...typeStyles.cardTitle, fontSize: typography.item, marginTop: 14}}>
                  {item.label}
                </div>
                {item.description ? (
                  <div style={{...typeStyles.body, fontSize: 32, color: theme.muted, marginTop: 16}}>
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

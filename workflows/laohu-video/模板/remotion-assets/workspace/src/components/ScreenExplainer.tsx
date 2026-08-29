import React from "react";
import {Img, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {ConclusionBar, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {enterProgress} from "../visual/motion";
import {compactTypography, getVisualTheme} from "../visual/theme";

export const ScreenExplainer: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="SCREEN / ANNOTATE" />
      <div style={{display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 36, marginTop: 20, height: 640}}>
        <Surface theme={theme} style={{padding: 18, position: "relative", overflow: "hidden"}}>
          <div style={{height: 50, display: "flex", alignItems: "center", gap: 12, padding: "0 12px", borderBottom: `2px solid ${theme.line}`}}>
            {[theme.danger, theme.accent2, theme.success].map((color) => (
              <span key={color} style={{width: 16, height: 16, borderRadius: "50%", background: color}} />
            ))}
          </div>
          {config.mediaSrc ? (
            <Img src={config.mediaSrc} style={{width: "100%", height: "calc(100% - 50px)", objectFit: "contain"}} />
          ) : (
            <div style={{height: "calc(100% - 50px)", display: "grid", gridTemplateColumns: "220px 1fr", background: theme.surfaceAlt}}>
              <div style={{borderRight: `2px solid ${theme.line}`, padding: 24}}>
                {config.items.slice(0, 4).map((item) => (
                  <div key={item.id} style={{height: 54, marginBottom: 18, background: theme.surface, borderLeft: `6px solid ${theme.accent}`}} />
                ))}
              </div>
              <div style={{padding: 44}}>
                <div style={{width: "64%", height: 50, background: theme.surface, marginBottom: 32}} />
                <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26}}>
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index} style={{height: 180, background: theme.surface, border: `2px solid ${index === 1 ? theme.accent : theme.line}`}} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div style={{position: "absolute", left: "46%", top: "36%", width: "34%", height: "28%", border: `6px solid ${theme.accent}`, boxShadow: `0 0 0 999px ${theme.background}88`}} />
        </Surface>
        <div style={{display: "grid", gap: 16, alignContent: "center"}}>
          {config.items.slice(0, 4).map((item, index) => (
            <Surface
              key={item.id}
              theme={theme}
              active={item.status === "active" || index === 0}
              style={{
                padding: "18px 22px",
                minHeight: 108,
                opacity: enterProgress(frame, index, config.items.length, timing.buildEnd),
              }}
            >
              <div style={{fontSize: compactTypography.item, lineHeight: 1.12, fontWeight: 900}}>{item.label}</div>
              {item.description ? (
                <div style={{fontSize: compactTypography.body, lineHeight: 1.28, color: theme.muted, marginTop: 8}}>{item.description}</div>
              ) : null}
            </Surface>
          ))}
        </div>
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

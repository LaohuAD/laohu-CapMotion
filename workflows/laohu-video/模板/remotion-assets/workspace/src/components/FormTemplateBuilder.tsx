import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {enterProgress} from "../visual/motion";
import {ConclusionBar, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {getVisualTheme} from "../visual/theme";

export const FormTemplateBuilder: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="FILL / BUILD / OUTPUT" />
      <div style={{display: "grid", gridTemplateColumns: "1.35fr 0.65fr", gap: 42, marginTop: 24, height: 620}}>
        <Surface theme={theme} style={{padding: "28px 34px"}}>
          {config.items.map((item, index) => {
            const progress = enterProgress(frame, index, config.items.length, timing.buildEnd, item.revealAtFrame);
            const typed = Math.max(0, Math.floor((item.description?.length ?? 0) * progress));
            return (
              <div key={item.id} style={{display: "grid", gridTemplateColumns: "260px 1fr 54px", gap: 22, alignItems: "center", minHeight: 106, borderBottom: `2px solid ${theme.line}`, opacity: progress}}>
                <div style={{fontSize: 38, fontWeight: 900}}>{item.label}</div>
                <div style={{fontSize: 33, lineHeight: 1.3, color: theme.muted}}>
                  {item.description?.slice(0, typed) || "等待填写"}
                  {progress < 1 ? <span style={{color: theme.accent}}>｜</span> : null}
                </div>
                <div style={{width: 40, height: 40, borderRadius: "50%", background: progress > 0.9 ? theme.success : theme.surfaceAlt, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900}}>
                  {progress > 0.9 ? "✓" : ""}
                </div>
              </div>
            );
          })}
        </Surface>
        <Surface theme={theme} active style={{padding: 38, display: "flex", flexDirection: "column", justifyContent: "center"}}>
          <div style={{fontSize: 31, color: theme.accent, fontWeight: 900}}>最终产出</div>
          <div style={{fontSize: 58, lineHeight: 1.16, fontWeight: 900, marginTop: 26}}>
            {config.conclusion ?? "一张可以直接执行的模板"}
          </div>
          <div style={{height: 6, background: theme.line, marginTop: 36}}>
            <div style={{height: "100%", width: `${interpolate(frame, [timing.buildEnd, timing.resolveEnd], [0, 100], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}%`, background: theme.accent2}} />
          </div>
        </Surface>
      </div>
      <ConclusionBar config={{...config, conclusion: undefined}} />
    </SceneStage>
  );
};

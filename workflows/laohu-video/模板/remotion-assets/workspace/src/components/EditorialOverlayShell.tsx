import React from "react";
import {Img, interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig, VisualItem} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {editorialRevealProgress} from "../visual/motion";
import {MicroLabel, OverlayRegion, SceneStage} from "../visual/layout";
import {getVisualTheme, resolveSemanticAccent, typeStyles} from "../visual/theme";

const contrastStyle = (config: ComponentConfig): React.CSSProperties => {
  const mode = config.overlayContinuity?.contrastMode ?? "NONE";
  // FULL_SCRIM is shared by every component through SceneStage.
  if (mode === "FULL_SCRIM") return {};
  if (mode === "REGIONAL_SCRIM") {
    return {
      position: "fixed",
      top: 0,
      bottom: 0,
      width: 900,
      ...(config.placement === "right" ? {right: 0} : {left: 0}),
      background: "linear-gradient(90deg, rgba(4,7,12,.78), rgba(4,7,12,.42) 68%, transparent)",
      transform: config.placement === "right" ? "scaleX(-1)" : undefined,
    };
  }
  return {};
};

const itemColor = (item: VisualItem, accent: string, muted: string, success: string, danger: string) => {
  if (item.status === "active") return accent;
  if (item.status === "positive") return success;
  if (item.status === "negative") return danger;
  return muted;
};

const Rail: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const accent = resolveSemanticAccent(config.stylePreset, config.accentRole ?? "info");
  const timing = buildSceneTiming(config.durationInFrames);
  return (
    <div style={{display: "flex", flexDirection: "column", gap: 12, marginTop: 22}}>
      {config.items.map((item, index) => {
        const reveal = editorialRevealProgress(frame, index, config.items.length, timing.buildEnd, item.revealAtFrame);
        const color = itemColor(item, accent, theme.muted, theme.success, theme.danger);
        return (
          <div key={item.id} style={{display: "grid", gridTemplateColumns: "28px 1fr", gap: 12, alignItems: "center", opacity: reveal.opacity, translate: `${reveal.translateX}px 0`}}>
            <div style={{width: 17, height: 17, borderRadius: 99, border: `2px solid ${color}`, background: item.status === "active" || item.status === "positive" ? color : "transparent", boxShadow: item.status === "active" ? `0 0 18px ${accent}` : "none"}} />
            <div style={{padding: "11px 14px", borderLeft: `3px solid ${color}`, background: item.status === "active" ? `${accent}18` : "rgba(6,9,14,.28)"}}>
              <div style={{...typeStyles.cardTitle, fontSize: 24, color: item.status === "muted" ? theme.muted : theme.text}}>{item.label}</div>
              {item.description ? <div style={{...typeStyles.body, fontSize: 18, marginTop: 4, color: theme.muted}}>{item.description}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const EvidenceDock: React.FC<{config: ComponentConfig}> = ({config}) => {
  const theme = getVisualTheme(config.stylePreset);
  const accent = resolveSemanticAccent(config.stylePreset, config.accentRole ?? "info");
  return (
    <div style={{marginTop: 24, display: "grid", gridTemplateColumns: config.mediaSrc ? "1.25fr .75fr" : "1fr", gap: 18}}>
      {config.mediaSrc ? <div style={{border: `2px solid ${accent}`, background: "rgba(5,8,12,.56)", padding: 10}}><Img src={config.mediaSrc} style={{display: "block", width: "100%", maxHeight: 440, objectFit: "contain"}} /></div> : null}
      <div style={{display: "flex", flexDirection: "column", gap: 10}}>
        {config.items.map((item) => <div key={item.id} style={{padding: "13px 16px", borderLeft: `4px solid ${item.status === "active" ? accent : theme.line}`, background: "rgba(5,8,12,.58)", color: theme.text, ...typeStyles.cardTitle, fontSize: 22}}>{item.label}</div>)}
      </div>
    </div>
  );
};

const LabelStack: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const accent = resolveSemanticAccent(config.stylePreset, config.accentRole ?? "info");
  return <div style={{display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24}}>{config.items.map((item, index) => {
    const progress = interpolate(frame, [index * 8, index * 8 + 16], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
    return <div key={item.id} style={{padding: "12px 18px", border: `1px solid ${item.status === "active" ? accent : theme.line}`, background: item.status === "active" ? `${accent}22` : "rgba(5,8,12,.56)", color: theme.text, fontSize: 23, ...typeStyles.cardTitle, opacity: progress, scale: 0.94 + progress * 0.06}}>{item.label}</div>;
  })}</div>;
};

const ValueCallout: React.FC<{config: ComponentConfig}> = ({config}) => {
  const theme = getVisualTheme(config.stylePreset);
  const accent = resolveSemanticAccent(config.stylePreset, config.accentRole ?? "warning");
  const main = config.items[0];
  return <div style={{marginTop: 26, padding: "22px 24px", borderLeft: `7px solid ${accent}`, background: "rgba(5,8,12,.62)"}}><div style={{...typeStyles.hero, fontSize: 74, lineHeight: 1, color: accent}}>{main?.result ?? main?.value ?? main?.label}</div>{main?.result || main?.value !== undefined ? <div style={{marginTop: 12, fontSize: 25, color: theme.text, ...typeStyles.cardTitle}}>{main.label}</div> : null}</div>;
};

const Bridge: React.FC<{config: ComponentConfig}> = ({config}) => {
  const theme = getVisualTheme(config.stylePreset);
  const accent = resolveSemanticAccent(config.stylePreset, config.accentRole ?? "info");
  return <div style={{marginTop: 28, display: "flex", alignItems: "center", gap: 16}}><div style={{width: 52, height: 4, background: accent}}/><div style={{fontSize: 30, color: theme.text, ...typeStyles.cardTitle}}>{config.items[0]?.label ?? config.conclusion}</div><div style={{fontSize: 30, color: accent}}>→</div><div style={{fontSize: 24, color: theme.muted}}>{config.items[1]?.label ?? config.overlayContinuity?.stateAfter}</div></div>;
};

export const EditorialOverlayShell: React.FC<{config: ComponentConfig}> = ({config}) => {
  const theme = getVisualTheme(config.stylePreset);
  const localBackplate = config.overlayContinuity?.contrastMode === "LOCAL_BACKPLATE";
  const renderer = config.mode === "progress-rail" ? <Rail config={config}/> : config.mode === "evidence-dock" ? <EvidenceDock config={config}/> : config.mode === "label-stack" ? <LabelStack config={config}/> : config.mode === "value-callout" ? <ValueCallout config={config}/> : <Bridge config={config}/>;
  return (
    <SceneStage config={config}>
      <div style={contrastStyle(config)} />
      <OverlayRegion config={config} style={localBackplate ? {padding: "28px 30px", borderRadius: 10, background: "rgba(5,8,12,.72)", boxShadow: "0 20px 70px rgba(0,0,0,.28)"} : undefined}>
        <MicroLabel config={config}>{config.kicker ?? config.overlayContinuity?.role ?? config.mode}</MicroLabel>
        <div style={{...typeStyles.title, marginTop: 14, fontSize: 42, lineHeight: 1.08, color: theme.text, whiteSpace: "pre-line"}}>{config.title}</div>
        {renderer}
        {config.conclusion ? <div style={{marginTop: 20, color: theme.muted, fontSize: 21, ...typeStyles.body}}>{config.conclusion}</div> : null}
      </OverlayRegion>
    </SceneStage>
  );
};

import React from "react";
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig, VisualItem} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {enterProgress} from "./motion";
import {getVisualTheme, typography, type VisualTheme} from "./theme";

export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

export const surfaceBaseStyle: React.CSSProperties = {
  boxSizing: "border-box",
  borderRadius: 8,
};

export const SceneStage: React.FC<
  React.PropsWithChildren<{config: ComponentConfig}>
> = ({config, children}) => {
  const theme = getVisualTheme(config.stylePreset);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: config.renderMode === "asset" ? "transparent" : theme.background,
        color: theme.text,
        fontFamily: FONT_FAMILY,
        padding: "72px 92px 64px",
        overflow: "hidden",
      }}
    >
      {config.renderMode !== "asset" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `linear-gradient(${theme.line}33 1px, transparent 1px), linear-gradient(90deg, ${theme.line}33 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
            opacity: config.stylePreset === "tech" ? 0.28 : 0.12,
          }}
        />
      ) : null}
      <div style={{position: "relative", zIndex: 1, height: "100%"}}>{children}</div>
    </AbsoluteFill>
  );
};

export const SceneHeader: React.FC<{
  config: ComponentConfig;
  kicker?: string;
}> = ({config, kicker}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const opacity = interpolate(frame, [0, 18], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <header style={{opacity, minHeight: 170}}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          color: theme.accent,
          fontSize: typography.label,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        <span style={{width: 42, height: 5, background: theme.accent}} />
        {kicker ?? config.communicationGoal.toUpperCase()}
      </div>
      <div
        style={{
          marginTop: 18,
          fontSize: typography.title,
          lineHeight: 1.08,
          fontWeight: 900,
          maxWidth: 1540,
          letterSpacing: 0,
        }}
      >
        {config.title}
      </div>
      {config.subtitle ? (
        <div
          style={{
            marginTop: 16,
            color: theme.muted,
            fontSize: typography.subtitle,
            lineHeight: 1.35,
            fontWeight: 550,
            maxWidth: 1520,
          }}
        >
          {config.subtitle}
        </div>
      ) : null}
    </header>
  );
};

export const Surface: React.FC<
  React.PropsWithChildren<{
    theme: VisualTheme;
    active?: boolean;
    style?: React.CSSProperties;
  }>
> = ({theme, active, style, children}) => (
  <div
    style={{
      ...surfaceBaseStyle,
      background: active ? theme.surfaceAlt : theme.surface,
      border: `2px solid ${active ? theme.accent : theme.line}`,
      boxShadow: `0 18px 50px ${theme.shadow}`,
      ...style,
    }}
  >
    {children}
  </div>
);

export const ItemCard: React.FC<{
  item: VisualItem;
  index: number;
  count: number;
  config: ComponentConfig;
  style?: React.CSSProperties;
}> = ({item, index, count, config, style}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  const progress = enterProgress(frame, index, count, timing.buildEnd);
  const color =
    item.status === "negative"
      ? theme.danger
      : item.status === "positive"
        ? theme.success
        : item.status === "active"
          ? theme.accent
          : theme.text;

  return (
    <Surface
      theme={theme}
      active={item.status === "active"}
      style={{
        padding: "30px 32px",
        opacity: progress,
        translate: `0 ${interpolate(progress, [0, 1], [28, 0])}px`,
        minHeight: 150,
        ...style,
      }}
    >
      <div style={{display: "flex", alignItems: "center", gap: 16}}>
        <span
          style={{
            flex: "0 0 auto",
            width: 18,
            height: 18,
            borderRadius: 2,
            background: color,
          }}
        />
        <div style={{fontSize: typography.item, lineHeight: 1.12, fontWeight: 850, color}}>
          {item.label}
        </div>
      </div>
      {item.description ? (
        <div
          style={{
            marginTop: 16,
            fontSize: typography.body,
            lineHeight: 1.38,
            color: theme.muted,
          }}
        >
          {item.description}
        </div>
      ) : null}
    </Surface>
  );
};

export const ConclusionBar: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames);
  if (!config.conclusion) return null;
  const progress = interpolate(frame, [timing.buildEnd, timing.resolveEnd], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 82,
        padding: "14px 34px",
        background: theme.accent,
        color: config.stylePreset === "clear" || config.stylePreset === "editorial" ? "#FFFFFF" : "#08100F",
        fontSize: typography.conclusion,
        fontWeight: 900,
        lineHeight: 1.2,
        opacity: progress,
        scale: interpolate(progress, [0, 1], [0.96, 1]),
      }}
    >
      {config.conclusion}
    </div>
  );
};

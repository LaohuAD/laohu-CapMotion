import React from "react";
import {Easing, interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {editorialRevealProgress, enterProgress} from "../visual/motion";
import {ConclusionBar, MicroLabel, OverlayRegion, SceneStage, Surface} from "../visual/layout";
import {getVisualTheme, resolveSemanticAccent, typography, typeStyles} from "../visual/theme";

export const getStatementLayout = (presentation?: string) =>
  presentation === "overlay" ? "overlay" : "stage";

const titleToneColor = (
  tone: NonNullable<ComponentConfig["titleLines"]>[number]["tone"],
  theme: ReturnType<typeof getVisualTheme>,
  accent: string,
) => ({
  primary: theme.text,
  accent,
  muted: theme.muted,
  success: theme.success,
  warning: theme.accent2,
  danger: theme.danger,
})[tone];

const DisplayTitle: React.FC<{
  config: ComponentConfig;
  accent: string;
}> = ({config, accent}) => {
  const theme = getVisualTheme(config.stylePreset);
  if (!config.titleLines?.length) return <>{config.title}</>;
  return (
    <>
      {config.titleLines.map((line) => (
        <div key={`${line.tone}-${line.text}`} style={{color: titleToneColor(line.tone, theme, accent)}}>
          {line.text}
        </div>
      ))}
    </>
  );
};

export const KineticStatement: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const accent = resolveSemanticAccent(config.stylePreset, config.accentRole ?? "info");
  const timing = buildSceneTiming(config.durationInFrames);
  const titleProgress = interpolate(frame, [0, timing.introduceEnd], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (getStatementLayout(config.presentation) === "overlay") {
    const subtitleProgress = interpolate(
      frame,
      [timing.introduceEnd * 0.65, timing.buildEnd * 0.72],
      [0, 1],
      {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
    );
    return (
      <SceneStage config={config}>
        <OverlayRegion config={config}>
          <MicroLabel config={config}>{config.kicker ?? config.mode}</MicroLabel>
          <div
            style={{
              ...typeStyles.hero,
              marginTop: 22,
              maxWidth: 730,
              color: theme.text,
              fontSize: config.title.length > 16 ? 72 : 88,
              whiteSpace: "pre-line",
              opacity: titleProgress,
              translate: `${interpolate(titleProgress, [0, 1], [-28, 0])}px 0`,
            }}
          >
            <DisplayTitle config={config} accent={accent} />
          </div>
          {config.subtitle ? (
            <div
              style={{
                ...typeStyles.body,
                marginTop: 18,
                maxWidth: 690,
                color: theme.muted,
                fontSize: 28,
                opacity: subtitleProgress,
              }}
            >
              {config.subtitle}
            </div>
          ) : null}
          <div style={{display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap"}}>
            {config.items.map((item, index) => {
              const reveal = editorialRevealProgress(
                frame,
                index,
                config.items.length,
                timing.buildEnd,
                item.revealAtFrame,
              );
              return (
                <Surface
                  key={item.id}
                  theme={theme}
                  style={{
                    padding: "12px 18px",
                    border: `1px solid ${index === 0 ? accent : theme.line}`,
                    opacity: reveal.opacity,
                    translate: `${reveal.translateX}px 0`,
                    boxShadow: "none",
                  }}
                >
                  <div style={{...typeStyles.cardTitle, fontSize: 24}}>{item.label}</div>
                </Surface>
              );
            })}
          </div>
          {config.conclusion ? (
            <div
              style={{
                marginTop: 22,
                padding: "13px 18px",
                borderLeft: `5px solid ${accent}`,
                background: `${accent}18`,
                color: theme.text,
                fontSize: 25,
                ...typeStyles.cardTitle,
                opacity: interpolate(frame, [timing.buildEnd, timing.resolveEnd], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              {config.conclusion}
            </div>
          ) : null}
        </OverlayRegion>
      </SceneStage>
    );
  }

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
            ...typeStyles.microLabel,
            color: accent,
            fontSize: typography.label,
            opacity: titleProgress,
          }}
        >
          {config.mode.replaceAll("-", " ").toUpperCase()}
        </div>
        <div
          style={{
            ...typeStyles.hero,
            marginTop: 26,
            maxWidth: 1540,
            fontSize: config.title.length > 16 ? 94 : typography.hero,
            opacity: titleProgress,
            scale: interpolate(titleProgress, [0, 1], [0.86, 1]),
          }}
        >
          <DisplayTitle config={config} accent={accent} />
        </div>
        {config.subtitle ? (
          <div
            style={{
              ...typeStyles.body,
              marginTop: 30,
              maxWidth: 1320,
              color: theme.muted,
              fontSize: 42,
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
            const progress = item.revealAtFrame === undefined
              ? interpolate(
                  frame,
                  [timing.introduceEnd + index * 8, timing.introduceEnd + index * 8 + 18],
                  [0, 1],
                  {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
                )
              : enterProgress(
                  frame,
                  index,
                  config.items.length,
                  timing.buildEnd,
                  item.revealAtFrame,
                );
            return (
              <div
                key={item.id}
                style={{
                  padding: "18px 28px",
                  border: `2px solid ${index === 0 ? accent : theme.line}`,
                  background: index === 0 ? accent : theme.surface,
                  color: index === 0 && config.stylePreset !== "tech" ? "#FFFFFF" : theme.text,
                  fontSize: 34,
                  ...typeStyles.cardTitle,
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

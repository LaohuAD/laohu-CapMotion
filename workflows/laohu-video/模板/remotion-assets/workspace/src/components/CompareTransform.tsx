import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig, VisualItem} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {editorialRevealProgress} from "../visual/motion";
import {ConclusionBar, ItemCard, MicroLabel, OverlayRegion, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {getVisualTheme, resolveSemanticAccent, typeStyles} from "../visual/theme";

type CompareModePresentation = {
  leftTitle: string;
  rightTitle: string;
  showTransformationArrow: boolean;
  neutral: boolean;
};

export const getCompareModePresentation = (mode: string): CompareModePresentation => {
  switch (mode) {
    case "before-after":
      return {leftTitle: "改变之前", rightTitle: "改变之后", showTransformationArrow: true, neutral: false};
    case "wrong-right":
      return {leftTitle: "错误做法", rightTitle: "正确做法", showTransformationArrow: true, neutral: false};
    case "myth-fact":
      return {leftTitle: "常见误解", rightTitle: "事实", showTransformationArrow: true, neutral: false};
    case "a-b":
      return {leftTitle: "A", rightTitle: "B", showTransformationArrow: false, neutral: true};
    default:
      return {leftTitle: "对照项 A", rightTitle: "对照项 B", showTransformationArrow: false, neutral: true};
  }
};

export const getCompareLayout = (presentation?: string) =>
  presentation === "overlay" ? "stacked" : "split";

const getSideStatus = (
  item: VisualItem,
  side: "left" | "right",
  neutral: boolean,
): VisualItem["status"] => {
  if (neutral) return "default";
  if (item.status !== "default") return item.status;
  return side === "left" ? "negative" : "positive";
};

const EmptyCompareSide: React.FC<{
  theme: ReturnType<typeof getVisualTheme>;
  label: string;
}> = ({theme, label}) => (
  <div
    style={{
      minHeight: 96,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: `1px dashed ${theme.line}`,
      color: theme.muted,
      ...typeStyles.body,
      fontSize: 22,
    }}
  >
    {label}
  </div>
);

export const CompareTransform: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const accent = resolveSemanticAccent(config.stylePreset, config.accentRole ?? "info");
  const semantics = getCompareModePresentation(config.mode);
  const timing = buildSceneTiming(config.durationInFrames, config.items);
  const midpoint = Math.ceil(config.items.length / 2);
  const left = config.items.slice(0, midpoint);
  const right = config.items.slice(midpoint);
  const leftColor = semantics.neutral ? theme.muted : theme.danger;
  const rightColor = semantics.neutral ? theme.muted : theme.success;
  const conclusionColor = semantics.neutral ? theme.muted : accent;

  if (getCompareLayout(config.presentation) === "stacked") {
    const pairs = [
      {title: semantics.leftTitle, items: left, color: leftColor, side: "left" as const},
      {title: semantics.rightTitle, items: right, color: rightColor, side: "right" as const},
    ];
    return (
      <SceneStage config={config}>
        <OverlayRegion config={config}>
          <MicroLabel config={config}>{config.kicker ?? "COMPARE / DECIDE"}</MicroLabel>
          <div style={{...typeStyles.title, fontSize: 50, marginTop: 18}}>{config.title}</div>
          {config.subtitle ? <div style={{...typeStyles.body, fontSize: 25, color: theme.muted, marginTop: 12}}>{config.subtitle}</div> : null}
          <div style={{display: "grid", gap: 14, marginTop: 24}}>
            {pairs.map((pair, pairIndex) => {
              const pairRevealFrame = pair.items
                .map((item) => item.revealAtFrame)
                .filter((value): value is number => value !== undefined)
                .sort((a, b) => a - b)[0];
              const reveal = editorialRevealProgress(
                frame,
                pairIndex,
                pairs.length,
                timing.buildEnd,
                pairRevealFrame,
              );
              return (
                <Surface key={pair.title} theme={theme} style={{padding: "20px 22px", border: `1px solid ${pair.color}90`, opacity: reveal.opacity, translate: `${reveal.translateX}px 0`}}>
                  <div style={{...typeStyles.microChinese, fontSize: 18, color: pair.color}}>{pair.title}</div>
                  <div style={{display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14}}>
                    {pair.items.length ? pair.items.map((item, itemIndex) => {
                      const globalIndex = pair.side === "left" ? itemIndex : midpoint + itemIndex;
                      const itemReveal = editorialRevealProgress(
                        frame,
                        globalIndex,
                        config.items.length,
                        timing.buildEnd,
                        item.revealAtFrame,
                        item.actionDurationFrames,
                      );
                      return (
                        <div key={item.id} style={{...typeStyles.cardTitle, padding: "10px 14px", background: `${pair.color}14`, borderLeft: `3px solid ${pair.color}`, fontSize: 25, opacity: itemReveal.opacity, translate: `${itemReveal.translateX}px 0`}}>{item.label}</div>
                      );
                    }) : <EmptyCompareSide theme={theme} label="暂无对照项" />}
                  </div>
                </Surface>
              );
            })}
          </div>
          {config.conclusion ? (
            <div style={{...typeStyles.cardTitle, marginTop: 18, padding: "12px 16px", color: conclusionColor, background: `${conclusionColor}18`, borderLeft: `5px solid ${conclusionColor}`, fontSize: 24, opacity: interpolate(frame, [timing.buildEnd, timing.resolveEnd], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}}>{config.conclusion}</div>
          ) : null}
        </OverlayRegion>
      </SceneStage>
    );
  }

  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="COMPARE / TRANSFORM" />
      <div style={{display: "grid", gridTemplateColumns: "1fr 94px 1fr", gap: 24, marginTop: 28}}>
        <section>
          <div style={{...typeStyles.cardTitle, fontSize: 34, color: leftColor, marginBottom: 18}}>
            {semantics.leftTitle}
          </div>
          <div style={{display: "grid", gap: 18}}>
            {left.map((item, index) => (
              <ItemCard
                key={item.id}
                item={{...item, status: getSideStatus(item, "left", semantics.neutral)}}
                index={index}
                count={config.items.length}
                config={config}
              />
            ))}
          </div>
          {!left.length ? <EmptyCompareSide theme={theme} label="暂无 A 侧内容" /> : null}
        </section>
        <div style={{display: "flex", alignItems: "center", justifyContent: "center"}}>
          {semantics.showTransformationArrow ? (
            <div style={{...typeStyles.hero, fontSize: 72, color: accent}}>→</div>
          ) : (
            <div style={{width: 2, height: 132, background: theme.line}} />
          )}
        </div>
        <section>
          <div style={{...typeStyles.cardTitle, fontSize: 34, color: rightColor, marginBottom: 18}}>
            {semantics.rightTitle}
          </div>
          <div style={{display: "grid", gap: 18}}>
            {right.map((item, index) => (
              <ItemCard
                key={`right-${item.id}`}
                item={{...item, status: getSideStatus(item, "right", semantics.neutral)}}
                index={midpoint + index}
                count={config.items.length}
                config={config}
              />
            ))}
          </div>
          {!right.length ? <EmptyCompareSide theme={theme} label="暂无 B 侧内容" /> : null}
        </section>
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

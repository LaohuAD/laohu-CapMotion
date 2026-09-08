import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {editorialRevealProgress} from "../visual/motion";
import {ConclusionBar, ItemCard, MicroLabel, OverlayRegion, SceneHeader, SceneStage, Surface} from "../visual/layout";
import {getVisualTheme, resolveSemanticAccent, typeStyles} from "../visual/theme";

export const getCompareLayout = (presentation?: string) =>
  presentation === "overlay" ? "stacked" : "split";

export const CompareTransform: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const accent = resolveSemanticAccent(config.stylePreset, config.accentRole ?? "info");
  const timing = buildSceneTiming(config.durationInFrames);
  const midpoint = Math.ceil(config.items.length / 2);
  const left = config.items.slice(0, midpoint);
  const right = config.items.slice(midpoint);
  if (getCompareLayout(config.presentation) === "stacked") {
    const pairs = [
      {title: config.mode === "before-after" ? "改变之前" : "表面修补", items: left, color: theme.danger},
      {title: config.mode === "before-after" ? "改变之后" : "系统进化", items: right.length ? right : left, color: theme.success},
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
                    {pair.items.map((item, itemIndex) => {
                      const globalIndex = pairIndex === 0 ? itemIndex : midpoint + itemIndex;
                      const itemReveal = item.revealAtFrame === undefined
                        ? {opacity: 1, translateX: 0}
                        : editorialRevealProgress(
                            frame,
                            globalIndex,
                            config.items.length,
                            timing.buildEnd,
                            item.revealAtFrame,
                          );
                      return (
                        <div key={item.id} style={{...typeStyles.cardTitle, padding: "10px 14px", background: `${pair.color}14`, borderLeft: `3px solid ${pair.color}`, fontSize: 25, opacity: itemReveal.opacity, translate: `${itemReveal.translateX}px 0`}}>{item.label}</div>
                      );
                    })}
                  </div>
                </Surface>
              );
            })}
          </div>
          {config.conclusion ? (
            <div style={{...typeStyles.cardTitle, marginTop: 18, padding: "12px 16px", color: theme.text, background: `${accent}18`, borderLeft: `5px solid ${accent}`, fontSize: 24, opacity: interpolate(frame, [timing.buildEnd, timing.resolveEnd], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}}>{config.conclusion}</div>
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
          <div style={{...typeStyles.cardTitle, fontSize: 34, color: theme.danger, marginBottom: 18}}>
            {config.mode === "before-after" ? "改变之前" : "容易卡住的做法"}
          </div>
          <div style={{display: "grid", gap: 18}}>
            {left.map((item, index) => (
              <ItemCard
                key={item.id}
                item={{...item, status: "negative"}}
                index={index}
                count={config.items.length}
                config={config}
              />
            ))}
          </div>
        </section>
        <div style={{display: "flex", alignItems: "center", justifyContent: "center"}}>
          <div style={{...typeStyles.hero, fontSize: 72, color: theme.accent}}>→</div>
        </div>
        <section>
          <div style={{...typeStyles.cardTitle, fontSize: 34, color: theme.success, marginBottom: 18}}>
            {config.mode === "before-after" ? "改变之后" : "真正有效的做法"}
          </div>
          <div style={{display: "grid", gap: 18}}>
            {(right.length ? right : left).map((item, index) => (
              <ItemCard
                key={`right-${item.id}`}
                item={{...item, status: index === 0 ? "active" : "positive"}}
                index={midpoint + index}
                count={config.items.length}
                config={config}
              />
            ))}
          </div>
        </section>
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

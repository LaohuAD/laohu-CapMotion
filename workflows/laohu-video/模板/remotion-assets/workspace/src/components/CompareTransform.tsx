import React from "react";
import type {ComponentConfig} from "../schemas/components";
import {ConclusionBar, ItemCard, SceneHeader, SceneStage} from "../visual/layout";
import {getVisualTheme} from "../visual/theme";

export const CompareTransform: React.FC<{config: ComponentConfig}> = ({config}) => {
  const theme = getVisualTheme(config.stylePreset);
  const midpoint = Math.ceil(config.items.length / 2);
  const left = config.items.slice(0, midpoint);
  const right = config.items.slice(midpoint);
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="COMPARE / TRANSFORM" />
      <div style={{display: "grid", gridTemplateColumns: "1fr 94px 1fr", gap: 24, marginTop: 28}}>
        <section>
          <div style={{fontSize: 34, fontWeight: 900, color: theme.danger, marginBottom: 18}}>
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
          <div style={{fontSize: 72, color: theme.accent, fontWeight: 900}}>→</div>
        </div>
        <section>
          <div style={{fontSize: 34, fontWeight: 900, color: theme.success, marginBottom: 18}}>
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

import React from "react";
import type {ComponentConfig} from "../schemas/components";
import {ConclusionBar, ItemCard, SceneHeader, SceneStage} from "../visual/layout";
import {getVisualTheme} from "../visual/theme";

export const getDecisionGridColumns = (itemCount: number) =>
  itemCount > 4 ? 3 : 2;

export const DecisionCanvas: React.FC<{config: ComponentConfig}> = ({config}) => {
  const theme = getVisualTheme(config.stylePreset);
  const isRanking = config.mode === "ranking" || config.mode === "scorecard";
  const columns = getDecisionGridColumns(config.items.length);
  return (
    <SceneStage config={config}>
      <SceneHeader config={config} kicker="DECIDE / CHOOSE" />
      <div style={{position: "relative", marginTop: 24, height: 660}}>
        {isRanking ? (
          <div style={{display: "grid", gap: 16}}>
            {[...config.items]
              .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
              .map((item, index) => (
                <ItemCard
                  key={item.id}
                  item={{...item, status: index === 0 ? "active" : item.status}}
                  index={index}
                  count={config.items.length}
                  config={config}
                  style={{minHeight: 110, width: `${100 - index * 7}%`}}
                />
              ))}
          </div>
        ) : (
          <>
            {columns === 2 ? (
              <>
                <div style={{position: "absolute", left: 0, top: "50%", right: 0, height: 3, background: theme.line}} />
                <div style={{position: "absolute", left: "50%", top: 0, bottom: 0, width: 3, background: theme.line}} />
              </>
            ) : null}
            <div style={{display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 24, height: "100%", padding: 24}}>
              {config.items.map((item, index) => (
                <ItemCard
                  key={item.id}
                  item={{...item, status: index === 0 ? "active" : item.status}}
                  index={index}
                  count={config.items.length}
                  config={config}
                  style={{height: "100%"}}
                />
              ))}
            </div>
            {columns === 2 ? (
              <>
                <div style={{position: "absolute", right: 12, top: "48%", fontSize: 28, color: theme.muted}}>收益更高 →</div>
                <div style={{position: "absolute", left: "51%", top: 2, fontSize: 28, color: theme.muted}}>更适合当前阶段 ↑</div>
              </>
            ) : (
              <div style={{position: "absolute", right: 24, top: -12, fontSize: 28, color: theme.muted}}>按沉淀资产与验证指标选择</div>
            )}
          </>
        )}
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

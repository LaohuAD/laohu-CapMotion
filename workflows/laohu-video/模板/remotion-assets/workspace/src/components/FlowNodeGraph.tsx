import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import type {ComponentConfig, VisualItem} from "../schemas/components";
import {buildSceneTiming} from "../utils/timing";
import {
  buildFlowTopology,
  getFlowLayout,
  type FlowNodePosition,
  type FlowTopology,
} from "../utils/flowTopology";
import {enterProgress} from "../visual/motion";
import {
  ConclusionBar,
  MicroLabel,
  OverlayRegion,
  SceneHeader,
  SceneStage,
  Surface,
} from "../visual/layout";
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

const getFlowKicker = (mode: string) => {
  switch (mode) {
    case "branch":
      return "FLOW / BRANCH";
    case "loop":
      return "FLOW / LOOP";
    case "data-flow":
      return "DATA / FLOW";
    case "artifact-flow":
      return "FLOW / PATH";
    default:
      return "FLOW / PATH";
  }
};

const getPosition = (positions: FlowNodePosition[], id: string) => {
  const position = positions.find((candidate) => candidate.id === id);
  if (!position) throw new Error(`FlowNodeGraph layout is missing node "${id}"`);
  return position;
};

type FlowPoint = {x: number; y: number};

export type FlowEdgeRoute = {
  points: FlowPoint[];
  path: string;
  direct: boolean;
};

const getNodeRect = (position: FlowNodePosition) => ({
  left: position.x,
  right: position.x + position.width,
  top: position.y,
  bottom: position.y + position.height,
});

const intersectsInterior = (a: FlowPoint, b: FlowPoint, rect: ReturnType<typeof getNodeRect>) => {
  if (Math.abs(a.y - b.y) < 0.001) {
    const y = a.y;
    return y > rect.top + 0.001 && y < rect.bottom - 0.001 &&
      Math.max(Math.min(a.x, b.x), rect.left) < Math.min(Math.max(a.x, b.x), rect.right);
  }
  if (Math.abs(a.x - b.x) < 0.001) {
    const x = a.x;
    return x > rect.left + 0.001 && x < rect.right - 0.001 &&
      Math.max(Math.min(a.y, b.y), rect.top) < Math.min(Math.max(a.y, b.y), rect.bottom);
  }
  return true;
};

const routeIsClear = (
  points: FlowPoint[],
  layout: ReturnType<typeof getFlowLayout>,
  sourceId: string,
  targetId: string,
) => {
  const obstacles = layout.positions
    .filter((position) => position.id !== sourceId && position.id !== targetId)
    .map(getNodeRect);
  return points.slice(1).every((point, index) =>
    obstacles.every((obstacle) => !intersectsInterior(points[index], point, obstacle)),
  );
};

const collapseCollinearPoints = (points: FlowPoint[]) => points.filter((point, index) => {
  if (index === 0 || index === points.length - 1) return true;
  const previous = points[index - 1];
  const next = points[index + 1];
  return !(
    (Math.abs(previous.x - point.x) < 0.001 && Math.abs(point.x - next.x) < 0.001) ||
    (Math.abs(previous.y - point.y) < 0.001 && Math.abs(point.y - next.y) < 0.001)
  );
});

const pointsToPath = (points: FlowPoint[]) =>
  points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

const getExternalRailPoints = (
  source: FlowNodePosition,
  target: FlowNodePosition,
  layout: ReturnType<typeof getFlowLayout>,
) => {
  const sourceAnchor = {x: source.x + source.width / 2, y: source.y + source.height};
  const targetAnchor = {x: target.x + target.width / 2, y: target.y};
  const clearance = layout.routing.clearance;
  const sourceExit = {x: sourceAnchor.x, y: sourceAnchor.y + clearance};
  const targetEntry = {x: targetAnchor.x, y: targetAnchor.y - clearance};
  const exitRail = sourceAnchor.x >= layout.width / 2
    ? layout.routing.rightRail
    : layout.routing.leftRail;
  const entryRail = targetAnchor.x >= layout.width / 2
    ? layout.routing.rightRail
    : layout.routing.leftRail;
  const points: FlowPoint[] = [
    sourceAnchor,
    sourceExit,
    {x: exitRail, y: sourceExit.y},
    {x: exitRail, y: layout.routing.bottomRail},
  ];
  if (exitRail !== entryRail) points.push({x: entryRail, y: layout.routing.bottomRail});
  points.push(
    {x: entryRail, y: targetEntry.y},
    targetEntry,
    targetAnchor,
  );
  return points;
};

export const getFlowEdgeRoute = (
  topology: FlowTopology,
  layout: ReturnType<typeof getFlowLayout>,
  edge: FlowTopology["edges"][number],
  presentation: "stage" | "overlay",
) : FlowEdgeRoute => {
  const source = getPosition(layout.positions, edge.from);
  const target = getPosition(layout.positions, edge.to);
  const isLoopBack =
    topology.canonicalMode === "loop" && edge.targetIndex <= edge.sourceIndex;

  const sameRowForward = source.row === target.row && target.x > source.x;
  const directPoints = sameRowForward
    ? [
        {x: source.x + source.width, y: source.y + source.height / 2},
        {x: target.x, y: target.y + target.height / 2},
      ]
    : undefined;
  if (!isLoopBack && directPoints && routeIsClear(directPoints, layout, edge.from, edge.to)) {
    return {points: directPoints, path: pointsToPath(directPoints), direct: true};
  }

  // A diagonal branch can stay in the column gap. Row wraps, backward edges,
  // skipped nodes and loop returns use the reserved outer rails instead of
  // drawing through a card.
  if (!isLoopBack && target.x > source.x && source.row !== target.row) {
    const sourceAnchor = {x: source.x + source.width, y: source.y + source.height / 2};
    const targetAnchor = {x: target.x, y: target.y + target.height / 2};
    const bendX = (sourceAnchor.x + targetAnchor.x) / 2;
    const localPoints = [sourceAnchor, {x: bendX, y: sourceAnchor.y}, {x: bendX, y: targetAnchor.y}, targetAnchor];
    if (routeIsClear(localPoints, layout, edge.from, edge.to)) {
      const points = collapseCollinearPoints(localPoints);
      return {points, path: pointsToPath(points), direct: false};
    }
  }

  const points = collapseCollinearPoints(getExternalRailPoints(source, target, layout));
  return {points, path: pointsToPath(points), direct: false};
};

export const getFlowEdgePath = (
  topology: FlowTopology,
  layout: ReturnType<typeof getFlowLayout>,
  edge: FlowTopology["edges"][number],
  presentation: "stage" | "overlay",
) => getFlowEdgeRoute(topology, layout, edge, presentation).path;

export const getFlowEdgeLabelPoint = (
  topology: FlowTopology,
  layout: ReturnType<typeof getFlowLayout>,
  edge: FlowTopology["edges"][number],
  presentation: "stage" | "overlay",
) => {
  const route = getFlowEdgeRoute(topology, layout, edge, presentation);
  const segments = route.points.slice(1).map((point, index) => ({
    from: route.points[index],
    to: point,
    length: Math.hypot(point.x - route.points[index].x, point.y - route.points[index].y),
  }));
  const horizontal = segments.filter((segment) => Math.abs(segment.from.y - segment.to.y) < 0.001);
  const segment = [...horizontal, ...segments].sort((a, b) => b.length - a.length)[0];
  const fontSize = presentation === "overlay" ? 14 : 20;
  if (!segment) return {x: 0, y: 0};
  const x = (segment.from.x + segment.to.x) / 2;
  const y = (segment.from.y + segment.to.y) / 2;
  return Math.abs(segment.from.y - segment.to.y) < 0.001
    ? {x, y: y - fontSize * 0.75}
    : {x: x + fontSize * 0.75, y};
};

export const getFlowEdgeLabelLayouts = (
  topology: FlowTopology,
  layout: ReturnType<typeof getFlowLayout>,
  presentation: "stage" | "overlay",
) => {
  const fontSize = presentation === "overlay" ? 14 : 20;
  const height = fontSize + 12;
  const occupied: Array<{x: number; y: number; width: number; height: number}> = [];
  return topology.edges.map((edge) => {
    if (!edge.label) return undefined;
    const point = getFlowEdgeLabelPoint(topology, layout, edge, presentation);
    const width = Math.max(44, edge.label.length * fontSize * 0.95 + 18);
    let candidate = {...point};
    let attempts = 0;
    while (occupied.some((box) =>
      Math.abs(candidate.x - box.x) < (width + box.width) / 2 &&
      Math.abs(candidate.y - box.y) < (height + box.height) / 2,
    ) && attempts < 8) {
      candidate = {...candidate, y: point.y + (attempts % 2 === 0 ? 1 : -1) * height * (Math.floor(attempts / 2) + 1)};
      attempts += 1;
    }
    occupied.push({x: candidate.x, y: candidate.y, width, height});
    return {x: candidate.x, y: candidate.y, width, height, fontSize};
  });
};

const FlowEdges: React.FC<{
  config: ComponentConfig;
  topology: FlowTopology;
  layout: ReturnType<typeof getFlowLayout>;
  progressById: Map<string, number>;
}> = ({config, topology, layout, progressById}) => {
  const theme = getVisualTheme(config.stylePreset);
  const markerId = `flow-arrow-${config.mode}-${topology.nodeIds.join("-")}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const presentation = config.presentation === "overlay" ? "overlay" : "stage";
  const labelLayouts = getFlowEdgeLabelLayouts(topology, layout, presentation);
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.accent} />
        </marker>
      </defs>
      {topology.edges.map((edge, edgeIndex) => {
        const progress = Math.min(
          progressById.get(edge.from) ?? 0,
          progressById.get(edge.to) ?? 0,
        );
        const path = getFlowEdgePath(topology, layout, edge, presentation);
        const labelLayout = labelLayouts[edgeIndex];
        return (
          <React.Fragment key={edge.id}>
            <path
              d={path}
              fill="none"
              stroke={theme.accent}
              strokeWidth={presentation === "overlay" ? 3 : 4}
              strokeLinecap="round"
              opacity={progress}
              markerEnd={`url(#${markerId})`}
            />
            {labelLayout && edge.label ? (
              <g opacity={progress}>
                <rect
                  x={labelLayout.x - labelLayout.width / 2}
                  y={labelLayout.y - labelLayout.height / 2}
                  width={labelLayout.width}
                  height={labelLayout.height}
                  rx={4}
                  fill={theme.surface}
                  stroke={theme.line}
                  strokeWidth={1}
                />
                <text
                  x={labelLayout.x}
                  y={labelLayout.y + labelLayout.fontSize * 0.34}
                  fill={theme.text}
                  fontSize={labelLayout.fontSize}
                  fontWeight={700}
                  textAnchor="middle"
                >
                  {edge.label}
                </text>
              </g>
            ) : null}
          </React.Fragment>
        );
      })}
    </svg>
  );
};

const getItemProgress = (
  frame: number,
  item: VisualItem,
  topology: FlowTopology,
  timing: ReturnType<typeof buildSceneTiming>,
) =>
  enterProgress(
    frame,
    Math.max(0, topology.order.indexOf(item.id)),
    topology.order.length,
    timing.buildEnd,
    item.revealAtFrame,
    item.actionDurationFrames,
  );

const FlowNodeCard: React.FC<{
  config: ComponentConfig;
  item: VisualItem;
  itemIndex: number;
  position: FlowNodePosition;
  progress: number;
  compact: boolean;
  legacyOverlayLinear: boolean;
  isLast: boolean;
}> = ({config, item, itemIndex, position, progress, compact, legacyOverlayLinear, isLast}) => {
  const theme = getVisualTheme(config.stylePreset);
  const itemAccent =
    item.status === "negative"
      ? theme.danger
      : item.status === "positive"
        ? theme.success
        : resolveSemanticAccent(config.stylePreset, config.accentRole ?? "info");
  const active = item.status === "active" || isLast;
  const surfaceActive = legacyOverlayLinear ? item.status === "active" : active;
  return (
    <Surface
      theme={theme}
      active={surfaceActive}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        minHeight: position.height,
        padding: compact
          ? legacyOverlayLinear
            ? "15px 18px 15px 64px"
            : "14px 16px 14px 50px"
          : "28px 30px",
        opacity: progress,
        transform: compact
          ? `translateX(${interpolate(progress, [0, 1], [legacyOverlayLinear ? -22 : -18, 0])}px)`
          : undefined,
        border: legacyOverlayLinear
          ? `1px solid ${item.status === "active" ? itemAccent : theme.line}`
          : undefined,
        zIndex: 1,
        overflow: "hidden",
      }}
    >
      <div
        style={
          compact
            ? {
                position: "absolute",
                left: legacyOverlayLinear ? 13 : 11,
                top: legacyOverlayLinear ? 21 : 16,
                width: 26,
                height: 26,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: itemAccent,
                color: "#08100F",
                ...typeStyles.number,
                fontSize: 14,
              }
            : {
                ...typeStyles.number,
                fontSize: 28,
                color: theme.accent,
              }
        }
      >
        {compact ? itemIndex + 1 : String(itemIndex + 1).padStart(2, "0")}
      </div>
      <div
        style={{
          ...typeStyles.cardTitle,
          fontSize: compact ? (legacyOverlayLinear ? 29 : 24) : typography.item,
          marginTop: compact ? 0 : 14,
          color: compact ? (surfaceActive ? itemAccent : theme.text) : undefined,
        }}
      >
        {item.label}
      </div>
      {item.description ? (
        <div
          style={{
            ...typeStyles.body,
            fontSize: compact ? (legacyOverlayLinear ? 20 : 16) : 32,
            lineHeight: compact && !legacyOverlayLinear ? 1.25 : undefined,
            color: theme.muted,
            marginTop: compact ? 5 : 16,
          }}
        >
          {item.description}
        </div>
      ) : null}
    </Surface>
  );
};

const FlowGraph: React.FC<{
  config: ComponentConfig;
  topology: FlowTopology;
  layout: ReturnType<typeof getFlowLayout>;
  timing: ReturnType<typeof buildSceneTiming>;
  frame: number;
  compact: boolean;
}> = ({config, topology, layout, timing, frame, compact}) => {
  const legacyOverlayLinear = compact && topology.canonicalMode === "linear";
  const progressById = new Map(
    config.items.map((item) => [item.id, getItemProgress(frame, item, topology, timing)]),
  );
  const itemById = new Map(config.items.map((item) => [item.id, item]));
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: layout.height,
        overflow: "visible",
      }}
    >
      <FlowEdges
        config={config}
        topology={topology}
        layout={layout}
        progressById={progressById}
      />
      {layout.positions.map((position) => {
        const item = itemById.get(position.id);
        if (!item) throw new Error(`FlowNodeGraph layout references unknown node "${position.id}"`);
        const itemIndex = topology.nodeIds.indexOf(item.id);
        return (
          <FlowNodeCard
            key={item.id}
            config={config}
            item={item}
            itemIndex={itemIndex}
            position={position}
            progress={progressById.get(item.id) ?? 0}
            compact={compact}
            legacyOverlayLinear={legacyOverlayLinear}
            isLast={item.id === topology.order[topology.order.length - 1]}
          />
        );
      })}
    </div>
  );
};

/**
 * Keep the pre-topology stage renderer for the legacy linear shape. Existing
 * four-card configs without explicit links are a compatibility surface; the
 * topology renderer is only allowed to change pixels when a caller opts into
 * explicit relationships or a different mode.
 */
const LegacyLinearStage: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const theme = getVisualTheme(config.stylePreset);
  const timing = buildSceneTiming(config.durationInFrames, config.items);
  const columns = getFlowColumns(config.presentation, config.items.length);
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
          const progress = enterProgress(
            frame,
            index,
            config.items.length,
            timing.buildEnd,
            item.revealAtFrame,
            item.actionDurationFrames,
          );
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

export const FlowNodeGraph: React.FC<{config: ComponentConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const presentation = config.presentation === "overlay" ? "overlay" : "stage";
  const topology = buildFlowTopology(config.mode, config.items, config.links);
  const theme = getVisualTheme(config.stylePreset);
  const accent = resolveSemanticAccent(config.stylePreset, config.accentRole ?? "info");
  const timing = buildSceneTiming(config.durationInFrames, config.items);
  const layout = getFlowLayout(topology, presentation);
  const compact = presentation === "overlay";

  if (presentation === "stage" && config.mode === "linear" && config.links.length === 0) {
    return <LegacyLinearStage config={config} />;
  }

  if (presentation === "overlay") {
    return (
      <SceneStage config={config}>
        <OverlayRegion config={config}>
          <MicroLabel config={config}>
            {config.kicker ?? (config.mode === "linear" || config.mode === "artifact-flow"
              ? "SYSTEM / SEQUENCE"
              : getFlowKicker(config.mode))}
          </MicroLabel>
          <div style={{...typeStyles.title, fontSize: 50, marginTop: 18}}>{config.title}</div>
          {config.subtitle ? (
            <div style={{...typeStyles.body, fontSize: 24, color: theme.muted, marginTop: 10}}>
              {config.subtitle}
            </div>
          ) : null}
          <div style={{position: "relative", marginTop: 22}}>
            <FlowGraph
              config={config}
              topology={topology}
              layout={layout}
              timing={timing}
              frame={frame}
              compact={compact}
            />
          </div>
          {config.conclusion ? (
            <div
              style={{
                ...typeStyles.cardTitle,
                marginTop: 14,
                color: accent,
                fontSize: 23,
                opacity: getFlowConclusionOpacity(frame, timing),
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
      <SceneHeader config={config} kicker={config.kicker ?? getFlowKicker(config.mode)} />
      <div style={{marginTop: 42}}>
        <FlowGraph
          config={config}
          topology={topology}
          layout={layout}
          timing={timing}
          frame={frame}
          compact={compact}
        />
      </div>
      <ConclusionBar config={config} />
    </SceneStage>
  );
};

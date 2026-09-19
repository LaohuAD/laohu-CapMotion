export type FlowNodeLike = {
  id: string;
};

export type FlowLinkLike = {
  from: string;
  to: string;
  label?: string;
};

/**
 * `artifact-flow` is kept as a compatibility spelling for existing configs.
 * New configs should use `data-flow` when the nodes represent data or artifacts.
 */
export const flowNodeGraphModes = [
  "linear",
  "branch",
  "loop",
  "data-flow",
  "artifact-flow",
] as const;

export type FlowNodeGraphMode = (typeof flowNodeGraphModes)[number];
export type CanonicalFlowMode = Exclude<FlowNodeGraphMode, "artifact-flow">;

export type FlowTopologyIssue = {
  code:
  | "duplicate-node"
  | "dangling-link"
  | "duplicate-link"
  | "self-link"
  | "missing-links"
  | "disconnected"
  | "cycle"
  | "missing-branch"
  | "not-linear"
  | "unknown-mode";
  message: string;
  path?: Array<string | number>;
};

export type FlowTopologyEdge = FlowLinkLike & {
  id: string;
  sourceIndex: number;
  targetIndex: number;
};

export type FlowTopology = {
  mode: FlowNodeGraphMode;
  canonicalMode: CanonicalFlowMode;
  nodeIds: string[];
  edges: FlowTopologyEdge[];
  roots: string[];
  leaves: string[];
  outgoing: Record<string, string[]>;
  incoming: Record<string, string[]>;
  levels: Record<string, number>;
  order: string[];
  hasCycle: boolean;
  isSimpleChain: boolean;
};

const isKnownMode = (mode: string): mode is FlowNodeGraphMode =>
  (flowNodeGraphModes as readonly string[]).includes(mode);

export const normalizeFlowMode = (mode: string): CanonicalFlowMode | null => {
  if (!isKnownMode(mode)) return null;
  return mode === "artifact-flow" ? "data-flow" : mode;
};

const getEdgeKey = (from: string, to: string) => `${from}->${to}`;

const makeAdjacency = (nodeIds: string[], links: readonly FlowLinkLike[]) => {
  const outgoing: Record<string, string[]> = Object.fromEntries(
    nodeIds.map((id) => [id, []]),
  );
  const incoming: Record<string, string[]> = Object.fromEntries(
    nodeIds.map((id) => [id, []]),
  );
  for (const link of links) {
    outgoing[link.from]?.push(link.to);
    incoming[link.to]?.push(link.from);
  }
  return {outgoing, incoming};
};

const hasDirectedCycle = (
  nodeIds: string[],
  outgoing: Record<string, string[]>,
) => {
  const state = new Map<string, 0 | 1 | 2>();

  const visit = (nodeId: string): boolean => {
    const current = state.get(nodeId) ?? 0;
    if (current === 1) return true;
    if (current === 2) return false;
    state.set(nodeId, 1);
    for (const next of outgoing[nodeId] ?? []) {
      if (visit(next)) return true;
    }
    state.set(nodeId, 2);
    return false;
  };

  return nodeIds.some((nodeId) => visit(nodeId));
};

const isWeaklyConnected = (
  nodeIds: string[],
  outgoing: Record<string, string[]>,
  incoming: Record<string, string[]>,
) => {
  if (nodeIds.length <= 1) return true;
  const seen = new Set<string>();
  const queue = [nodeIds[0]];
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    queue.push(...(outgoing[current] ?? []), ...(incoming[current] ?? []));
  }
  return seen.size === nodeIds.length;
};

const getLevels = (
  nodeIds: string[],
  outgoing: Record<string, string[]>,
  incoming: Record<string, string[]>,
  hasCycle: boolean,
) => {
  const levels: Record<string, number> = Object.fromEntries(
    nodeIds.map((id) => [id, 0]),
  );
  if (hasCycle) return levels;

  const pending = new Map(nodeIds.map((id) => [id, incoming[id]?.length ?? 0]));
  const queue = nodeIds.filter((id) => pending.get(id) === 0);
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    for (const next of outgoing[current] ?? []) {
      levels[next] = Math.max(levels[next] ?? 0, (levels[current] ?? 0) + 1);
      pending.set(next, (pending.get(next) ?? 1) - 1);
      if (pending.get(next) === 0) queue.push(next);
    }
  }
  return levels;
};

const getLinearOrder = (
  nodeIds: string[],
  outgoing: Record<string, string[]>,
  incoming: Record<string, string[]>,
) => {
  const root = nodeIds.find((id) => (incoming[id]?.length ?? 0) === 0);
  if (!root) return nodeIds;
  const order: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = root;
  while (current && !seen.has(current)) {
    order.push(current);
    seen.add(current);
    current = outgoing[current]?.[0];
  }
  return order.length === nodeIds.length ? order : nodeIds;
};

const getLoopOrder = (
  nodeIds: string[],
  outgoing: Record<string, string[]>,
  incoming: Record<string, string[]>,
) => {
  const start = nodeIds.find((id) => (incoming[id]?.length ?? 0) === 0) ?? nodeIds[0];
  const order: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = start;
  while (current && !seen.has(current)) {
    order.push(current);
    seen.add(current);
    current = outgoing[current]?.find((next) => !seen.has(next)) ?? outgoing[current]?.[0];
  }
  for (const nodeId of nodeIds) {
    if (!seen.has(nodeId)) order.push(nodeId);
  }
  return order;
};

/**
 * Validate the relationship contract before rendering. Linear graphs may omit
 * links for backwards compatibility; they receive the same sequential links
 * that the old renderer implied. Every other mode must declare its edges.
 */
export const validateFlowTopology = (
  mode: string,
  nodes: readonly FlowNodeLike[],
  links: readonly FlowLinkLike[],
): FlowTopologyIssue[] => {
  const canonicalMode = normalizeFlowMode(mode);
  if (!canonicalMode) {
    return [{
      code: "unknown-mode",
      message: `FlowNodeGraph mode "${mode}" is not supported`,
      path: ["mode"],
    }];
  }

  const issues: FlowTopologyIssue[] = [];
  const nodeIds = nodes.map((node) => node.id);
  const nodeIdSet = new Set<string>();
  nodeIds.forEach((id, index) => {
    if (nodeIdSet.has(id)) {
      issues.push({
        code: "duplicate-node",
        message: `FlowNodeGraph node id "${id}" must be unique`,
        path: ["items", index, "id"],
      });
    }
    nodeIdSet.add(id);
  });

  const seenLinks = new Set<string>();
  for (const [index, link] of links.entries()) {
    if (!nodeIdSet.has(link.from)) {
      issues.push({
        code: "dangling-link",
        message: `FlowNodeGraph link.from "${link.from}" does not match an item id`,
        path: ["links", index, "from"],
      });
    }
    if (!nodeIdSet.has(link.to)) {
      issues.push({
        code: "dangling-link",
        message: `FlowNodeGraph link.to "${link.to}" does not match an item id`,
        path: ["links", index, "to"],
      });
    }
    const edgeKey = getEdgeKey(link.from, link.to);
    if (seenLinks.has(edgeKey)) {
      issues.push({
        code: "duplicate-link",
        message: `FlowNodeGraph link "${edgeKey}" is declared more than once`,
        path: ["links", index],
      });
    }
    seenLinks.add(edgeKey);
    if (link.from === link.to && canonicalMode !== "loop") {
      issues.push({
        code: "self-link",
        message: `FlowNodeGraph self-link "${edgeKey}" is only supported by loop mode`,
        path: ["links", index],
      });
    }
  }

  const sequentialLinks = nodeIds.slice(0, -1).map((from, index) => ({
    from,
    to: nodeIds[index + 1],
  }));
  const effectiveLinks =
    canonicalMode === "linear" && links.length === 0 ? sequentialLinks : links;
  if (canonicalMode !== "linear" && links.length === 0) {
    issues.push({
      code: "missing-links",
      message: `${mode} mode requires explicit links; implicit array order is not enough`,
      path: ["links"],
    });
  }

  const validEffectiveLinks = effectiveLinks.filter(
    (link) => nodeIdSet.has(link.from) && nodeIdSet.has(link.to),
  );
  const {outgoing, incoming} = makeAdjacency(nodeIds, validEffectiveLinks);
  const hasCycle = hasDirectedCycle(nodeIds, outgoing);
  const weaklyConnected = isWeaklyConnected(nodeIds, outgoing, incoming);

  if (!weaklyConnected && nodeIds.length > 1) {
    issues.push({
      code: "disconnected",
      message: `${mode} mode must keep all items in one connected graph`,
      path: ["links"],
    });
  }

  switch (canonicalMode) {
    case "linear": {
      const isLinearPath =
        !hasCycle &&
        nodeIds.length === 1
          ? true
          : !hasCycle &&
            effectiveLinks.length === nodeIds.length - 1 &&
            nodeIds.every((id) => (outgoing[id]?.length ?? 0) <= 1) &&
            nodeIds.every((id) => (incoming[id]?.length ?? 0) <= 1) &&
            weaklyConnected;
      if (!isLinearPath) {
        issues.push({
          code: "not-linear",
          message: "linear mode supports one acyclic path; use branch, loop, or data-flow for other topology",
          path: ["links"],
        });
      }
      break;
    }
    case "branch":
      if (hasCycle) {
        issues.push({
          code: "cycle",
          message: "branch mode does not support cycles; use loop mode for a returning edge",
          path: ["links"],
        });
      }
      if (!nodeIds.some((id) => (outgoing[id]?.length ?? 0) > 1)) {
        issues.push({
          code: "missing-branch",
          message: "branch mode requires at least one node with two outgoing links",
          path: ["links"],
        });
      }
      break;
    case "loop":
      if (!hasCycle) {
        issues.push({
          code: "cycle",
          message: "loop mode requires at least one returning edge",
          path: ["links"],
        });
      }
      break;
    case "data-flow":
      if (hasCycle) {
        issues.push({
          code: "cycle",
          message: "data-flow mode does not support cycles; use loop mode for feedback",
          path: ["links"],
        });
      }
      break;
  }

  return issues;
};

export const validateFlowLinks = validateFlowTopology;

export const buildFlowTopology = (
  mode: string,
  nodes: readonly FlowNodeLike[],
  links: readonly FlowLinkLike[],
): FlowTopology => {
  const issues = validateFlowTopology(mode, nodes, links);
  if (issues.length) {
    throw new Error(issues.map((issue) => issue.message).join("; "));
  }

  const canonicalMode = normalizeFlowMode(mode);
  if (!canonicalMode || !isKnownMode(mode)) {
    throw new Error(`FlowNodeGraph mode "${mode}" is not supported`);
  }

  const nodeIds = nodes.map((node) => node.id);
  const sequentialLinks = nodeIds.slice(0, -1).map((from, index) => ({
    from,
    to: nodeIds[index + 1],
  }));
  const effectiveLinks =
    canonicalMode === "linear" && links.length === 0 ? sequentialLinks : links;
  const {outgoing, incoming} = makeAdjacency(nodeIds, effectiveLinks);
  const hasCycle = hasDirectedCycle(nodeIds, outgoing);
  const roots = nodeIds.filter((id) => (incoming[id]?.length ?? 0) === 0);
  const leaves = nodeIds.filter((id) => (outgoing[id]?.length ?? 0) === 0);
  const levels = getLevels(nodeIds, outgoing, incoming, hasCycle);
  const isSimpleChain =
    !hasCycle &&
    nodeIds.every((id) => (outgoing[id]?.length ?? 0) <= 1) &&
    nodeIds.every((id) => (incoming[id]?.length ?? 0) <= 1);
  const order =
    canonicalMode === "linear" || (canonicalMode === "data-flow" && isSimpleChain)
      ? getLinearOrder(nodeIds, outgoing, incoming)
      : canonicalMode === "loop"
        ? getLoopOrder(nodeIds, outgoing, incoming)
        : nodeIds;
  const nodeIndex = new Map(nodeIds.map((id, index) => [id, index]));
  const edges = effectiveLinks.map((link) => ({
    ...link,
    id: getEdgeKey(link.from, link.to),
    sourceIndex: nodeIndex.get(link.from) ?? -1,
    targetIndex: nodeIndex.get(link.to) ?? -1,
  }));
  return {
    mode,
    canonicalMode,
    nodeIds,
    edges,
    roots,
    leaves,
    outgoing,
    incoming,
    levels,
    order,
    hasCycle,
    isSimpleChain,
  };
};

export type FlowNodePosition = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
  column: number;
};

export type FlowLayout = {
  width: number;
  height: number;
  positions: FlowNodePosition[];
  routing: {
    leftRail: number;
    rightRail: number;
    topRail: number;
    bottomRail: number;
    clearance: number;
  };
};

const stageWidth = 1736;
const overlayWidth = 760;

const getGridLayout = (
  topology: FlowTopology,
  presentation: "stage" | "overlay",
  columns: number,
): FlowLayout => {
  const width = presentation === "overlay" ? overlayWidth : stageWidth;
  const horizontalGap = presentation === "overlay" ? 18 : 32;
  const verticalGap = presentation === "overlay" ? 10 : 58;
  const nodeHeight =
    presentation === "overlay"
      ? topology.nodeIds.length > 6
        ? 72
        : 92
      : 210;
  const rows = Math.max(1, Math.ceil(topology.order.length / columns));
  const needsRails = topology.canonicalMode === "loop" || rows > 1;
  const sideRail = needsRails ? (presentation === "overlay" ? 24 : 44) : 0;
  const topRail = needsRails ? (presentation === "overlay" ? 12 : 24) : 0;
  const bottomPadding = needsRails ? (presentation === "overlay" ? 34 : 104) : 0;
  const nodeWidth = (width - sideRail * 2 - horizontalGap * (columns - 1)) / columns;
  const positions = topology.order.map((id, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id,
      x: sideRail + column * (nodeWidth + horizontalGap),
      y: topRail + row * (nodeHeight + verticalGap),
      width: nodeWidth,
      height: nodeHeight,
      row,
      column,
    };
  });
  const baseHeight = topRail + rows * nodeHeight + (rows - 1) * verticalGap;
  return {
    width,
    height: baseHeight + bottomPadding,
    positions,
    routing: {
      leftRail: sideRail ? sideRail / 2 : 0,
      rightRail: sideRail ? width - sideRail / 2 : width,
      topRail: topRail ? topRail / 2 : 0,
      bottomRail: baseHeight + bottomPadding / 2,
      clearance: presentation === "overlay" ? 8 : 14,
    },
  };
};

const getLayeredLayout = (
  topology: FlowTopology,
  presentation: "stage" | "overlay",
): FlowLayout => {
  const width = presentation === "overlay" ? overlayWidth : stageWidth;
  const columns = Math.max(1, ...topology.nodeIds.map((id) => (topology.levels[id] ?? 0) + 1));
  const horizontalGap = presentation === "overlay" ? 18 : 48;
  const verticalGap = presentation === "overlay" ? 14 : 34;
  const nodeHeight = presentation === "overlay" ? 84 : 190;
  const sideRail = presentation === "overlay" ? 24 : 44;
  const topRail = presentation === "overlay" ? 12 : 24;
  const bottomPadding = presentation === "overlay" ? 34 : 80;
  const nodeWidth = (width - sideRail * 2 - horizontalGap * (columns - 1)) / columns;
  const grouped = Array.from({length: columns}, (_, column) =>
    topology.nodeIds
      .filter((id) => (topology.levels[id] ?? 0) === column)
      .sort((a, b) => topology.nodeIds.indexOf(a) - topology.nodeIds.indexOf(b)),
  );
  const maxRows = Math.max(1, ...grouped.map((group) => group.length));
  const height = topRail + maxRows * nodeHeight + (maxRows - 1) * verticalGap + bottomPadding;
  const positions: FlowNodePosition[] = [];
  grouped.forEach((group, column) => {
    const groupHeight = group.length * nodeHeight + (group.length - 1) * verticalGap;
    const contentHeight = height - topRail - bottomPadding;
    const top = topRail + (contentHeight - groupHeight) / 2;
    group.forEach((id, row) => {
      positions.push({
        id,
        x: sideRail + column * (nodeWidth + horizontalGap),
        y: top + row * (nodeHeight + verticalGap),
        width: nodeWidth,
        height: nodeHeight,
        row,
        column,
      });
    });
  });
  return {
    width,
    height,
    positions,
    routing: {
      leftRail: sideRail / 2,
      rightRail: width - sideRail / 2,
      topRail: topRail / 2,
      bottomRail: height - bottomPadding / 2,
      clearance: presentation === "overlay" ? 8 : 14,
    },
  };
};

/**
 * Return deterministic coordinates for the supported graph families. The
 * renderer owns typography; this utility only owns topology geometry so that
 * validation and visual edges cannot silently disagree.
 */
export const getFlowLayout = (
  topology: FlowTopology,
  presentation: "stage" | "overlay" = "stage",
): FlowLayout => {
  if (topology.canonicalMode === "branch") {
    return getLayeredLayout(topology, presentation);
  }
  if (topology.canonicalMode === "data-flow" && !topology.isSimpleChain) {
    return getLayeredLayout(topology, presentation);
  }
  const columns =
    presentation === "overlay"
      ? topology.canonicalMode === "loop"
        ? Math.min(2, topology.order.length)
        : 1
      : Math.min(topology.order.length, 4);
  return getGridLayout(topology, presentation, Math.max(1, columns));
};

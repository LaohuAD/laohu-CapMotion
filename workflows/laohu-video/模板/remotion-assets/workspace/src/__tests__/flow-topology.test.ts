import {describe, expect, it} from "vitest";
import {
  buildFlowTopology,
  getFlowLayout,
  validateFlowTopology,
} from "../utils/flowTopology";
import {getFlowEdgeLabelLayouts, getFlowEdgeRoute} from "../components/FlowNodeGraph";

const nodes = (ids: string[]) => ids.map((id) => ({id}));

describe("FlowNodeGraph topology", () => {
  it("keeps the legacy linear fallback but materializes the real edges", () => {
    const topology = buildFlowTopology("linear", nodes(["a", "b", "c"]), []);

    expect(topology.edges.map(({from, to}) => `${from}->${to}`)).toEqual([
      "a->b",
      "b->c",
    ]);
    expect(topology.order).toEqual(["a", "b", "c"]);
    expect(getFlowLayout(topology, "stage").positions).toHaveLength(3);
  });

  it("validates branch edges instead of rendering a sequential card list", () => {
    const topology = buildFlowTopology(
      "branch",
      nodes(["root", "left", "right"]),
      [
        {from: "root", to: "left"},
        {from: "root", to: "right"},
      ],
    );

    expect(topology.outgoing.root).toEqual(["left", "right"]);
    expect(getFlowLayout(topology, "stage").positions.find((node) => node.id === "root")?.column).toBe(0);
    expect(validateFlowTopology("branch", nodes(["root", "left"]), [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({code: "missing-links"}),
        expect.objectContaining({code: "missing-branch"}),
      ]),
    );

    const overlayLayout = getFlowLayout(topology, "overlay");
    expect(overlayLayout.positions.every(
      (position) => position.x >= 0 && position.x + position.width <= overlayLayout.width,
    )).toBe(true);
  });

  it("requires an actual return edge for loops", () => {
    expect(() =>
      buildFlowTopology(
        "loop",
        nodes(["a", "b", "c"]),
        [
          {from: "a", to: "b"},
          {from: "b", to: "c"},
        ],
      ),
    ).toThrow(/returning edge/);

    const topology = buildFlowTopology(
      "loop",
      nodes(["a", "b", "c"]),
      [
        {from: "a", to: "b"},
        {from: "b", to: "c"},
        {from: "c", to: "a", label: "再跑一轮"},
      ],
    );
    expect(topology.hasCycle).toBe(true);
    expect(topology.edges.at(-1)?.id).toBe("c->a");
  });

  it("accepts data-flow as the explicit successor of artifact-flow", () => {
    const dataFlow = buildFlowTopology(
      "data-flow",
      nodes(["source", "result"]),
      [{from: "source", to: "result"}],
    );
    const legacy = buildFlowTopology(
      "artifact-flow",
      nodes(["source", "result"]),
      [{from: "source", to: "result"}],
    );

    expect(dataFlow.canonicalMode).toBe("data-flow");
    expect(legacy.canonicalMode).toBe("data-flow");
  });

  it("rejects dangling edges before the renderer can mislead the viewer", () => {
    expect(validateFlowTopology(
      "data-flow",
      nodes(["source", "result"]),
      [{from: "source", to: "missing"}],
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "dangling-link"}),
    ]));
  });
});

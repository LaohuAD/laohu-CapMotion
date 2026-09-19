import { describe, expect, it } from "vitest";
import {
  buildReusableCaseIndex,
  catalogFromComponentRegistry,
  searchReusableCases,
} from "../semantic/semantic-retrieval";

const catalog = [
  { id: "FlowNodeGraph", modes: ["linear", "branch"] },
  { id: "DecisionCanvas", modes: ["matrix"] },
];

const cases = [
  {
    id: "case-process-1",
    componentId: "FlowNodeGraph",
    mode: "linear",
    communication: { goal: "explain", relation: ["PROCESS", "CAUSE"] },
    fit: { status: "fit", reason: "同样需要按顺序展示状态变化" },
    feedback: { state: "PASS", note: "静音回看仍能读出顺序" },
    pinned: { version: "2026.09", sourceFingerprint: "src-a" },
  },
  {
    id: "case-non-fit-1",
    componentId: "DecisionCanvas",
    mode: "matrix",
    communication: { goal: "choose", relation: ["COMPARE"] },
    fit: { status: "non-fit", reason: "本段没有选择关系" },
    feedback: { state: "OBSERVE" },
    pinned: { version: "2026.08", sourceFingerprint: "src-old" },
    approval: "APPROVED",
  },
];

describe("reusable semantic case retrieval", () => {
  it("indexes cases against the existing component catalog without approving them", () => {
    const index = buildReusableCaseIndex(
      cases,
      catalogFromComponentRegistry(catalog),
    );

    expect(index.catalogComponentIds).toEqual([
      "DecisionCanvas",
      "FlowNodeGraph",
    ]);
    expect(index.candidates).toHaveLength(2);
    expect(
      index.candidates.every(
        (candidate) => candidate.approvalState === "PENDING_REVIEW",
      ),
    ).toBe(true);
  });

  it("ranks communication relations and exposes fit and feedback state", () => {
    const index = buildReusableCaseIndex(
      cases,
      catalogFromComponentRegistry(catalog),
    );
    const result = searchReusableCases(index, {
      goal: "explain",
      relation: "PROCESS",
      sourceFingerprint: "src-a",
      pinnedVersion: "2026.09",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "case-process-1",
      fit: { status: "fit" },
      feedbackState: "PASS",
      approvalState: "PENDING_REVIEW",
      stale: false,
    });
    expect(result[0].score).toBeGreaterThan(0);
  });

  it("does not return a candidate pinned to a stale source unless explicitly requested", () => {
    const index = buildReusableCaseIndex(
      cases,
      catalogFromComponentRegistry(catalog),
    );
    expect(
      searchReusableCases(index, {
        goal: "choose",
        sourceFingerprint: "src-a",
        pinnedVersion: "2026.09",
      }),
    ).toEqual([]);
    expect(
      searchReusableCases(index, {
        goal: "choose",
        sourceFingerprint: "src-a",
        pinnedVersion: "2026.09",
        includeStale: true,
      })[0],
    ).toMatchObject({ stale: true, approvalState: "PENDING_REVIEW" });
  });

  it("rejects a case that invents a component outside the registry", () => {
    expect(() =>
      buildReusableCaseIndex(
        [{ ...cases[0], componentId: "MadeUpComponent" }],
        catalog,
      ),
    ).toThrow(/CATALOG_COMPONENT_UNKNOWN/);
  });
});

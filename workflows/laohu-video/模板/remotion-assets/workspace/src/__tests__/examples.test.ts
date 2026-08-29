import {describe, expect, it} from "vitest";
import {scene001Examples} from "../configs/examples/scene001Examples";
import {getComponentManifest} from "../registry/componentRegistry";
import {getRiskRows} from "../components/RiskActionLoop";

describe("spoken-video acceptance examples", () => {
  it("covers the six planned Remotion acceptance scenes", () => {
    expect(Object.keys(scene001Examples)).toEqual([
      "scene07",
      "scene08",
      "scene10",
      "scene12",
      "scene14",
      "scene16",
    ]);
  });

  it("validates every example against its component schema", () => {
    for (const config of Object.values(scene001Examples)) {
      const manifest = getComponentManifest(config.component);
      expect(() => manifest.schema.parse(config)).not.toThrow();
      for (const item of config.items) {
        expect(item.source.type).toBe("source-doc");
        expect(item.source.ref).toContain("source-material.md#场景-");
      }
    }
  });

  it("keeps every compliance risk mapped to an action and proof file", () => {
    const rows = getRiskRows(scene001Examples.scene16.items);
    expect(rows[0]).toEqual({
      risk: "免费工具授权",
      action: "核验商用范围",
      proof: "授权记录",
    });
    expect(rows.every((row) => row.action && row.proof)).toBe(true);
  });

  it("keeps review metrics separate from observation windows", () => {
    expect(scene001Examples.scene12.supportingLabels).toEqual([
      "完播",
      "互动",
      "收藏",
      "评论关键词",
    ]);
  });
});

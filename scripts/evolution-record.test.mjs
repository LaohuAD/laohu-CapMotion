import assert from "node:assert/strict";
import {test} from "node:test";

import {validateEvolutionRecord} from "./evolution-record.mjs";

test("accepts a falsifiable change with current and adjacent regressions", () => {
  const result = validateEvolutionRecord({
    symptom: "数字人段落在句中被截断",
    triggerScope: "PROJECT_CAPABILITY",
    earliestFailure: "后期总控没有把语义边界作为数字人任务的必要中间结果",
    rootLayer: "STRUCTURE",
    hypothesis: "若只允许脚本标注的语义边界 则所有片段不超过40秒且没有半句",
    protection: ["不改变最终主音频", "短于40秒的正常片段不被重复切分"],
    authorityPath: ".agents/skills/runninghub-avatar/SKILL.md",
    change: "语义边界不足时返回 SEMANTIC_BOUNDARY_REQUIRED",
    decisionChanges: ["否决按固定秒数机械切段", "只在自然语义边界拆分"],
    regressions: {
      current: ["current-avatar-split"],
      legacy: ["short-avatar-no-split"],
      adjacent: ["adjacent-remotion-route"],
    },
    evidence: ["scripts/runninghub-avatar.test.mjs"],
    rollback: "若短片段被误切或长片段仍出现半句 则撤回新边界逻辑",
    validation: {STRUCTURE: "PASS", ROUTE: "PASS", BEHAVIOR: "OBSERVE", QUALITY: "UNKNOWN"},
    decision: "KEEP",
  });
  assert.equal(result.ok, true);
});

test("rejects a permanent rule made directly from one feedback without hypothesis or regressions", () => {
  const result = validateEvolutionRecord({
    symptom: "用户说不好",
    rootLayer: "FLESH",
    authorityPath: "AGENTS.md",
    decision: "KEEP",
  });
  assert.equal(result.ok, false);
  assert(result.errors.includes("HYPOTHESIS_REQUIRED"));
  assert(result.errors.includes("REGRESSION_SET_REQUIRED"));
  assert(result.errors.includes("EARLIEST_FAILURE_REQUIRED"));
  assert(result.errors.includes("PROTECTION_REQUIRED"));
});

test("rejects three new examples that do not protect a legacy capability", () => {
  const result = validateEvolutionRecord({
    symptom: "动画只复述字幕",
    triggerScope: "PROJECT_CAPABILITY",
    earliestFailure: "制作脚本没有写观众变化",
    rootLayer: "SOUL",
    hypothesis: "增加观众前后状态会减少字幕复述",
    protection: ["事实字幕仍可原样保留"],
    authorityPath: ".agents/skills/laohu-animation-director/SKILL.md",
    change: "增加 viewerBefore 和 viewerAfter",
    decisionChanges: ["拒绝没有理解增益的动画"],
    regressions: {current: ["a"], adjacent: ["b"]},
    evidence: ["test"],
    rollback: "出现误拒绝则回退",
    validation: {STRUCTURE: "PASS", ROUTE: "PASS", BEHAVIOR: "OBSERVE", QUALITY: "UNKNOWN"},
    decision: "OBSERVE",
  });
  assert.equal(result.ok, false);
  assert(result.errors.includes("REGRESSION_SET_REQUIRED"));
});

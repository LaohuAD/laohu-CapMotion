import assert from "node:assert/strict";
import test from "node:test";

import { resolveUnit, validateManifest } from "./cap-overlay-mount.mjs";

const good = () => ({
	schema: "laohu.overlay-manifest/1",
	compositionId: "Work018Overlay",
	fps: 30,
	units: [
		{
			segmentId: "V018-20",
			slug: "source-converge",
			source: "a.tsx",
			start: 452.66,
			duration: 13.08,
		},
	],
});

test("accepts a well-formed manifest", () => {
	assert.deepEqual(validateManifest(good()), []);
});

test("rejects a foreign schema", () => {
	const m = { ...good(), schema: "something/else" };
	assert.match(validateManifest(m).join("\n"), /schema 必须是/);
});

test("rejects duplicate segment ids and non-positive durations", () => {
	const m = good();
	m.units.push({ ...m.units[0], duration: 0 });
	const problems = validateManifest(m).join("\n");
	assert.match(problems, /segmentId 重复：V018-20/);
	assert.match(problems, /duration 必须为正数/);
});

test("rejects a missing source and a negative start", () => {
	const m = good();
	m.units[0].source = undefined;
	m.units[0].start = -1;
	const problems = validateManifest(m).join("\n");
	assert.match(problems, /缺少 source/);
	assert.match(problems, /start 必须 ≥ 0/);
});

test("rejects an empty unit list", () => {
	assert.match(validateManifest({ ...good(), units: [] }).join("\n"), /没有 units/);
});

test("每个单元可以使用自己的 compositionId，缺省时回落到顶层", () => {
	const fallback = resolveUnit(
		{ segmentId: "V1", slug: "loop", source: "a.tsx", start: 0, duration: 5 },
		30,
		"SharedOverlay",
	);
	assert.equal(fallback.compositionId, "SharedOverlay");
	assert.equal(fallback.durationInFrames, 150);

	const own = resolveUnit(
		{
			segmentId: "V2",
			slug: "source-converge",
			source: "b.tsx",
			start: 0,
			duration: 11.3,
			compositionId: "Work018SourceConverge",
		},
		30,
		"SharedOverlay",
	);
	assert.equal(own.compositionId, "Work018SourceConverge");
	assert.equal(own.durationInFrames, 339);
});

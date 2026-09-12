#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const binary = resolve(process.argv[2] || "");
if (!process.argv[2])
	throw Error("Usage: node scripts/verify-cap-cli.mjs <installed-cap-cli>");
const dir = mkdtempSync(join(tmpdir(), "cap-installed-cli-"));
const run = (args) => {
	const result = spawnSync(binary, args, {
		encoding: "utf8",
		windowsHide: true,
	});
	assert.equal(result.status, 0, result.error?.message || result.stderr);
	return JSON.parse(result.stdout);
};
try {
	const update = run(["update", "--json"]);
	assert.equal(update.started, false);
	assert.equal(update.completed, false);
	assert.equal(update.manualUpdateRequired, true);
	assert.equal(
		update.downloadUrl,
		"https://github.com/LaohuAD/laohu-CapMotion/releases/latest",
	);
	const project = join(dir, "中文 & project.cap");
	mkdirSync(project);
	const config = join(project, "project-config.json");
	writeFileSync(
		config,
		JSON.stringify({
			projectRevision: 0,
			timeline: {
				segments: [
					{ recordingSegment: 0, timescale: 1, start: 0, end: 1, name: null },
				],
				zoomSegments: [],
			},
		}),
	);
	const patch = join(dir, "presentation.json");
	writeFileSync(patch, JSON.stringify({ aspectRatio: "wide" }));
	const args = [
		"project",
		"presentation",
		project,
		"--expected-revision",
		"0",
		"--patch-json",
		patch,
		"--json",
	];
	assert.equal(run(args).revision, 1);
	const before = readFileSync(config);
	const stale = spawnSync(binary, args, {
		encoding: "utf8",
		windowsHide: true,
	});
	assert.notEqual(stale.status, 0, "Stale revision must be rejected");
	assert.deepEqual(readFileSync(config), before);
	const tracks = join(dir, "tracks.json");
	writeFileSync(
		tracks,
		JSON.stringify({
			schema: "laohu.cap-caption-tracks/1",
			tracks: [
				{
					id: "zh",
					label: "中文",
					language: "zh-CN",
					style: {
						fontSize: 40,
						position: "manual",
						manualPosition: { x: 0.5, y: 0.8 },
					},
					segments: [
						{ id: "zh1", pairId: "p1", start: 0, end: 1, text: "你好 Windows" },
					],
				},
				{
					id: "en",
					label: "English",
					language: "en",
					style: {
						fontSize: 30,
						position: "manual",
						manualPosition: { x: 0.5, y: 0.9 },
					},
					segments: [
						{
							id: "en1",
							pairId: "p1",
							start: 0,
							end: 1,
							text: "Hello Windows",
						},
					],
				},
			],
		}),
	);
	assert.equal(
		run([
			"project",
			"captions",
			"materialize",
			project,
			"--expected-revision",
			"1",
			"--tracks-json",
			tracks,
			"--json",
		]).revision,
		2,
	);
	const result = run(["project", "config", "get", project, "--json"]);
	assert.equal(result.projectRevision, 2);
	assert.equal(result.aspectRatio, "wide");
	assert.equal(result.timeline.captionSegments.length, 2);
	assert.equal(result.timeline.captionSegments[0].text, "你好 Windows");
	const positions = new Map(
		result.captions.settings.trackPositions.map((p) => [p.trackId, p]),
	);
	const sizes = new Map(
		result.captions.settings.trackStyles.map((s) => [s.trackId, s.fontSize]),
	);
	for (const [id, y] of [
		["zh", 0.8],
		["en", 0.9],
	]) {
		assert.equal(positions.get(id)?.position, "manual");
		assert.ok(Math.abs(positions.get(id).manualPosition.x - 0.5) < 1e-6);
		assert.ok(Math.abs(positions.get(id).manualPosition.y - y) < 1e-6);
	}
	assert.equal(sizes.get("zh"), 40);
	assert.equal(sizes.get("en"), 30);
	const style = join(dir, "style.json");
	writeFileSync(
		style,
		JSON.stringify({
			fontWeight: 500,
			trackStyles: [
				{ trackId: "zh", fontSize: 48 },
				{ trackId: "en", fontSize: 30 },
			],
		}),
	);
	assert.equal(
		run([
			"project",
			"captions",
			"style",
			project,
			"--expected-revision",
			"2",
			"--style-json",
			style,
			"--json",
		]).revision,
		3,
	);
	const reopened = run(["project", "config", "get", project, "--json"]);
	assert.equal(reopened.projectRevision, 3);
	assert.equal(reopened.captions.settings.fontWeight, 500);
	assert.deepEqual(
		reopened.captions.settings.trackPositions,
		result.captions.settings.trackPositions,
	);
	assert.deepEqual(
		reopened.timeline.captionSegments,
		result.timeline.captionSegments,
	);
	assert.deepEqual(reopened.captions.settings.trackStyles, [
		{ trackId: "zh", fontSize: 48 },
		{ trackId: "en", fontSize: 30 },
	]);
	console.log(
		JSON.stringify({
			status: "PASS",
			checks: [
				"installed CLI launch",
				"CapMotion manual update route",
				"Unicode and space paths",
				"presentation transaction",
				"stale revision protection",
				"editable bilingual tracks",
				"independent track positions",
				"independent track font sizes",
				"medium font weight",
				"caption content preserved by style patch",
				"config read after write",
			],
		}),
	);
} finally {
	rmSync(dir, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import test from "node:test";
import {
	buildBilingualCapCaptionTracks,
	buildDisplayCaptionSegments,
	buildWordTightRanges,
} from "./caption-display-track.mjs";

const word = (text, start, end) => ({
	text,
	globalStartMs: start,
	globalEndMs: end,
});

test("word-tight ranges cut a long pause inside one ASR utterance", () => {
	const ranges = buildWordTightRanges({
		words: [
			word("前", 1000, 1100),
			word("半", 1120, 1220),
			word("后", 3300, 3400),
			word("半", 3420, 3520),
		],
	});
	assert.equal(ranges.length, 2);
	assert.deepEqual(
		ranges.map(({ start, end }) => [
			Number(start.toFixed(2)),
			Number(end.toFixed(2)),
		]),
		[
			[0.92, 1.3],
			[3.22, 3.6],
		],
	);
});

test("display captions use real word times and split a long sentence into readable units", () => {
	const text =
		"本期视频呢，我会分成两个部分，分别是针对小白的和有搭建能力者比较专业的一些同学。";
	const words = [...text].map((char, index) =>
		word(char, index * 120, index * 120 + 100),
	);
	const segments = buildDisplayCaptionSegments([{ words }], {
		maxChars: 12,
		minChars: 6,
	});
	assert.ok(segments.length >= 3);
	assert.ok(segments.every((segment) => segment.text.length <= 13));
	assert.equal(segments[0].start, 0);
	assert.ok(segments.every((segment) => segment.end > segment.start));
});

test("display captions rebalance a short trailing fragment into complete readable units", () => {
	const text = "进度条然后直接跳转到后面的专业讲解部分";
	const words = [...text].map((char, index) =>
		word(char, index * 120, index * 120 + 100),
	);
	const segments = buildDisplayCaptionSegments([{ words }], {
		maxChars: 18,
		minChars: 6,
	});

	assert.equal(segments.map((segment) => segment.text).join(""), text);
	assert.ok(segments.length >= 2);
	assert.ok(segments.every((segment) => [...segment.text].length >= 6));
	assert.ok(segments.every((segment) => [...segment.text].length <= 18));
	assert.ok(segments.every((segment) => segment.end > segment.start));
});

test("display captions attach a short forward phrase to the following utterance", () => {
	const segments = buildDisplayCaptionSegments(
		[
			{ words: [word("他", 0, 100)] },
			{
				words: [..."把锤子收回并且搭在右肩"].map((char, index) =>
					word(char, 900 + index * 180, 1040 + index * 180),
				),
			},
		],
		{ maxChars: 18, minChars: 6 },
	);

	assert.equal(segments.length, 1);
	assert.equal(segments[0].text, "他把锤子收回并且搭在右肩");
	assert.equal(segments[0].start, 0);
});

test("display captions rebalance a short cross-utterance tail when merging would exceed the limit", () => {
	const first = "去固定这个画面的整体画面的这个";
	const second = "构图啊";
	const segments = buildDisplayCaptionSegments(
		[
			{
				words: [...first].map((char, index) =>
					word(char, index * 160, index * 160 + 120),
				),
			},
			{
				words: [...second].map((char, index) =>
					word(char, 2800 + index * 160, 2920 + index * 160),
				),
			},
		],
		{ maxChars: 18, minChars: 6 },
	);

	assert.equal(
		segments.map((segment) => segment.text).join(""),
		first + second,
	);
	assert.ok(segments.every((segment) => [...segment.text].length >= 6));
	assert.ok(segments.every((segment) => [...segment.text].length <= 18));
});

test("bilingual captions become linked Chinese and English Cap tracks with Laohu layout", () => {
	const result = buildBilingualCapCaptionTracks({
		segments: [
			{
				id: "caption-1",
				start: 1.25,
				end: 3.5,
				text: "中文内容",
				en: "English text",
			},
		],
	});

	assert.equal(result.schema, "laohu.cap-caption-tracks/1");
	assert.deepEqual(
		result.tracks.map(({ id, label, language }) => ({ id, label, language })),
		[
			{ id: "zh-CN", label: "中文字幕", language: "zh-CN" },
			{ id: "en", label: "English Captions", language: "en" },
		],
	);
	assert.deepEqual(
		result.tracks.map((track) => track.style),
		[
			{
				fontSize: 64,
				position: "manual",
				manualPosition: { x: 0.5, y: 0.865 },
			},
			{ fontSize: 34, position: "manual", manualPosition: { x: 0.5, y: 0.93 } },
		],
	);
	assert.equal(result.tracks[0].segments[0].pairId, "caption-1");
	assert.equal(result.tracks[1].segments[0].pairId, "caption-1");
});

test("Cap display tracks remove ASCII separators between Chinese phrases", () => {
	const result = buildBilingualCapCaptionTracks({
		segments: [
			{
				id: "caption-1",
				start: 1,
				end: 3,
				text: "人物的停顿 情绪和重音",
				en: "Pauses, emotion and emphasis",
			},
		],
	});

	assert.equal(result.tracks[0].segments[0].text, "人物的停顿情绪和重音");
	assert.equal(
		result.tracks[1].segments[0].text,
		"Pauses, emotion and emphasis",
	);
});

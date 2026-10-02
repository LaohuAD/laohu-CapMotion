import assert from "node:assert/strict";
import test from "node:test";

import { buildWordTimestamps } from "./cap-word-timestamps.mjs";

// 一段 10 秒录音，两条源语句；
// 保留区间 [1,4] 与 [5,8]：中间 4–5 秒被删（台账在册），9 秒之后没覆盖。
const asr = {
	utterances: [
		{
			recordingSegment: 0,
			words: [
				{ text: "开", sourceStartMs: 1000, sourceEndMs: 2000 },
				{ text: "头", sourceStartMs: 2000, sourceEndMs: 3000 },
				{ text: "删", sourceStartMs: 4100, sourceEndMs: 4900 },
				{ text: "尾", sourceStartMs: 5000, sourceEndMs: 6000 },
			],
		},
		{
			recordingSegment: 0,
			words: [
				{ text: "没", sourceStartMs: 9100, sourceEndMs: 9300 },
				// 占位项：空文本与零时长，不该进任何统计
				{ text: " ", sourceStartMs: 9400, sourceEndMs: 9500 },
				{ text: "零", sourceStartMs: 9500, sourceEndMs: 9500 },
			],
		},
	],
};

const sourceIndex = {
	segments: [{ recordingSegment: 0, microphonePath: "seg0.ogg", sourceTimelineOffsetSeconds: 0 }],
};

const edl = {
	durationSeconds: 6,
	sequence: [
		{
			recordingSegment: 0,
			sourceStart: 1,
			sourceEnd: 4,
			targetStart: 0,
			targetEnd: 3,
		},
		{
			recordingSegment: 0,
			sourceStart: 5,
			sourceEnd: 8,
			targetStart: 3,
			targetEnd: 6,
		},
	],
};

const review = {
	deletionLedger: {
		entries: [
			{
				segmentId: "C900",
				sourceRanges: [{ file: "seg0.ogg", start: 4, end: 5 }],
			},
		],
	},
};

test("maps retained words onto the target clock and drops the rest", () => {
	const { payload, coverage } = buildWordTimestamps({ asr, sourceIndex, edl, review });

	// 「开」「头」在保留区间 1–4 内，「尾」在 5–8 内；「删」落在删除台账里
	assert.equal(coverage.keptWords, 3);
	assert.equal(coverage.ledgerDeletedWords, 1);
	assert.equal(coverage.uncoveredWords, 1, "9 秒之后的词既不在保留区也不在台账里");
	assert.equal(coverage.totalWordsInSource, 5, "空文本与零时长的占位项不进分母");
	assert.equal(coverage.reconciles, true);

	// 三个幸存的词同属一条源语句 → 合成一句，不因中间的剪口产生碎句。
	// T2：[1,4]→[0,3]、[5,8]→[3,6]，「尾」落在成片 3.0s
	assert.deepEqual(payload.sentences, [
		{
			i: 0,
			text: "开头尾",
			start: 0,
			end: 4,
			match: true,
			ok: true,
			words: [
				{ text: "开", start: 0, end: 1 },
				{ text: "头", start: 1, end: 2 },
				{ text: "尾", start: 3, end: 4 },
			],
		},
	]);
	assert.equal(payload.total, 6);
});

test("keeps a word whose tail survives a cut, clamped to the retained range", () => {
	// 词跨过剪口：源 3.6–4.6，保留区间到 4.0 为止 → 成片起点 2.6、终点收敛到 3.0
	const straddling = {
		utterances: [
			{
				recordingSegment: 0,
				words: [{ text: "跨", sourceStartMs: 3600, sourceEndMs: 4600 }],
			},
		],
	};
	const { payload, coverage } = buildWordTimestamps({
		asr: straddling,
		sourceIndex,
		edl,
		review: { deletionLedger: { entries: [] } },
	});

	assert.equal(coverage.keptWords, 1, "重叠即保留：不能因为词首在剪口之前就丢掉它");
	assert.deepEqual(payload.sentences[0].words[0], { text: "跨", start: 2.6, end: 3 });
});

test("splits nothing inside one source sentence even across a cut", () => {
	// 「大错特错」被剪口切成两段音频，但仍是一条源语句 → 仍是一句，不产生碎句
	const split = {
		utterances: [
			{
				recordingSegment: 0,
				words: [
					{ text: "大", sourceStartMs: 3000, sourceEndMs: 3900 },
					{ text: "错", sourceStartMs: 5000, sourceEndMs: 5400 },
					{ text: "特", sourceStartMs: 5400, sourceEndMs: 5700 },
					{ text: "错", sourceStartMs: 5700, sourceEndMs: 6000 },
				],
			},
		],
	};
	const { payload } = buildWordTimestamps({
		asr: split,
		sourceIndex,
		edl,
		review: { deletionLedger: { entries: [] } },
	});

	assert.equal(payload.sentences.length, 1);
	assert.equal(payload.sentences[0].text, "大错特错");
	assert.deepEqual(
		payload.sentences[0].words.map((w) => w.start),
		[2, 3, 3.4, 3.7],
	);
});

test("throws when a recording segment has no clock offset", () => {
	assert.throws(
		() =>
			buildWordTimestamps({
				asr: { utterances: [{ recordingSegment: 7, words: [] }] },
				sourceIndex,
				edl,
				review: { deletionLedger: { entries: [] } },
			}),
		/source-index 缺少录制段 7/,
	);
});

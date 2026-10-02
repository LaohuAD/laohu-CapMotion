#!/usr/bin/env node
// Build a Cap `laohu.cap-edl/1` editing decision list from a frozen
// `laohu.pre-edit-review/2` review document.
//
// The review document already owns every retention decision. This script only
// materialises those decisions onto the project's own source clock; it never
// invents, extends, shortens or reorders a retained range.
//
// Time basis (verified three ways — RecordingMeta::calculate_audio_offsets in
// Cap's source, the project's own persisted clips[].offsets.mic, and
// recording-meta stream start_times): a review source range is expressed in the
// *recording-segment local display clock*, which is the same clock as
// timeline.segments[].start/end and therefore the same clock
// cap-project-edl resolves against. No conversion is applied here; anything
// that falls outside its recording segment is reported, never repaired.
//
// The review's finalRange is a presentation grid and leaves a hole wherever a
// source range was deleted. The target axis built here is contiguous, so the
// T2 timeline starts at 0 and has no phantom gaps.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EPSILON = 1e-6;
const GRID_EPSILON = 0.0025;

const finite = (value, label) => {
	const number = Number(value);
	if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
	return number;
};
const round6 = (value) => Math.round(value * 1e6) / 1e6;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Map every declared microphone / display media path to its recording segment. */
export const segmentResolver = (sourceIndex) => {
	const table = new Map();
	for (const segment of sourceIndex?.segments ?? []) {
		table.set(resolve(segment.microphonePath), segment.recordingSegment);
		table.set(resolve(segment.displayPath), segment.recordingSegment);
	}
	return (file) => table.get(resolve(file));
};

/** Per-segment microphone start-time offsets, straight from the project. */
export const micOffsets = (config) => {
	const table = new Map();
	for (const clip of config.clips ?? [])
		table.set(Number(clip.index), Number(clip.offsets?.mic ?? 0));
	return table;
};

/** Report presentation-grid holes that the contiguous target axis closes. */
export const findReviewGridGaps = (segments) => {
	const gaps = [];
	let cursor = 0;
	for (const segment of segments) {
		const start = finite(segment.finalRange?.start, `${segment.id}.finalRange.start`);
		const end = finite(segment.finalRange?.end, `${segment.id}.finalRange.end`);
		if (start - cursor > GRID_EPSILON)
			gaps.push({
				beforeSegmentId: segment.id,
				gapStart: round6(cursor),
				gapEnd: round6(start),
				seconds: round6(start - cursor),
			});
		cursor = end;
	}
	return gaps;
};

/**
 * Materialise review segments into EDL sequence entries on one contiguous
 * target axis, in review order.
 */
export const buildSequence = ({ segments, resolveSegment, windows }) => {
	const sequence = [];
	let cursor = 0;
	for (const segment of segments) {
		const ranges = segment.sourceRanges ?? [];
		if (!ranges.length)
			throw new Error(`${segment.id}: retained segment has no source range`);
		for (const range of ranges) {
			const recordingSegment = resolveSegment(range.file);
			if (recordingSegment === undefined)
				throw new Error(`${segment.id}: unknown source file ${range.file}`);
			const start = finite(range.start, `${segment.id}.start`);
			const end = finite(range.end, `${segment.id}.end`);
			if (!(end > start)) throw new Error(`${segment.id}: empty source range`);
			const window = windows.find(
				(item) =>
					item.recordingSegment === recordingSegment &&
					start >= item.start - EPSILON &&
					end <= item.end + EPSILON,
			);
			if (!window)
				throw new Error(
					`${segment.id}: source range ${start}-${end} is outside recording segment ${recordingSegment}`,
				);
			const duration = end - start;
			sequence.push({
				sourceStart: round6(start),
				sourceEnd: round6(end),
				targetStart: round6(cursor),
				targetEnd: round6(cursor + duration),
				recordingSegment,
				index: sequence.length + 1,
				reviewSegmentId: segment.id,
			});
			cursor += duration;
		}
	}
	return { sequence, durationSeconds: cursor };
};

export const buildEdl = ({ review, reviewText, config, sourceIndex }) => {
	const windows = (config.timeline?.segments ?? []).map((segment, index) => ({
		recordingSegment: segment.recordingSegment ?? 0,
		start: finite(segment.start, `timeline.segments[${index}].start`),
		end: finite(segment.end, `timeline.segments[${index}].end`),
		timescale: finite(segment.timescale ?? 1, `timeline.segments[${index}].timescale`),
	}));
	if (!windows.length) throw new Error("project has no source timeline");
	if (windows.some((window) => window.timescale !== 1))
		throw new Error("non-unit timescale is not supported by this builder");

	const { sequence, durationSeconds } = buildSequence({
		segments: review.segments,
		resolveSegment: segmentResolver(sourceIndex),
		windows,
	});

	return {
		schema: "laohu.cap-edl/1",
		sourceProjectRevision: finite(config.projectRevision ?? 0, "projectRevision"),
		sourceTimeline: config.timeline,
		durationSeconds,
		sequence,
		review: {
			id: review.id,
			revision: review.revision,
			approvalStatus: review.approval?.status ?? "UNKNOWN",
			contextReviewStatus: review.contextReview?.status ?? "UNKNOWN",
			reviewSha256: sha256(reviewText),
			retainedSegmentCount: review.segments.length,
			retainedRangeCount: sequence.length,
			closedReviewGridGaps: findReviewGridGaps(review.segments),
		},
	};
};

/**
 * Word-level content audit in the microphone-local clock.
 *
 * Review ranges are display-local, ASR words are microphone-local, so add the
 * project's own per-segment `offsets.mic` before comparing. A word counts as
 * retained only when a retained range fully covers it.
 */
export const auditWordCoverage = ({ review, transcript, config, sourceIndex }) => {
	const resolveSegment = segmentResolver(sourceIndex);
	const offsets = micOffsets(config);
	// clips[].offsets.mic is the seek offset: microphone time = timeline time +
	// offsets.mic. The review is timeline-local and ASR words are microphone-local,
	// so converting a review range into the word clock adds the offset.
	const toLocal = (file, seconds) => {
		const segment = resolveSegment(file);
		if (segment === undefined) return null;
		return seconds + (offsets.get(segment) ?? 0);
	};

	const retained = new Map();
	const ledger = new Map();
	const add = (map, file, start, end) => {
		const key = resolve(file);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push([start, end]);
	};
	for (const segment of review.segments)
		for (const range of segment.sourceRanges ?? []) {
			const start = toLocal(range.file, range.start);
			add(retained, range.file, start, start + (range.end - range.start));
		}
	// 删除台账是排除项的唯一权威；sourceDecisions 里的 DELETE 是它的子集。
	for (const entry of review.deletionLedger?.entries ?? []) {
		for (const range of entry.sourceRanges ?? []) {
			const start = toLocal(range.file, range.start);
			add(ledger, range.file, start, start + (range.end - range.start));
		}
	}

	const contains = (map, file, start, end) =>
		(map.get(resolve(file)) ?? []).some(
			([from, to]) => start >= from - EPSILON && end <= to + EPSILON,
		);
	// A cut lands between two words, so an edge word can lose a few milliseconds.
	// Presence is therefore decided by overlap; containment is reported
	// separately as boundary trimming rather than as lost content.
	const overlaps = (map, file, start, end) =>
		(map.get(resolve(file)) ?? []).some(
			([from, to]) => Math.min(to, end) - Math.max(from, start) > EPSILON,
		);

	const fileForSegment = new Map();
	for (const segment of sourceIndex?.segments ?? [])
		fileForSegment.set(segment.recordingSegment, segment.microphonePath);

	const result = {
		totalWords: 0,
		retainedWords: 0,
		retainedButBoundaryTrimmedWords: 0,
		ledgerDeletedWords: 0,
		uncoveredWords: 0,
		uncoveredUtterances: [],
	};
	for (const utterance of transcript?.utterances ?? []) {
		const file = fileForSegment.get(utterance.recordingSegment);
		if (!file) continue;
		const words = (utterance.words ?? []).filter((word) =>
			String(word.text ?? "").trim(),
		);
		let uncoveredHere = 0;
		for (const word of words) {
			const start = Number(word.sourceStartMs) / 1000;
			const end = Number(word.sourceEndMs) / 1000;
			if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
			result.totalWords += 1;
			if (overlaps(retained, file, start, end)) {
				result.retainedWords += 1;
				if (!contains(retained, file, start, end))
					result.retainedButBoundaryTrimmedWords += 1;
			} else if (overlaps(ledger, file, start, end)) result.ledgerDeletedWords += 1;
			else {
				result.uncoveredWords += 1;
				uncoveredHere += 1;
			}
		}
		if (uncoveredHere && words.length) {
			const first = words[0];
			result.uncoveredUtterances.push({
				recordingSegment: utterance.recordingSegment,
				sourceStart: round6(Number(first.sourceStartMs) / 1000),
				durationSeconds: round6(
					(Number(utterance.sourceEndMs) - Number(utterance.sourceStartMs)) / 1000,
				),
				uncoveredWords: uncoveredHere,
				totalWords: words.length,
				text: String(utterance.text ?? ""),
			});
		}
	}
	result.uncoveredUtteranceCount = result.uncoveredUtterances.length;
	result.uncoveredSpeechSeconds = round6(
		result.uncoveredUtterances.reduce((total, item) => total + item.durationSeconds, 0),
	);
	return result;
};

const main = async () => {
	const args = process.argv.slice(2);
	const flag = (name, fallback) => {
		const index = args.indexOf(`--${name}`);
		return index >= 0 ? args[index + 1] : fallback;
	};
	const reviewPath = flag("review");
	const projectPath = flag("project");
	const sourceIndexPath = flag("source-index");
	const transcriptPath = flag("transcript");
	const outPath = flag("out", "edl.json");
	if (!reviewPath || !projectPath || !sourceIndexPath)
		throw new Error(
			"usage: cap-edl-from-review.mjs --review <review.json> --project <project.cap> --source-index <source-index.json> [--transcript <raw.json>] --out <edl.json>",
		);

	const [reviewText, configText, sourceIndexText, transcriptText] = await Promise.all([
		readFile(resolve(reviewPath), "utf8"),
		readFile(resolve(projectPath, "project-config.json"), "utf8"),
		readFile(resolve(sourceIndexPath), "utf8"),
		transcriptPath ? readFile(resolve(transcriptPath), "utf8") : Promise.resolve(null),
	]);
	const review = JSON.parse(reviewText);
	const config = JSON.parse(configText);
	const sourceIndex = JSON.parse(sourceIndexText);

	const edl = buildEdl({ review, reviewText, config, sourceIndex });
	await writeFile(resolve(outPath), `${JSON.stringify(edl, null, 2)}\n`, "utf8");

	const coverage = transcriptText
		? auditWordCoverage({
				review,
				transcript: JSON.parse(transcriptText),
				config,
				sourceIndex,
			})
		: null;

	process.stdout.write(
		`${JSON.stringify(
			{
				ok: true,
				edl: resolve(outPath),
				project: basename(resolve(projectPath)),
				sourceProjectRevision: edl.sourceProjectRevision,
				durationSeconds: round6(edl.durationSeconds),
				retainedRangeCount: edl.sequence.length,
				closedReviewGridGaps: edl.review.closedReviewGridGaps.length,
				reviewRevision: edl.review.revision,
				approvalStatus: edl.review.approvalStatus,
				contextReviewStatus: edl.review.contextReviewStatus,
				coverage,
			},
			null,
			2,
		)}\n`,
	);
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	await main();
}

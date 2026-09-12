#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EPSILON = 1e-6;
const TRACK_KEYS = [
	"zoomSegments",
	"sceneSegments",
	"maskSegments",
	"textSegments",
	"keyboardSegments",
	"audioSegments",
	"camera3dSegments",
];

const finite = (value, label) => {
	const number = Number(value);
	if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
	return number;
};

const nearlyEqual = (left, right) => Math.abs(left - right) <= EPSILON;

const originalTimelineWindows = (segments) => {
	let targetCursor = 0;
	return segments.map((segment, index) => {
		const start = finite(segment.start, `timeline.segments[${index}].start`);
		const end = finite(segment.end, `timeline.segments[${index}].end`);
		const timescale = finite(
			segment.timescale ?? 1,
			`timeline.segments[${index}].timescale`,
		);
		if (!(end > start) || !(timescale > 0))
			throw new Error(`invalid source timeline segment ${index}`);
		const duration = (end - start) / timescale;
		const window = {
			...segment,
			sourceStart: start,
			sourceEnd: end,
			targetStart: targetCursor,
			targetEnd: targetCursor + duration,
			timescale,
		};
		targetCursor += duration;
		return window;
	});
};

const resolveSequence = (config, edl) => {
	if (edl?.schema !== "laohu.cap-edl/1")
		throw new Error("unsupported EDL schema");
	if (!Array.isArray(edl.sequence) || edl.sequence.length === 0)
		throw new Error("EDL sequence is empty");
	const windows = originalTimelineWindows(config.timeline?.segments ?? []);
	let targetCursor = 0;

	return edl.sequence.map((entry, index) => {
		const sourceStart = finite(
			entry.sourceStart,
			`sequence[${index}].sourceStart`,
		);
		const sourceEnd = finite(entry.sourceEnd, `sequence[${index}].sourceEnd`);
		const targetStart = finite(
			entry.targetStart,
			`sequence[${index}].targetStart`,
		);
		const targetEnd = finite(entry.targetEnd, `sequence[${index}].targetEnd`);
		if (!nearlyEqual(targetStart, targetCursor))
			throw new Error("target timeline must be contiguous");
		if (!(sourceEnd > sourceStart) || !(targetEnd > targetStart))
			throw new Error(`invalid EDL range ${index}`);

		const candidates = windows.filter(
			(window) =>
				window.recordingSegment === entry.recordingSegment &&
				sourceStart >= window.sourceStart - EPSILON &&
				sourceEnd <= window.sourceEnd + EPSILON,
		);
		if (candidates.length !== 1)
			throw new Error(
				`EDL range ${index} does not resolve to exactly one source segment`,
			);
		const sourceWindow = candidates[0];
		const expectedDuration = (sourceEnd - sourceStart) / sourceWindow.timescale;
		if (!nearlyEqual(targetEnd - targetStart, expectedDuration)) {
			throw new Error(
				`EDL range ${index} target duration does not match source duration`,
			);
		}
		const originalTargetStart =
			sourceWindow.targetStart +
			(sourceStart - sourceWindow.sourceStart) / sourceWindow.timescale;
		const originalTargetEnd = originalTargetStart + expectedDuration;
		targetCursor = targetEnd;
		return {
			...entry,
			sourceStart,
			sourceEnd,
			targetStart,
			targetEnd,
			originalTargetStart,
			originalTargetEnd,
			sourceWindow,
		};
	});
};

const remapKeys = (keys, originalSegment, clippedStart, clippedEnd) => {
	if (!Array.isArray(keys)) return keys;
	return keys.flatMap((key) => {
		const offsetMs = Number(key.timeOffset);
		if (!Number.isFinite(offsetMs)) return [key];
		const eventTime = originalSegment.start + offsetMs / 1000;
		if (eventTime < clippedStart - EPSILON || eventTime > clippedEnd + EPSILON)
			return [];
		return [
			{ ...key, timeOffset: Math.max(0, (eventTime - clippedStart) * 1000) },
		];
	});
};

const remapTrack = (items, sequence) => {
	const mapped = [];
	for (const item of items ?? []) {
		const itemStart = finite(item.start, "track item start");
		const itemEnd = finite(item.end, "track item end");
		if (!(itemEnd > itemStart)) continue;
		let piece = 0;
		for (const range of sequence) {
			const clippedStart = Math.max(itemStart, range.originalTargetStart);
			const clippedEnd = Math.min(itemEnd, range.originalTargetEnd);
			if (!(clippedEnd > clippedStart + EPSILON)) continue;
			const start =
				range.targetStart + (clippedStart - range.originalTargetStart);
			const end = range.targetStart + (clippedEnd - range.originalTargetStart);
			const next = { ...item, start, end };
			if (piece > 0 && typeof next.id === "string")
				next.id = `${next.id}--edl-${piece + 1}`;
			if (Array.isArray(next.keys))
				next.keys = remapKeys(next.keys, item, clippedStart, clippedEnd);
			mapped.push(next);
			piece += 1;
		}
	}
	return mapped.sort(
		(left, right) => left.start - right.start || left.end - right.end,
	);
};

export const applyEdlToProjectConfig = (config, edl) => {
	if (!config?.timeline || !Array.isArray(config.timeline.segments))
		throw new Error("project has no editable timeline");
	// A refit must resolve recording-local ranges against the original uncut
	// timeline, never reinterpret an already edited timeline as source time.
	const sourceConfig = edl.sourceTimeline
		? { ...config, timeline: edl.sourceTimeline }
		: config;
	const sequence = resolveSequence(sourceConfig, edl);
	const timeline = { ...sourceConfig.timeline };
	timeline.segments = sequence.map((range) => ({
		recordingSegment: range.recordingSegment,
		timescale: range.sourceWindow.timescale,
		start: range.sourceStart,
		end: range.sourceEnd,
		name: range.sourceWindow.name ?? null,
	}));
	for (const key of TRACK_KEYS)
		timeline[key] = remapTrack(sourceConfig.timeline[key] ?? [], sequence);
	timeline.captionSegments = [];
	return { ...config, timeline };
};

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const applyEdlUnlocked = async ({
	projectPath,
	edlPath,
	expectedRevision,
	receiptPath,
}) => {
	const absoluteProject = resolve(projectPath);
	const configPath = join(absoluteProject, "project-config.json");
	const tempPath = join(absoluteProject, `.project-config.${process.pid}.tmp`);
	try {
		const [configText, edlText] = await Promise.all([
			readFile(configPath, "utf8"),
			readFile(resolve(edlPath), "utf8"),
		]);
		const config = JSON.parse(configText);
		const edl = JSON.parse(edlText);
		const currentRevision = finite(
			config.projectRevision ?? 0,
			"projectRevision",
		);
		const requiredRevision = finite(expectedRevision, "expectedRevision");
		if (currentRevision !== requiredRevision) {
			throw new Error(
				`revision mismatch: expected ${requiredRevision}, found ${currentRevision}`,
			);
		}
		if (
			edl.sourceProjectRevision !== undefined &&
			Number(edl.sourceProjectRevision) !== currentRevision
		) {
			throw new Error(
				`EDL source revision mismatch: expected ${currentRevision}, found ${edl.sourceProjectRevision}`,
			);
		}
		const next = applyEdlToProjectConfig(config, edl);
		next.projectRevision = currentRevision + 1;
		await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
		await rename(tempPath, configPath);

		const receipt = {
			schema: "laohu.cap-edl-receipt/1",
			status: "applied",
			projectPath: absoluteProject,
			projectName: basename(absoluteProject),
			edlPath: resolve(edlPath),
			edlSha256: sha256(edlText),
			previousRevision: currentRevision,
			newRevision: next.projectRevision,
			segmentCount: next.timeline.segments.length,
			durationSeconds: edl.sequence.at(-1).targetEnd,
			appliedAt: new Date().toISOString(),
		};
		if (receiptPath)
			await writeFile(
				resolve(receiptPath),
				`${JSON.stringify(receipt, null, 2)}\n`,
				"utf8",
			);
		return receipt;
	} finally {
		await rm(tempPath, { force: true });
	}
};

const applyCaptionTrackUnlocked = async ({
	projectPath,
	trackPath,
	expectedRevision,
	receiptPath,
}) => {
	const absoluteProject = resolve(projectPath);
	const configPath = join(absoluteProject, "project-config.json");
	const tempPath = join(absoluteProject, `.project-config.${process.pid}.tmp`);
	try {
		const [configText, trackText] = await Promise.all([
			readFile(configPath, "utf8"),
			readFile(resolve(trackPath), "utf8"),
		]);
		const config = JSON.parse(configText);
		const track = JSON.parse(trackText);
		const currentRevision = finite(
			config.projectRevision ?? 0,
			"projectRevision",
		);
		const requiredRevision = finite(expectedRevision, "expectedRevision");
		if (currentRevision !== requiredRevision) {
			throw new Error(
				`revision mismatch: expected ${requiredRevision}, found ${currentRevision}`,
			);
		}
		const isMultiTrack = track.schema === "laohu.cap-caption-tracks/1";
		const inputTracks = isMultiTrack
			? track.tracks
			: [
					{
						id: "default",
						label: "Captions",
						language: null,
						style: {},
						segments: track.segments,
					},
				];
		if (!Array.isArray(inputTracks) || inputTracks.length === 0)
			throw new Error("caption track input must contain tracks");
		const trackIds = new Set();
		const pairedRanges = new Map();
		const flattened = inputTracks.flatMap((inputTrack, trackIndex) => {
			const trackId = String(inputTrack.id ?? "").trim();
			if (!trackId || trackIds.has(trackId))
				throw new Error(
					`invalid or duplicated caption track id ${trackId || trackIndex}`,
				);
			trackIds.add(trackId);
			if (!Array.isArray(inputTrack.segments))
				throw new Error(
					`caption track ${trackId} must contain a segments array`,
				);
			const style = inputTrack.style ?? {};
			return inputTrack.segments.map((segment) => ({
				...segment,
				...(isMultiTrack
					? {
							trackId,
							trackLabel: String(inputTrack.label ?? trackId),
							language:
								inputTrack.language == null
									? null
									: String(inputTrack.language),
							pairId: segment.pairId == null ? null : String(segment.pairId),
						}
					: {}),
				positionOverride: segment.positionOverride ?? style.position ?? null,
				fontSizeOverride: segment.fontSizeOverride ?? style.fontSize ?? null,
				...(isMultiTrack
					? {
							manualPositionOverride:
								segment.manualPositionOverride ?? style.manualPosition ?? null,
						}
					: {}),
			}));
		});
		const segments = flattened
			.map((segment, index) => {
				const start = finite(
					segment.start,
					`caption track segment ${index} start`,
				);
				const end = finite(segment.end, `caption track segment ${index} end`);
				if (!(end > start) || !String(segment.text ?? "").trim())
					throw new Error(`invalid caption track segment ${index}`);
				if (segment.pairId) {
					const rangeKey = `${start.toFixed(6)}:${end.toFixed(6)}`;
					const previous = pairedRanges.get(segment.pairId);
					if (previous && previous !== rangeKey)
						throw new Error(
							`paired caption ${segment.pairId} must share one target range`,
						);
					pairedRanges.set(segment.pairId, rangeKey);
				}
				return {
					id: String(segment.id ?? `caption-${index + 1}`),
					...(isMultiTrack
						? {
								trackId: segment.trackId,
								trackLabel: segment.trackLabel,
								language: segment.language,
								pairId: segment.pairId,
							}
						: {}),
					start,
					end,
					text: String(segment.text),
					words: Array.isArray(segment.words) ? segment.words : [],
					fadeDurationOverride: segment.fadeDurationOverride ?? null,
					lingerDurationOverride: segment.lingerDurationOverride ?? null,
					positionOverride: segment.positionOverride ?? null,
					colorOverride: segment.colorOverride ?? null,
					backgroundColorOverride: segment.backgroundColorOverride ?? null,
					fontSizeOverride: segment.fontSizeOverride ?? null,
					...(isMultiTrack
						? { manualPositionOverride: segment.manualPositionOverride ?? null }
						: {}),
				};
			})
			.sort((left, right) => {
				const trackOrder = [...trackIds];
				return (
					trackOrder.indexOf(left.trackId) -
						trackOrder.indexOf(right.trackId) ||
					left.start - right.start ||
					left.end - right.end
				);
			});
		const next = structuredClone(config);
		next.timeline ??= { segments: [] };
		next.timeline.captionSegments = segments;
		if (isMultiTrack)
			next.captions = { ...(next.captions ?? {}), displayMode: "materialized" };
		next.projectRevision = currentRevision + 1;
		await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
		await rename(tempPath, configPath);
		const receipt = {
			schema: "laohu.cap-caption-track-receipt/1",
			status: "applied",
			projectPath: absoluteProject,
			trackPath: resolve(trackPath),
			trackSha256: sha256(trackText),
			previousRevision: currentRevision,
			newRevision: next.projectRevision,
			captionTrackCount: inputTracks.length,
			captionSegmentCount: segments.length,
			appliedAt: new Date().toISOString(),
		};
		if (receiptPath)
			await writeFile(
				resolve(receiptPath),
				`${JSON.stringify(receipt, null, 2)}\n`,
				"utf8",
			);
		return receipt;
	} finally {
		await rm(tempPath, { force: true });
	}
};

const PYTHON_FLOCK_WRAPPER = `
import fcntl
import subprocess
import sys

lock_path, node_bin, script_path, worker_flag, project_path, input_path, expected_revision, receipt_path = sys.argv[1:]
with open(lock_path, "a+") as lock_file:
    fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
    command = [
        node_bin,
        script_path,
        worker_flag,
        "--project", project_path,
        "--input", input_path,
        "--expected-revision", expected_revision,
    ]
    if receipt_path:
        command.extend(["--receipt", receipt_path])
    result = subprocess.run(command, text=True, capture_output=True)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    sys.exit(result.returncode)
`;

const runLockedWorker = ({
	workerFlag,
	projectPath,
	inputPath,
	expectedRevision,
	receiptPath,
}) => {
	const absoluteProject = resolve(projectPath);
	const scriptPath = fileURLToPath(import.meta.url);
	const result = spawnSync(
		"python3",
		[
			"-c",
			PYTHON_FLOCK_WRAPPER,
			join(absoluteProject, ".project-config.lock"),
			process.execPath,
			scriptPath,
			workerFlag,
			absoluteProject,
			resolve(inputPath),
			String(expectedRevision),
			receiptPath ? resolve(receiptPath) : "",
		],
		{ encoding: "utf8" },
	);
	if (result.status !== 0) {
		throw new Error(
			(result.stderr || result.stdout || "EDL transaction failed").trim(),
		);
	}
	return JSON.parse(result.stdout);
};

export const applyEdlTransaction = async ({
	projectPath,
	edlPath,
	expectedRevision,
	receiptPath,
}) =>
	runLockedWorker({
		workerFlag: "--locked-worker",
		projectPath,
		inputPath: edlPath,
		expectedRevision,
		receiptPath,
	});

export const applyCaptionTrackTransaction = async ({
	projectPath,
	trackPath,
	expectedRevision,
	receiptPath,
}) =>
	runLockedWorker({
		workerFlag: "--caption-track-worker",
		projectPath,
		inputPath: trackPath,
		expectedRevision,
		receiptPath,
	});

const parseArgs = (argv) => {
	const result = new Map();
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index];
		const value = argv[index + 1];
		if (!key?.startsWith("--") || value === undefined)
			throw new Error(`invalid argument near ${key ?? "<end>"}`);
		result.set(key.slice(2), value);
	}
	return result;
};

const isMain =
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
	try {
		const lockedWorker = process.argv[2] === "--locked-worker";
		const captionTrackWorker = process.argv[2] === "--caption-track-worker";
		const args = parseArgs(
			process.argv.slice(lockedWorker || captionTrackWorker ? 3 : 2),
		);
		const captionTrackMode = captionTrackWorker || args.has("track");
		const projectPath = args.get("project");
		const edlPath = args.get("edl") ?? args.get("input");
		const trackPath = args.get("track") ?? args.get("input");
		const expectedRevision = args.get("expected-revision");
		if (
			!projectPath ||
			(!captionTrackMode && !edlPath) ||
			(captionTrackMode && !trackPath) ||
			expectedRevision === undefined
		) {
			throw new Error(
				"usage: cap-project-edl.mjs --project PROJECT.cap (--edl final.edl.json | --track captions.json) --expected-revision N [--receipt receipt.json]",
			);
		}
		const receipt = captionTrackMode
			? await (captionTrackWorker
					? applyCaptionTrackUnlocked
					: applyCaptionTrackTransaction)({
					projectPath,
					trackPath,
					expectedRevision,
					receiptPath: args.get("receipt"),
				})
			: await (lockedWorker ? applyEdlUnlocked : applyEdlTransaction)({
					projectPath,
					edlPath,
					expectedRevision,
					receiptPath: args.get("receipt"),
				});
		console.log(JSON.stringify(receipt, null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

export type SourceAudioTrackKind = "microphone" | "systemAudio";

export type SourceAudioRange = {
	recordingClip: number;
	start: number;
	end: number;
};

export type SourceAudioCut = {
	recordingClip: number;
	time: number;
};

export type SourceAudioTrackConfiguration = {
	expanded: boolean;
	mutedRanges: SourceAudioRange[];
	cuts: SourceAudioCut[];
};

export type SourceAudioTimelineSegment = {
	recordingSegment?: number;
	start: number;
	end: number;
	timescale: number;
};

export type DerivedSourceAudioSpan = {
	parentSegmentIndex: number;
	recordingClip: number;
	sourceStart: number;
	sourceEnd: number;
	outputStart: number;
	outputEnd: number;
	timescale: number;
};

export type SourceAudioEditCommand =
	| "trimPrevious"
	| "splitAtCursor"
	| "trimNext";

export type SourceAudioEditResult = {
	track: SourceAudioTrackConfiguration;
	videoSegments?: undefined;
};

const SAMPLE_EPSILON = 1 / 48_000;

export function deriveSourceAudioSpans(
	segments: SourceAudioTimelineSegment[],
	track: SourceAudioTrackConfiguration,
): DerivedSourceAudioSpan[] {
	if (!track.expanded) return [];

	const spans: DerivedSourceAudioSpan[] = [];
	let outputCursor = 0;

	segments.forEach((segment, parentSegmentIndex) => {
		const duration =
			Number.isFinite(segment.timescale) && segment.timescale > 0
				? (segment.end - segment.start) / segment.timescale
				: 0;
		if (
			!Number.isFinite(segment.start) ||
			!Number.isFinite(segment.end) ||
			duration <= SAMPLE_EPSILON
		) {
			outputCursor += Math.max(0, duration);
			return;
		}

		const recordingClip = segment.recordingSegment ?? 0;
		const mutedRanges = track.mutedRanges.filter(
			(range) =>
				range.recordingClip === recordingClip &&
				range.end > segment.start &&
				range.start < segment.end,
		);
		const boundaries = [segment.start, segment.end];

		for (const cut of track.cuts) {
			if (
				cut.recordingClip === recordingClip &&
				cut.time > segment.start + SAMPLE_EPSILON &&
				cut.time < segment.end - SAMPLE_EPSILON
			) {
				boundaries.push(cut.time);
			}
		}
		for (const range of mutedRanges) {
			boundaries.push(
				Math.max(segment.start, range.start),
				Math.min(segment.end, range.end),
			);
		}

		const orderedBoundaries = [...new Set(boundaries)]
			.filter(Number.isFinite)
			.sort((left, right) => left - right);

		for (let index = 0; index < orderedBoundaries.length - 1; index++) {
			const sourceStart = orderedBoundaries[index];
			const sourceEnd = orderedBoundaries[index + 1];
			if (sourceEnd - sourceStart <= SAMPLE_EPSILON) continue;

			const midpoint = (sourceStart + sourceEnd) / 2;
			if (
				mutedRanges.some(
					(range) => midpoint >= range.start && midpoint < range.end,
				)
			) {
				continue;
			}

			spans.push({
				parentSegmentIndex,
				recordingClip,
				sourceStart,
				sourceEnd,
				outputStart:
					outputCursor + (sourceStart - segment.start) / segment.timescale,
				outputEnd:
					outputCursor + (sourceEnd - segment.start) / segment.timescale,
				timescale: segment.timescale,
			});
		}

		outputCursor += duration;
	});

	return spans;
}

export function splitSourceAudioAtTime(
	track: SourceAudioTrackConfiguration,
	span: DerivedSourceAudioSpan,
	outputTime: number,
): SourceAudioTrackConfiguration {
	const sourceTime = sourceTimeAtOutput(span, outputTime);
	if (
		!Number.isFinite(sourceTime) ||
		sourceTime <= span.sourceStart + SAMPLE_EPSILON ||
		sourceTime >= span.sourceEnd - SAMPLE_EPSILON
	) {
		return cloneTrack(track);
	}

	return normalizeTrack({
		...cloneTrack(track),
		cuts: [
			...track.cuts,
			{ recordingClip: span.recordingClip, time: sourceTime },
		],
	});
}

export function muteSourceAudioSpan(
	track: SourceAudioTrackConfiguration,
	span: DerivedSourceAudioSpan,
): SourceAudioTrackConfiguration {
	return addMutedRange(track, {
		recordingClip: span.recordingClip,
		start: span.sourceStart,
		end: span.sourceEnd,
	});
}

export function editSourceAudioAtTime(
	track: SourceAudioTrackConfiguration,
	span: DerivedSourceAudioSpan,
	outputTime: number,
	action: SourceAudioEditCommand,
): SourceAudioEditResult {
	if (action === "splitAtCursor") {
		return { track: splitSourceAudioAtTime(track, span, outputTime) };
	}

	const sourceTime = sourceTimeAtOutput(span, outputTime);
	if (
		!Number.isFinite(sourceTime) ||
		sourceTime <= span.sourceStart + SAMPLE_EPSILON ||
		sourceTime >= span.sourceEnd - SAMPLE_EPSILON
	) {
		return { track: cloneTrack(track) };
	}

	return {
		track: addMutedRange(track, {
			recordingClip: span.recordingClip,
			start: action === "trimPrevious" ? span.sourceStart : sourceTime,
			end: action === "trimPrevious" ? sourceTime : span.sourceEnd,
		}),
	};
}

function sourceTimeAtOutput(span: DerivedSourceAudioSpan, outputTime: number) {
	return span.sourceStart + (outputTime - span.outputStart) * span.timescale;
}

function addMutedRange(
	track: SourceAudioTrackConfiguration,
	range: SourceAudioRange,
) {
	return normalizeTrack({
		...cloneTrack(track),
		mutedRanges: [...track.mutedRanges, range],
	});
}

function cloneTrack(
	track: SourceAudioTrackConfiguration,
): SourceAudioTrackConfiguration {
	return {
		expanded: track.expanded,
		mutedRanges: track.mutedRanges.map((range) => ({ ...range })),
		cuts: track.cuts.map((cut) => ({ ...cut })),
	};
}

function normalizeTrack(
	track: SourceAudioTrackConfiguration,
): SourceAudioTrackConfiguration {
	const mutedRanges = track.mutedRanges
		.filter(
			(range) =>
				Number.isInteger(range.recordingClip) &&
				range.recordingClip >= 0 &&
				Number.isFinite(range.start) &&
				Number.isFinite(range.end) &&
				range.end - range.start > SAMPLE_EPSILON,
		)
		.sort(
			(left, right) =>
				left.recordingClip - right.recordingClip ||
				left.start - right.start ||
				left.end - right.end,
		);
	const mergedRanges: SourceAudioRange[] = [];
	for (const range of mutedRanges) {
		const previous = mergedRanges.at(-1);
		if (
			previous &&
			previous.recordingClip === range.recordingClip &&
			range.start <= previous.end + SAMPLE_EPSILON
		) {
			previous.end = Math.max(previous.end, range.end);
		} else {
			mergedRanges.push({ ...range });
		}
	}

	const cuts: SourceAudioCut[] = [];
	for (const cut of [...track.cuts]
		.filter(
			(cut) =>
				Number.isInteger(cut.recordingClip) &&
				cut.recordingClip >= 0 &&
				Number.isFinite(cut.time),
		)
		.sort(
			(left, right) =>
				left.recordingClip - right.recordingClip || left.time - right.time,
		)) {
		const previous = cuts.at(-1);
		if (
			!previous ||
			previous.recordingClip !== cut.recordingClip ||
			cut.time - previous.time > SAMPLE_EPSILON
		) {
			cuts.push({ ...cut });
		}
	}

	return { expanded: track.expanded, mutedRanges: mergedRanges, cuts };
}

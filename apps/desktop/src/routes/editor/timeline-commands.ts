export type TimelineEditCommand = "trimPrevious" | "splitAtCursor" | "trimNext";

export type TimelineSegmentSpan = { start: number; end: number };

export function resolveTimelineCommandTime(
	previewTime: number | null,
	playbackTime: number,
) {
	return previewTime ?? playbackTime;
}

export function intersectingSelectedIndices(
	spans: TimelineSegmentSpan[],
	selectedIndices: number[],
	time: number,
) {
	const result: number[] = [];
	for (const index of new Set(selectedIndices)) {
		if (!Number.isInteger(index) || index < 0) continue;
		const span = spans[index];
		if (!span || !(time > span.start && time < span.end)) continue;
		result.push(index);
	}
	return result.sort((a, b) => a - b);
}

type TrimmableOverlaySegment = {
	start: number;
	end: number;
	trimStart?: number;
	fadeIn?: number;
	fadeOut?: number;
};

export function trimOverlaySegmentAtTime<T extends TrimmableOverlaySegment>(
	segment: T,
	time: number,
	action: "trimPrevious" | "trimNext",
	minimumDuration: number,
) {
	if (!Number.isFinite(time) || time <= segment.start || time >= segment.end) {
		return false;
	}
	if (action === "trimPrevious") {
		if (segment.end - time < minimumDuration) return false;
		const removed = time - segment.start;
		segment.start = time;
		if (typeof segment.trimStart === "number") {
			segment.trimStart += removed;
		}
		if (typeof segment.fadeIn === "number") segment.fadeIn = 0;
		return true;
	}

	if (time - segment.start < minimumDuration) return false;
	segment.end = time;
	if (typeof segment.fadeOut === "number") segment.fadeOut = 0;
	return true;
}

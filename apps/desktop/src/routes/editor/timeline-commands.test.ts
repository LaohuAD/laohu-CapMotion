import { describe, expect, it } from "vitest";
import {
	intersectingSelectedIndices,
	resolveTimelineCommandTime,
	trimOverlaySegmentAtTime,
} from "./timeline-commands";

describe("timeline command resolution", () => {
	it("prefers the timeline hover preview and falls back to the playhead", () => {
		expect(resolveTimelineCommandTime(4.25, 2)).toBe(4.25);
		expect(resolveTimelineCommandTime(null, 2)).toBe(2);
	});

	it("only returns selected segments crossed strictly by the cut time", () => {
		const spans = [
			{ start: 0, end: 2 },
			{ start: 2, end: 5 },
			{ start: 5, end: 8 },
		];

		expect(intersectingSelectedIndices(spans, [0, 1, 2], 3)).toEqual([1]);
		expect(intersectingSelectedIndices(spans, [0, 2], 3)).toEqual([]);
		expect(intersectingSelectedIndices(spans, [0, 1], 2)).toEqual([]);
		expect(intersectingSelectedIndices(spans, [1, 2], 5)).toEqual([]);
	});

	it("deduplicates and rejects invalid selected indices", () => {
		expect(
			intersectingSelectedIndices([{ start: 1, end: 4 }], [0, 0, -1, 9], 2),
		).toEqual([0]);
	});

	it("trims an overlay edge without moving unrelated time", () => {
		const left = { start: 1, end: 6 };
		expect(trimOverlaySegmentAtTime(left, 3, "trimPrevious", 0.2)).toBe(true);
		expect(left).toEqual({ start: 3, end: 6 });

		const right = { start: 1, end: 6 };
		expect(trimOverlaySegmentAtTime(right, 4, "trimNext", 0.2)).toBe(true);
		expect(right).toEqual({ start: 1, end: 4 });
	});

	it("advances imported-audio trimStart and clears only the new cut fade", () => {
		const audio = {
			start: 2,
			end: 8,
			trimStart: 1.5,
			fadeIn: 0.4,
			fadeOut: 0.6,
		};
		expect(trimOverlaySegmentAtTime(audio, 5, "trimPrevious", 0.1)).toBe(true);
		expect(audio).toEqual({
			start: 5,
			end: 8,
			trimStart: 4.5,
			fadeIn: 0,
			fadeOut: 0.6,
		});
	});

	it("rejects trims that violate a track's minimum retained duration", () => {
		const segment = { start: 1, end: 5 };
		expect(trimOverlaySegmentAtTime(segment, 4.5, "trimPrevious", 1)).toBe(
			false,
		);
		expect(segment).toEqual({ start: 1, end: 5 });
	});
});

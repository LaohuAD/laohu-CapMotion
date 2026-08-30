import { describe, expect, it } from "vitest";
import {
	deriveSourceAudioSpans,
	editSourceAudioAtTime,
	type SourceAudioTrackConfiguration,
} from "./source-audio";

const collapsedTrack: SourceAudioTrackConfiguration = {
	expanded: false,
	mutedRanges: [],
	cuts: [],
};

describe("source audio child spans", () => {
	it("does not expose child spans until the source track is expanded", () => {
		expect(
			deriveSourceAudioSpans(
				[{ recordingSegment: 0, start: 0, end: 4, timescale: 1 }],
				collapsedTrack,
			),
		).toEqual([]);
	});

	it("splits visible spans at source cuts and muted gaps", () => {
		const track: SourceAudioTrackConfiguration = {
			expanded: true,
			cuts: [{ recordingClip: 0, time: 2 }],
			mutedRanges: [{ recordingClip: 0, start: 3, end: 4 }],
		};

		expect(
			deriveSourceAudioSpans(
				[{ recordingSegment: 0, start: 0, end: 5, timescale: 1 }],
				track,
			).map(({ sourceStart, sourceEnd, outputStart, outputEnd }) => ({
				sourceStart,
				sourceEnd,
				outputStart,
				outputEnd,
			})),
		).toEqual([
			{ sourceStart: 0, sourceEnd: 2, outputStart: 0, outputEnd: 2 },
			{ sourceStart: 2, sourceEnd: 3, outputStart: 2, outputEnd: 3 },
			{ sourceStart: 4, sourceEnd: 5, outputStart: 4, outputEnd: 5 },
		]);
	});

	it("keeps source edits attached when parent clips are split and reordered", () => {
		const track: SourceAudioTrackConfiguration = {
			expanded: true,
			cuts: [],
			mutedRanges: [{ recordingClip: 0, start: 1, end: 2 }],
		};
		const spans = deriveSourceAudioSpans(
			[
				{ recordingSegment: 1, start: 5, end: 7, timescale: 1 },
				{ recordingSegment: 0, start: 0, end: 3, timescale: 1 },
				{ recordingSegment: 0, start: 4, end: 6, timescale: 2 },
			],
			track,
		);

		expect(
			spans.map(
				({
					parentSegmentIndex,
					recordingClip,
					sourceStart,
					sourceEnd,
					outputStart,
					outputEnd,
				}) => ({
					parentSegmentIndex,
					recordingClip,
					sourceStart,
					sourceEnd,
					outputStart,
					outputEnd,
				}),
			),
		).toEqual([
			{
				parentSegmentIndex: 0,
				recordingClip: 1,
				sourceStart: 5,
				sourceEnd: 7,
				outputStart: 0,
				outputEnd: 2,
			},
			{
				parentSegmentIndex: 1,
				recordingClip: 0,
				sourceStart: 0,
				sourceEnd: 1,
				outputStart: 2,
				outputEnd: 3,
			},
			{
				parentSegmentIndex: 1,
				recordingClip: 0,
				sourceStart: 2,
				sourceEnd: 3,
				outputStart: 4,
				outputEnd: 5,
			},
			{
				parentSegmentIndex: 2,
				recordingClip: 0,
				sourceStart: 4,
				sourceEnd: 6,
				outputStart: 5,
				outputEnd: 6,
			},
		]);
	});

	it("trims source audio without changing the video timeline", () => {
		const track: SourceAudioTrackConfiguration = {
			expanded: true,
			cuts: [],
			mutedRanges: [],
		};
		const span = deriveSourceAudioSpans(
			[{ recordingSegment: 0, start: 2, end: 10, timescale: 2 }],
			track,
		)[0];

		const result = editSourceAudioAtTime(track, span, 1.5, "trimPrevious");

		expect(result.track.mutedRanges).toEqual([
			{ recordingClip: 0, start: 2, end: 5 },
		]);
		expect(result.videoSegments).toBeUndefined();
		expect(track.mutedRanges).toEqual([]);
	});
});

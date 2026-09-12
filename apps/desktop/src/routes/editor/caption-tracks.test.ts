import { describe, expect, it } from "vitest";
import {
	captionTrackPositionLabel,
	groupCaptionSegmentsByTrack,
	shouldMirrorCaptionEditToSource,
	visibleCaptionEntries,
} from "./caption-tracks";

describe("groupCaptionSegmentsByTrack", () => {
	it("keeps linked Chinese and English captions in two stable timeline rows", () => {
		const groups = groupCaptionSegmentsByTrack([
			{
				id: "zh-1",
				trackId: "zh-CN",
				pairId: "caption-1",
				start: 1,
				end: 2,
				text: "中文",
			},
			{
				id: "en-1",
				trackId: "en",
				pairId: "caption-1",
				start: 1,
				end: 2,
				text: "English",
			},
			{ id: "legacy", start: 3, end: 4, text: "旧字幕" },
		] as never);

		expect(
			groups.map(({ id, label, entries }) => ({
				id,
				label,
				indices: entries.map((entry) => entry.index),
			})),
		).toEqual([
			{ id: "zh-CN", label: "中文字幕", indices: [0] },
			{ id: "en", label: "English Captions", indices: [1] },
			{ id: "default", label: "Captions", indices: [2] },
		]);
	});

	it("does not mirror materialized translation edits into the source ASR master", () => {
		expect(shouldMirrorCaptionEditToSource("materialized")).toBe(false);
		expect(shouldMirrorCaptionEditToSource("autoProject")).toBe(true);
		expect(shouldMirrorCaptionEditToSource(undefined)).toBe(true);
	});

	it("labels each visible position control by its own caption track", () => {
		expect(captionTrackPositionLabel("zh-CN", "中文字幕")).toBe(
			"Chinese Position",
		);
		expect(captionTrackPositionLabel("en", "English Captions")).toBe(
			"English Position",
		);
		expect(captionTrackPositionLabel("ja", "日本語")).toBe("日本語 Position");
	});
});

describe("caption viewport", () => {
	it("keeps original indices and the active drag while removing offscreen entries", () => {
		const entries = Array.from({ length: 1000 }, (_, index) => ({
			index,
			segment: { start: index * 2, end: index * 2 + 1 },
		}));
		const visible = visibleCaptionEntries(entries as never, 100, 104, 900);
		expect(visible.map((e) => e.index)).toEqual([50, 51, 52, 900]);
		expect(visible[0]).toBe(entries[50]);
		expect(visibleCaptionEntries(entries as never, 3000, 3001)).toEqual([]);
	});
});

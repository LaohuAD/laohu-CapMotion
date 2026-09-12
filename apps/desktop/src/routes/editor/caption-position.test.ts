import { describe, expect, it } from "vitest";
import {
	centeredPixelsToNormalized,
	getCaptionTrackPosition,
	normalizedToCenteredPixels,
	pruneCaptionTrackPositions,
	setCaptionTrackPosition,
	resolveCaptionTrackFontSize,
	setCaptionTrackFontSize,
} from "./caption-position";

describe("caption position coordinates", () => {
	it("uses the output-frame center as 0,0", () => {
		expect(normalizedToCenteredPixels({ x: 0.5, y: 0.5 })).toEqual({
			x: 0,
			y: 0,
		});
		expect(centeredPixelsToNormalized({ x: 1, y: -1 })).toEqual({
			x: 0.5 + 1 / 1920,
			y: 0.5 - 1 / 1080,
		});
	});

	it("stores independent positions for Chinese and English tracks", () => {
		const positions = setCaptionTrackPosition([], "zh-CN", {
			position: "manual",
			manualPosition: { x: 0.5, y: 0.8 },
		});
		const bilingual = setCaptionTrackPosition(positions, "en", {
			position: "manual",
			manualPosition: { x: 0.5, y: 0.9 },
		});

		expect(getCaptionTrackPosition(bilingual, "zh-CN")).toMatchObject({
			manualPosition: { x: 0.5, y: 0.8 },
		});
		expect(getCaptionTrackPosition(bilingual, "en")).toMatchObject({
			manualPosition: { x: 0.5, y: 0.9 },
		});
	});

	it("removes only positions whose caption tracks no longer exist", () => {
		const positions = [
			{
				trackId: "zh-CN",
				position: "manual",
				manualPosition: { x: 0.5, y: 0.8 },
			},
			{
				trackId: "en",
				position: "manual",
				manualPosition: { x: 0.5, y: 0.9 },
			},
		];

		expect(pruneCaptionTrackPositions(positions, new Set(["zh-CN"]))).toEqual([
			positions[0],
		]);
	});
});

it("changes Chinese size without changing English or its manual position", () => {
	const rows = [
		{ trackId: "zh-CN", fontSizeOverride: 64 },
		{ trackId: "en", fontSizeOverride: 34 },
	];
	const styles = setCaptionTrackFontSize([], "zh-CN", 52);
	expect(resolveCaptionTrackFontSize(styles, "zh-CN", rows, 32)).toBe(52);
	expect(resolveCaptionTrackFontSize(styles, "en", rows, 32)).toBe(34);
	const both = setCaptionTrackFontSize(styles, "en", 30);
	expect(resolveCaptionTrackFontSize(both, "zh-CN", rows, 32)).toBe(52);
	expect(resolveCaptionTrackFontSize(both, "en", rows, 32)).toBe(30);
	expect(resolveCaptionTrackFontSize([], "default", [], 32)).toBe(32);
});

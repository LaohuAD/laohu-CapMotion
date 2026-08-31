import { describe, expect, it, vi } from "vitest";
import {
	clampSeekTime,
	createSeekScheduler,
	shouldTogglePlayback,
	shouldTogglePlaybackFromElement,
} from "./player-transport";

describe("player transport", () => {
	it("clamps invalid and out-of-range seek times", () => {
		expect(clampSeekTime(-1, 30)).toBe(0);
		expect(clampSeekTime(31, 30)).toBe(30);
		expect(clampSeekTime(Number.NaN, 30)).toBe(0);
	});

	it("does not toggle from editor controls or buttons", () => {
		expect(shouldTogglePlayback({ editorControl: false, button: false })).toBe(
			true,
		);
		expect(shouldTogglePlayback({ editorControl: true, button: false })).toBe(
			false,
		);
		expect(shouldTogglePlayback({ editorControl: false, button: true })).toBe(
			false,
		);
	});

	it("coalesces seeks to the latest value in a frame", () => {
		const frames: FrameRequestCallback[] = [];
		const seen: number[] = [];
		const scheduler = createSeekScheduler(
			(time) => seen.push(time),
			(callback) => {
				frames.push(callback);
				return frames.length;
			},
		);
		scheduler.request(1);
		scheduler.request(2);
		scheduler.request(3);
		expect(seen).toEqual([]);
		frames[0](0);
		expect(seen).toEqual([3]);
	});

	it("classifies canvas clicks separately from interactive descendants", () => {
		const closest = vi.fn(() => null);
		expect(shouldTogglePlaybackFromElement({ closest })).toBe(true);
		expect(closest).toHaveBeenCalled();
		expect(
			shouldTogglePlaybackFromElement({ closest: () => ({}) as Element }),
		).toBe(false);
	});
});

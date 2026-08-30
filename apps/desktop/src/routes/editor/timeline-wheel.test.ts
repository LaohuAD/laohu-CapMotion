import { describe, expect, it } from "vitest";
import { resolveTimelineWheelIntent } from "./timeline-wheel";

describe("timeline wheel routing", () => {
	it("uses Control for zoom before other wheel behavior", () => {
		expect(
			resolveTimelineWheelIntent({
				deltaX: 0,
				deltaY: -18,
				ctrlKey: true,
				metaKey: false,
				shiftKey: false,
				platform: "macos",
			}),
		).toEqual({ type: "zoom", delta: -18 });
	});

	it("uses Command for vertical track scrolling on macOS", () => {
		expect(
			resolveTimelineWheelIntent({
				deltaX: 0,
				deltaY: 42,
				ctrlKey: false,
				metaKey: true,
				shiftKey: false,
				platform: "macos",
			}),
		).toEqual({ type: "vertical", delta: 42 });
	});

	it("maps a plain vertical wheel to horizontal timeline pan", () => {
		expect(
			resolveTimelineWheelIntent({
				deltaX: 0,
				deltaY: 30,
				ctrlKey: false,
				metaKey: false,
				shiftKey: false,
				platform: "macos",
			}),
		).toEqual({ type: "pan", delta: 30 });
	});

	it("preserves a trackpad's dominant horizontal delta", () => {
		expect(
			resolveTimelineWheelIntent({
				deltaX: -55,
				deltaY: 4,
				ctrlKey: false,
				metaKey: false,
				shiftKey: false,
				platform: "macos",
			}),
		).toEqual({ type: "pan", delta: -55 });
	});
});

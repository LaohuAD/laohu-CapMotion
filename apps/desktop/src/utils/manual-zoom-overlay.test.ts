import { describe, expect, it } from "vitest";
import {
	advanceManualZoomFollow,
	manualZoomViewport,
} from "./manual-zoom-overlay";

describe("manualZoomViewport", () => {
	it("centres the visible frame around an interior cursor", () => {
		expect(manualZoomViewport(0.5, 0.5, 2)).toEqual({
			left: 25,
			top: 25,
			width: 50,
			height: 50,
			amount: 2,
		});
	});

	it("keeps the frame inside the captured area at an edge", () => {
		const viewport = manualZoomViewport(1, 0, 2);
		expect(viewport.left).toBe(50);
		expect(viewport.top).toBe(0);
	});

	it("bounds unsafe zoom values", () => {
		expect(manualZoomViewport(0.5, 0.5, 99).amount).toBe(8);
		expect(manualZoomViewport(0.5, 0.5, Number.NaN).amount).toBe(2);
	});
});

describe("advanceManualZoomFollow", () => {
	it("keeps the frame still while the cursor remains inside the safe zone", () => {
		expect(
			advanceManualZoomFollow(
				{ x: 0.5, y: 0.5 },
				{ x: 0.6, y: 0.55 },
				2,
				1 / 60,
			),
		).toEqual({ x: 0.5, y: 0.5 });
	});

	it("moves smoothly when the cursor enters the edge buffer", () => {
		const next = advanceManualZoomFollow(
			{ x: 0.5, y: 0.5 },
			{ x: 0.74, y: 0.5 },
			2,
			1 / 60,
		);
		expect(next.x).toBeGreaterThan(0.5);
		expect(next.x).toBeLessThan(0.74);
		expect(next.y).toBe(0.5);
	});

	it("keeps the frame inside the source at the edge", () => {
		const next = advanceManualZoomFollow(
			{ x: 0.75, y: 0.5 },
			{ x: 1, y: 0.5 },
			2,
			1,
		);
		expect(next.x).toBe(0.75);
	});
});

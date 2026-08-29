import { describe, expect, it } from "vitest";
import { manualZoomViewport } from "./manual-zoom-overlay";

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

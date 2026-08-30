import { describe, expect, it } from "vitest";
import {
	advanceManualZoomFollow,
	DEFAULT_MANUAL_ZOOM_FOLLOW,
	manualZoomViewport,
	predictManualZoomCursor,
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
				{ x: 0.55, y: 0.55 },
				{ x: 0.58, y: 0.55 },
				0.05,
				2,
				1 / 60,
			),
		).toEqual({ x: 0.5, y: 0.5 });
	});

	it("moves smoothly when the cursor enters the edge buffer", () => {
		const next = advanceManualZoomFollow(
			{ x: 0.5, y: 0.5 },
			{ x: 0.58, y: 0.5 },
			{ x: 0.72, y: 0.5 },
			1.4,
			2,
			1 / 60,
		);
		expect(next.x).toBeGreaterThan(0.5);
		expect(next.x).toBeLessThan(0.72);
		expect(next.y).toBe(0.5);
	});

	it("uses a stronger response for fast cursor movement", () => {
		const slow = advanceManualZoomFollow(
			{ x: 0.5, y: 0.5 },
			{ x: 0.6, y: 0.5 },
			{ x: 0.72, y: 0.5 },
			0.1,
			2,
			1 / 60,
		);
		const fast = advanceManualZoomFollow(
			{ x: 0.5, y: 0.5 },
			{ x: 0.6, y: 0.5 },
			{ x: 0.72, y: 0.5 },
			2,
			2,
			1 / 60,
		);

		expect(fast.x).toBeGreaterThan(slow.x);
	});

	it("keeps the frame inside the source at the edge", () => {
		const next = advanceManualZoomFollow(
			{ x: 0.75, y: 0.5 },
			{ x: 1, y: 0.5 },
			{ x: 1, y: 0.5 },
			4,
			2,
			1,
		);
		expect(next.x).toBe(0.75);
	});

	it("forces the actual cursor inside the outer guard even with zero dt", () => {
		const next = advanceManualZoomFollow(
			{ x: 0.5, y: 0.5 },
			{ x: 0.9, y: 0.5 },
			{ x: 0.9, y: 0.5 },
			4,
			2,
			0,
		);
		const guardHalf = 0.25 * DEFAULT_MANUAL_ZOOM_FOLLOW.outerGuardRatio;
		expect(0.9 - next.x).toBeLessThanOrEqual(guardHalf);
	});
});

describe("predictManualZoomCursor", () => {
	it("projects fast movement and clamps lead to the configured maximum", () => {
		const first = predictManualZoomCursor(null, { x: 0.4, y: 0.5 }, 0, 2);
		const next = predictManualZoomCursor(
			first.state,
			{ x: 0.6, y: 0.5 },
			100,
			2,
		);

		expect(next.framingCursor.x).toBeCloseTo(0.7);
		expect(next.framingCursor.y).toBe(0.5);
		expect(next.speed).toBeGreaterThan(0);
	});

	it("replaces stale velocity immediately when direction reverses", () => {
		const first = predictManualZoomCursor(null, { x: 0.4, y: 0.5 }, 0, 2);
		const right = predictManualZoomCursor(
			first.state,
			{ x: 0.6, y: 0.5 },
			100,
			2,
		);
		const reversed = predictManualZoomCursor(
			right.state,
			{ x: 0.55, y: 0.5 },
			150,
			2,
		);

		expect(reversed.state.velocity.x).toBeLessThan(0);
		expect(reversed.framingCursor.x).toBeLessThan(0.55);
	});
});

import { describe, expect, it } from "vitest";
import type { MotionArtifact, MotionSegment } from "./motion";
import {
	motionPreviewRect,
	moveMotionTransform,
	resizeMotionTransform,
	topmostActiveMotionIndex,
} from "./motion-canvas";

const segment = (overrides: Partial<MotionSegment> = {}): MotionSegment => ({
	id: "segment",
	definitionId: "definition",
	definitionVersion: 1,
	start: 0,
	end: 10,
	track: 0,
	zIndex: 0,
	role: "animation",
	transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
	opacity: 1,
	durationPolicy: "responsive",
	props: {},
	artifactId: "artifact",
	...overrides,
});

const artifact: MotionArtifact = {
	id: "artifact",
	segmentId: "segment",
	contentHash: "hash",
	quality: "preview",
	status: "ready",
	path: "artifact.mov",
	width: 1920,
	height: 1080,
	fps: 30,
	hasAlpha: true,
	duration: 10,
	error: null,
};

describe("motion canvas geometry", () => {
	it("matches renderer output geometry in preview coordinates", () => {
		expect(
			motionPreviewRect(
				segment(),
				{ width: 1920, height: 1080 },
				{ width: 960, height: 540 },
			),
		).toEqual({ x: 0, y: 0, width: 960, height: 540, rotation: 0 });
	});

	it("converts preview deltas into output pixels without changing scale", () => {
		expect(
			moveMotionTransform(
				segment().transform,
				{ x: 96, y: -54 },
				{ width: 1920, height: 1080 },
				{ width: 960, height: 540 },
			),
		).toEqual({ x: 192, y: -108, scaleX: 1, scaleY: 1, rotation: 0 });
	});

	it("resizes uniformly and clamps scale", () => {
		expect(resizeMotionTransform(segment().transform, 2)).toMatchObject({
			scaleX: 2,
			scaleY: 2,
		});
		expect(
			resizeMotionTransform(
				{ ...segment().transform, scaleX: 2, scaleY: 2 },
				2,
			),
		).toMatchObject({ scaleX: 3, scaleY: 3 });
	});

	it("selects the visually topmost active usable segment", () => {
		const low = segment({ id: "low", artifactId: "low-artifact" });
		const high = segment({
			id: "high",
			zIndex: 4,
			artifactId: "high-artifact",
		});
		const artifacts = [
			{ ...artifact, id: "low-artifact", segmentId: "low" },
			{ ...artifact, id: "high-artifact", segmentId: "high" },
		];
		expect(topmostActiveMotionIndex([low, high], artifacts, 5)).toBe(1);
	});
});

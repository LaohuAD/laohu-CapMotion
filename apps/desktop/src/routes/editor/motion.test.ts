import { describe, expect, it } from "vitest";
import * as motionHelpers from "./motion";
import {
	type MotionDefinition,
	type MotionSegment,
	moveMotionSegment,
	normalizeMotionFields,
	resizeMotionSegment,
} from "./motion";

const definition: MotionDefinition = {
	id: "case-cards",
	version: 1,
	renderer: "remotion",
	source: "motion/case-cards",
	compositionId: "CaseCards",
	status: "approved",
	minDuration: 2,
	defaultDuration: 5,
	maxDuration: 10,
	defaultPolicy: "responsive",
	introDuration: 0.2,
	outroDuration: 0.2,
	defaultProps: {},
};

const segment: MotionSegment = {
	id: "motion-1",
	definitionId: "case-cards",
	definitionVersion: 1,
	start: 4,
	end: 9,
	track: 0,
	zIndex: 20,
	role: "animation",
	transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
	opacity: 1,
	durationPolicy: "responsive",
	props: {},
	artifactId: "artifact-1",
};

describe("motion project helpers", () => {
	it("defaults legacy projects to revision zero and empty motion collections", () => {
		expect(normalizeMotionFields({})).toEqual({
			projectRevision: 0,
			motion: { definitions: [], segments: [], artifacts: [] },
		});
	});

	it("moves a segment without changing its duration", () => {
		expect(moveMotionSegment(segment, 12, 30, 2)).toMatchObject({
			start: 12,
			end: 17,
			track: 2,
		});
	});

	it("clamps responsive resize to the definition bounds", () => {
		expect(resizeMotionSegment(segment, 0.5, definition).end).toBe(6);
		expect(resizeMotionSegment(segment, 20, definition).end).toBe(14);
	});

	it("keeps a segment against the left edge of a same-role peer", () => {
		const peer: MotionSegment = {
			...segment,
			id: "motion-2",
			start: 10,
			end: 15,
			track: 3,
			role: "animation",
		};
		const moving: MotionSegment = {
			...segment,
			start: 2,
			end: 7,
			role: "animation",
		};

		expect(
			moveMotionSegment(moving, 8, 30, 0, [moving, peer] as MotionSegment[]),
		).toMatchObject({ start: 5, end: 10 });
	});

	it("keeps a segment against the right edge of a same-role peer", () => {
		const peer: MotionSegment = {
			...segment,
			id: "motion-2",
			start: 10,
			end: 15,
			role: "animation",
		};
		const moving: MotionSegment = {
			...segment,
			start: 18,
			end: 23,
			role: "animation",
		};

		expect(
			moveMotionSegment(moving, 12, 30, 0, [moving, peer] as MotionSegment[]),
		).toMatchObject({ start: 15, end: 20 });
	});

	it("sticks to the near edge instead of returning to its origin at the project boundary", () => {
		const peer: MotionSegment = {
			...segment,
			id: "motion-at-end",
			start: 25,
			end: 30,
			role: "animation",
		};
		const moving: MotionSegment = {
			...segment,
			start: 0,
			end: 5,
			role: "animation",
		};

		expect(
			moveMotionSegment(moving, 24, 30, 0, [moving, peer] as MotionSegment[]),
		).toMatchObject({ start: 20, end: 25 });
	});

	it("allows different overlay roles to share the same time range", () => {
		const avatar: MotionSegment = {
			...segment,
			id: "avatar-1",
			start: 10,
			end: 15,
			role: "avatar",
		};
		const animation: MotionSegment = {
			...segment,
			start: 2,
			end: 7,
			role: "animation",
		};

		expect(
			moveMotionSegment(animation, 10, 30, 0, [
				animation,
				avatar,
			] as MotionSegment[]),
		).toMatchObject({ start: 10, end: 15 });
	});

	it("clamps a start-handle resize at the previous same-role boundary", () => {
		const resizeStart = (
			motionHelpers as typeof motionHelpers & {
				resizeMotionSegmentStart?: (
					segment: MotionSegment,
					start: number,
					definition: MotionDefinition | undefined,
					segments: MotionSegment[],
				) => MotionSegment;
			}
		).resizeMotionSegmentStart;
		expect(typeof resizeStart).toBe("function");
		if (!resizeStart) return;

		const previous: MotionSegment = {
			...segment,
			id: "motion-previous",
			start: 1,
			end: 5,
			role: "animation",
		};
		const target: MotionSegment = {
			...segment,
			start: 8,
			end: 14,
			role: "animation",
		};
		expect(
			resizeStart(target, 3, definition, [previous, target] as MotionSegment[]),
		).toMatchObject({ start: 5, end: 14 });
	});
});

import { describe, expect, it } from "vitest";
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
});

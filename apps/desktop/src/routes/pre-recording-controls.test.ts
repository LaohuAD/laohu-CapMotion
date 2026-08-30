import { describe, expect, it } from "vitest";
import { preRecordingControlsOrigin } from "./pre-recording-controls";

describe("pre-recording controls position", () => {
	it("centers a 416x88 control at 40 percent of a 1920x1080 display", () => {
		expect(
			preRecordingControlsOrigin(
				{ width: 1920, height: 1080 },
				{ width: 416, height: 88 },
			),
		).toEqual({ left: 752, top: 388 });
	});

	it("keeps controls inside a smaller display", () => {
		expect(
			preRecordingControlsOrigin(
				{ width: 800, height: 600 },
				{ width: 416, height: 88 },
			),
		).toEqual({ left: 192, top: 196 });
	});

	it("clamps both axes to the safe margin", () => {
		expect(
			preRecordingControlsOrigin(
				{ width: 360, height: 180 },
				{ width: 328, height: 160 },
			),
		).toEqual({ left: 16, top: 16 });
	});
});

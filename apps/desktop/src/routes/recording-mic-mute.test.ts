import { describe, expect, it } from "vitest";
import { canToggleRecordingMic } from "./recording-mic-mute";

const enabled = {
	recordingMode: "studio" as const,
	microphoneSelected: true,
	microphoneDisconnected: false,
	sessionState: "recording" as const,
	mutationPending: false,
};

describe("recording microphone mute eligibility", () => {
	it.each(["studio", "instant"] as const)(
		"allows microphone mute during %s recording",
		(recordingMode) => {
			expect(canToggleRecordingMic({ ...enabled, recordingMode })).toBe(true);
		},
	);

	it("allows toggling while the recording is paused", () => {
		expect(canToggleRecordingMic({ ...enabled, sessionState: "paused" })).toBe(
			true,
		);
	});

	it.each([
		{ microphoneSelected: false },
		{ microphoneDisconnected: true },
		{ sessionState: "countdown" as const },
		{ sessionState: "stopped" as const },
		{ mutationPending: true },
	])("rejects unavailable state %#", (override) => {
		expect(canToggleRecordingMic({ ...enabled, ...override })).toBe(false);
	});
});

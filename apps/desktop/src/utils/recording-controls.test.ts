import { describe, expect, it } from "vitest";
import {
	projectElapsedMs,
	type RecordingSessionView,
	reconcileRecordingSession,
	recordingControlsPresentation,
} from "./recording-controls";

describe("reconcileRecordingSession", () => {
	it("hides every stale local state when the backend has no recording", () => {
		expect(
			reconcileRecordingSession(
				{ kind: "countdown", from: 3, current: 3 },
				null,
				5_000,
			),
		).toEqual({ kind: "hidden" });
	});

	it("keeps the baseline for the same running session", () => {
		const current: RecordingSessionView = {
			kind: "active",
			sessionId: "one",
			baselineElapsedMs: 9_000,
			observedAtMs: 10_000,
			paused: false,
		};

		expect(
			reconcileRecordingSession(
				current,
				{ sessionId: "one", elapsedMs: 9_100, paused: false },
				10_100,
			),
		).toEqual(current);
	});

	it("hydrates a new session from backend elapsed time", () => {
		expect(
			reconcileRecordingSession(
				{ kind: "hidden" },
				{ sessionId: "two", elapsedMs: 4_200, paused: false },
				20_000,
			),
		).toEqual({
			kind: "active",
			sessionId: "two",
			baselineElapsedMs: 4_200,
			observedAtMs: 20_000,
			paused: false,
		});
	});

	it("rebases the same session when pause state changes", () => {
		expect(
			reconcileRecordingSession(
				{
					kind: "active",
					sessionId: "one",
					baselineElapsedMs: 3_000,
					observedAtMs: 10_000,
					paused: false,
				},
				{ sessionId: "one", elapsedMs: 5_000, paused: true },
				12_000,
			),
		).toEqual({
			kind: "active",
			sessionId: "one",
			baselineElapsedMs: 5_000,
			observedAtMs: 12_000,
			paused: true,
		});
	});

	it("keeps countdown only while the backend is pending", () => {
		const countdown: RecordingSessionView = {
			kind: "countdown",
			from: 3,
			current: 2,
		};
		expect(
			reconcileRecordingSession(
				countdown,
				{ sessionId: null, elapsedMs: 0, paused: false },
				1_000,
			),
		).toEqual(countdown);
	});
});

describe("projectElapsedMs", () => {
	it("projects wall time only for a running session", () => {
		expect(
			projectElapsedMs(
				{
					kind: "active",
					sessionId: "one",
					baselineElapsedMs: 3_000,
					observedAtMs: 10_000,
					paused: false,
				},
				12_500,
			),
		).toBe(5_500);
	});

	it("freezes a paused session", () => {
		expect(
			projectElapsedMs(
				{
					kind: "active",
					sessionId: "one",
					baselineElapsedMs: 3_000,
					observedAtMs: 10_000,
					paused: true,
				},
				12_500,
			),
		).toBe(3_000);
	});
});

describe("recordingControlsPresentation", () => {
	it("collapses a healthy active recording", () => {
		expect(
			recordingControlsPresentation({
				active: true,
				hovered: false,
				interacting: false,
				countdown: false,
				error: false,
			}),
		).toBe("collapsed");
	});

	it("expands on hover countdown error or active interaction", () => {
		for (const override of [
			{ hovered: true },
			{ countdown: true },
			{ error: true },
			{ interacting: true },
		]) {
			expect(
				recordingControlsPresentation({
					active: true,
					hovered: false,
					interacting: false,
					countdown: false,
					error: false,
					...override,
				}),
			).toBe("expanded");
		}
	});
});

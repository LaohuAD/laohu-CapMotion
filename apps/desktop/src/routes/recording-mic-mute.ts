export type RecordingMicMuteEligibility = {
	recordingMode: "studio" | "instant" | "screenshot" | undefined;
	microphoneSelected: boolean;
	microphoneDisconnected: boolean;
	sessionState:
		| "initializing"
		| "countdown"
		| "recording"
		| "paused"
		| "stopped";
	mutationPending: boolean;
};

export function canToggleRecordingMic(
	state: RecordingMicMuteEligibility,
): boolean {
	return (
		(state.recordingMode === "studio" || state.recordingMode === "instant") &&
		state.microphoneSelected &&
		!state.microphoneDisconnected &&
		(state.sessionState === "recording" || state.sessionState === "paused") &&
		!state.mutationPending
	);
}

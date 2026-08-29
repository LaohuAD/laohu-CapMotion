export type RecordingSessionView =
	| { kind: "hidden" }
	| { kind: "initializing" }
	| { kind: "countdown"; from: number; current: number }
	| {
			kind: "active";
			sessionId: string;
			baselineElapsedMs: number;
			observedAtMs: number;
			paused: boolean;
	  }
	| { kind: "error"; message: string };

export type BackendRecordingSession = {
	sessionId: string | null;
	elapsedMs: number;
	paused: boolean;
};

export function reconcileRecordingSession(
	local: RecordingSessionView,
	backend: BackendRecordingSession | null,
	nowMs: number,
): RecordingSessionView {
	if (!backend) return { kind: "hidden" };
	if (!backend.sessionId) {
		return local.kind === "countdown" ? local : { kind: "initializing" };
	}

	if (
		local.kind === "active" &&
		local.sessionId === backend.sessionId &&
		local.paused === backend.paused
	) {
		return local;
	}

	return {
		kind: "active",
		sessionId: backend.sessionId,
		baselineElapsedMs: Math.max(0, backend.elapsedMs),
		observedAtMs: nowMs,
		paused: backend.paused,
	};
}

export function projectElapsedMs(
	view: RecordingSessionView,
	nowMs: number,
): number {
	if (view.kind !== "active") return 0;
	if (view.paused) return view.baselineElapsedMs;
	return Math.max(
		0,
		view.baselineElapsedMs + Math.max(0, nowMs - view.observedAtMs),
	);
}

export function recordingControlsPresentation(input: {
	active: boolean;
	hovered: boolean;
	interacting: boolean;
	countdown: boolean;
	error: boolean;
}): "collapsed" | "expanded" {
	if (
		input.active &&
		!input.hovered &&
		!input.interacting &&
		!input.countdown &&
		!input.error
	) {
		return "collapsed";
	}
	return "expanded";
}

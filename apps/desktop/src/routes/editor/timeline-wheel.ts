export type TimelineWheelIntent =
	| { type: "zoom"; delta: number }
	| { type: "pan"; delta: number }
	| { type: "vertical"; delta: number };

export type TimelineWheelInput = {
	deltaX: number;
	deltaY: number;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	platform: string;
};

export function resolveTimelineWheelIntent(
	input: TimelineWheelInput,
): TimelineWheelIntent {
	if (input.ctrlKey) return { type: "zoom", delta: input.deltaY };
	if (
		(input.platform === "macos" && input.metaKey) ||
		(input.platform === "windows" && input.shiftKey)
	) {
		return { type: "vertical", delta: input.deltaY };
	}

	const horizontalDominates =
		Math.abs(input.deltaX) > Math.abs(input.deltaY) * 0.5;
	return {
		type: "pan",
		delta: horizontalDominates ? input.deltaX : input.deltaY,
	};
}

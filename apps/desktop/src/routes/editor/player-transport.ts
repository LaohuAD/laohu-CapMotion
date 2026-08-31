export const clampSeekTime = (time: number, duration: number) =>
	Number.isFinite(time)
		? Math.min(Math.max(time, 0), Math.max(duration, 0))
		: 0;

export const shouldTogglePlayback = (target: {
	editorControl: boolean;
	button: boolean;
}) => !target.editorControl && !target.button;

export function shouldTogglePlaybackFromElement(
	target: Pick<Element, "closest"> | null,
) {
	return !target?.closest(
		'[data-preview-edit-control], button, input, [role="slider"], [contenteditable="true"]',
	);
}

export function createSeekScheduler(
	seek: (time: number) => void,
	requestFrame: (
		callback: FrameRequestCallback,
	) => number = requestAnimationFrame,
	cancelFrame: (handle: number) => void = (handle) =>
		globalThis.cancelAnimationFrame?.(handle),
) {
	let pending: number | null = null;
	let frame: number | null = null;

	const flush = () => {
		if (frame !== null) cancelFrame(frame);
		frame = null;
		if (pending === null) return;
		const value = pending;
		pending = null;
		seek(value);
	};

	return {
		request(time: number) {
			pending = time;
			if (frame !== null) return;
			frame = requestFrame(() => {
				frame = null;
				flush();
			});
		},
		flush,
		cancel() {
			if (frame !== null) cancelFrame(frame);
			frame = null;
			pending = null;
		},
	};
}

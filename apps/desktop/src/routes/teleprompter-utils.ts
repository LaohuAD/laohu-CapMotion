export function resizeScriptEditor(
	editor: HTMLTextAreaElement,
	viewport: HTMLDivElement | undefined,
) {
	// Measuring at zero height temporarily collapses the scrollable document.
	// Restore its position after the browser has clamped it during measurement.
	const scrollTop = viewport?.scrollTop;
	editor.style.height = "0px";
	editor.style.height = `${editor.scrollHeight}px`;
	if (viewport && scrollTop !== undefined) viewport.scrollTop = scrollTop;
}

export function countWords(text: string) {
	return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

export function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(Math.max(value, minimum), maximum);
}

export function calculatePlaybackSpeed(
	maximumScroll: number,
	wordCount: number,
	wordsPerMinute: number,
) {
	const durationSeconds =
		(Math.max(1, wordCount) / Math.max(1, wordsPerMinute)) * 60;
	return Math.max(0, maximumScroll) / Math.max(1, durationSeconds);
}

export function advancePlaybackPosition(
	position: number,
	maximumScroll: number,
	pixelsPerSecond: number,
	elapsedSeconds: number,
) {
	return Math.min(
		Math.max(0, maximumScroll),
		Math.max(0, position) +
			Math.max(0, pixelsPerSecond) * Math.max(0, elapsedSeconds),
	);
}

export type ManualZoomViewport = {
	left: number;
	top: number;
	width: number;
	height: number;
	amount: number;
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export function manualZoomViewport(
	x: number,
	y: number,
	amount: number,
): ManualZoomViewport {
	const safeAmount = clamp(Number.isFinite(amount) ? amount : 2, 1.1, 8);
	const width = 100 / safeAmount;
	const height = 100 / safeAmount;
	const safeX = clamp(Number.isFinite(x) ? x : 0.5, 0, 1);
	const safeY = clamp(Number.isFinite(y) ? y : 0.5, 0, 1);

	return {
		left: clamp(safeX * 100 - width / 2, 0, 100 - width),
		top: clamp(safeY * 100 - height / 2, 0, 100 - height),
		width,
		height,
		amount: safeAmount,
	};
}

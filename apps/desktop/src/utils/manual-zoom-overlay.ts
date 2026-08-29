export type ManualZoomViewport = {
	left: number;
	top: number;
	width: number;
	height: number;
	amount: number;
};

export type ManualZoomPoint = { x: number; y: number };

export type ManualZoomFollowConfig = {
	safeZoneRatio: number;
	response: number;
};

export const DEFAULT_MANUAL_ZOOM_FOLLOW: ManualZoomFollowConfig = {
	safeZoneRatio: 0.6,
	response: 14,
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const finiteOr = (value: number, fallback: number) =>
	Number.isFinite(value) ? value : fallback;

export function advanceManualZoomFollow(
	center: ManualZoomPoint,
	cursor: ManualZoomPoint,
	amount: number,
	dt: number,
	config: ManualZoomFollowConfig = DEFAULT_MANUAL_ZOOM_FOLLOW,
): ManualZoomPoint {
	const safeAmount = Math.max(1, finiteOr(amount, 2));
	const viewportHalf = 0.5 / safeAmount;
	const safeZoneRatio = clamp(
		finiteOr(config.safeZoneRatio, DEFAULT_MANUAL_ZOOM_FOLLOW.safeZoneRatio),
		0,
		1,
	);
	const response =
		Number.isFinite(config.response) && config.response > 0
			? config.response
			: DEFAULT_MANUAL_ZOOM_FOLLOW.response;
	const safeDt = Math.max(0, finiteOr(dt, 0));
	const alpha = 1 - Math.exp(-response * safeDt);
	const safeHalf = viewportHalf * safeZoneRatio;

	const advanceAxis = (currentValue: number, cursorValue: number) => {
		const minCenter = viewportHalf;
		const maxCenter = 1 - viewportHalf;
		const current = clamp(finiteOr(currentValue, 0.5), minCenter, maxCenter);
		const pointer = clamp(finiteOr(cursorValue, current), 0, 1);
		const target = clamp(
			pointer > current + safeHalf
				? pointer - safeHalf
				: pointer < current - safeHalf
					? pointer + safeHalf
					: current,
			minCenter,
			maxCenter,
		);
		return clamp(current + (target - current) * alpha, minCenter, maxCenter);
	};

	return {
		x: advanceAxis(center.x, cursor.x),
		y: advanceAxis(center.y, cursor.y),
	};
}

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

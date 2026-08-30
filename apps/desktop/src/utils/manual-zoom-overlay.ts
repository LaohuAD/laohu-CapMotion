export type ManualZoomViewport = {
	left: number;
	top: number;
	width: number;
	height: number;
	amount: number;
};

export type ManualZoomPoint = { x: number; y: number };

export type ManualZoomFollowConfig = {
	comfortZoneRatio: number;
	outerGuardRatio: number;
	slowResponse: number;
	fastResponse: number;
	predictionHorizonSecs: number;
	maxLeadRatio: number;
};

export const DEFAULT_MANUAL_ZOOM_FOLLOW: ManualZoomFollowConfig = {
	comfortZoneRatio: 0.35,
	outerGuardRatio: 0.75,
	slowResponse: 18,
	fastResponse: 32,
	predictionHorizonSecs: 0.1,
	maxLeadRatio: 0.2,
};

export type ManualZoomPredictionState = {
	cursor: ManualZoomPoint;
	velocity: ManualZoomPoint;
	sampledAtMs: number;
};

export type ManualZoomPrediction = {
	state: ManualZoomPredictionState;
	framingCursor: ManualZoomPoint;
	speed: number;
};

const VELOCITY_RESPONSE = 24;

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const finiteOr = (value: number, fallback: number) =>
	Number.isFinite(value) ? value : fallback;

export function advanceManualZoomFollow(
	center: ManualZoomPoint,
	actualCursor: ManualZoomPoint,
	framingCursor: ManualZoomPoint,
	cursorSpeed: number,
	amount: number,
	dt: number,
	config: ManualZoomFollowConfig = DEFAULT_MANUAL_ZOOM_FOLLOW,
): ManualZoomPoint {
	const safeAmount = Math.max(1, finiteOr(amount, 2));
	const viewportHalf = 0.5 / safeAmount;
	const comfortZoneRatio = clamp(
		finiteOr(
			config.comfortZoneRatio,
			DEFAULT_MANUAL_ZOOM_FOLLOW.comfortZoneRatio,
		),
		0,
		1,
	);
	const outerGuardRatio = clamp(
		finiteOr(
			config.outerGuardRatio,
			DEFAULT_MANUAL_ZOOM_FOLLOW.outerGuardRatio,
		),
		comfortZoneRatio,
		1,
	);
	const slowResponse = positiveOr(
		config.slowResponse,
		DEFAULT_MANUAL_ZOOM_FOLLOW.slowResponse,
	);
	const fastResponse = Math.max(
		slowResponse,
		positiveOr(
			config.fastResponse,
			DEFAULT_MANUAL_ZOOM_FOLLOW.fastResponse,
		),
	);
	const predictionHorizonSecs = nonNegativeOr(
		config.predictionHorizonSecs,
		DEFAULT_MANUAL_ZOOM_FOLLOW.predictionHorizonSecs,
	);
	const maxLeadRatio = nonNegativeOr(
		config.maxLeadRatio,
		DEFAULT_MANUAL_ZOOM_FOLLOW.maxLeadRatio,
	);
	const safeDt = Math.max(0, finiteOr(dt, 0));
	const safeSpeed = Math.max(0, finiteOr(cursorSpeed, 0));
	const maxLead = Math.max(
		Number.EPSILON,
		viewportHalf * 2 * maxLeadRatio,
	);
	const speedMix = clamp(
		(safeSpeed * predictionHorizonSecs) / maxLead,
		0,
		1,
	);
	const response = slowResponse + (fastResponse - slowResponse) * speedMix;
	const alpha = 1 - Math.exp(-response * safeDt);
	const comfortHalf = viewportHalf * comfortZoneRatio;
	const guardHalf = viewportHalf * outerGuardRatio;

	const advanceAxis = (
		currentValue: number,
		actualCursorValue: number,
		framingCursorValue: number,
	) => {
		const minCenter = viewportHalf;
		const maxCenter = 1 - viewportHalf;
		const current = clamp(finiteOr(currentValue, 0.5), minCenter, maxCenter);
		const actualPointer = clamp(finiteOr(actualCursorValue, current), 0, 1);
		const framingPointer = clamp(
			finiteOr(framingCursorValue, actualPointer),
			0,
			1,
		);
		const target = clamp(
			framingPointer > current + comfortHalf
				? framingPointer - comfortHalf
				: framingPointer < current - comfortHalf
					? framingPointer + comfortHalf
					: current,
			minCenter,
			maxCenter,
		);
		const smoothed = current + (target - current) * alpha;
		const guarded =
			actualPointer > smoothed + guardHalf
				? actualPointer - guardHalf
				: actualPointer < smoothed - guardHalf
					? actualPointer + guardHalf
					: smoothed;
		return clamp(guarded, minCenter, maxCenter);
	};

	return {
		x: advanceAxis(center.x, actualCursor.x, framingCursor.x),
		y: advanceAxis(center.y, actualCursor.y, framingCursor.y),
	};
}

export function predictManualZoomCursor(
	previous: ManualZoomPredictionState | null,
	cursor: ManualZoomPoint,
	sampledAtMs: number,
	amount: number,
	config: ManualZoomFollowConfig = DEFAULT_MANUAL_ZOOM_FOLLOW,
): ManualZoomPrediction {
	const safeCursor = {
		x: clamp(finiteOr(cursor.x, previous?.cursor.x ?? 0.5), 0, 1),
		y: clamp(finiteOr(cursor.y, previous?.cursor.y ?? 0.5), 0, 1),
	};
	const safeSampledAtMs = finiteOr(
		sampledAtMs,
		previous?.sampledAtMs ?? 0,
	);
	let velocity = { x: 0, y: 0 };

	if (previous) {
		const dt = Math.max(0, (safeSampledAtMs - previous.sampledAtMs) / 1000);
		if (dt > 0) {
			const rawVelocity = {
				x: (safeCursor.x - previous.cursor.x) / dt,
				y: (safeCursor.y - previous.cursor.y) / dt,
			};
			const filterAxis = (raw: number, prior: number) => {
				if (raw * prior < 0) return raw;
				const alpha = 1 - Math.exp(-VELOCITY_RESPONSE * dt);
				return prior + (raw - prior) * alpha;
			};
			velocity = {
				x: filterAxis(rawVelocity.x, previous.velocity.x),
				y: filterAxis(rawVelocity.y, previous.velocity.y),
			};
		}
	}

	const safeAmount = Math.max(1, finiteOr(amount, 2));
	const viewportSize = 1 / safeAmount;
	const horizon = nonNegativeOr(
		config.predictionHorizonSecs,
		DEFAULT_MANUAL_ZOOM_FOLLOW.predictionHorizonSecs,
	);
	const maxLead =
		viewportSize *
		nonNegativeOr(
			config.maxLeadRatio,
			DEFAULT_MANUAL_ZOOM_FOLLOW.maxLeadRatio,
		);
	const framingCursor = {
		x: clamp(
			safeCursor.x + clamp(velocity.x * horizon, -maxLead, maxLead),
			0,
			1,
		),
		y: clamp(
			safeCursor.y + clamp(velocity.y * horizon, -maxLead, maxLead),
			0,
			1,
		),
	};

	return {
		state: { cursor: safeCursor, velocity, sampledAtMs: safeSampledAtMs },
		framingCursor,
		speed: Math.hypot(velocity.x, velocity.y),
	};
}

function positiveOr(value: number, fallback: number) {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeOr(value: number, fallback: number) {
	return Number.isFinite(value) && value >= 0 ? value : fallback;
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

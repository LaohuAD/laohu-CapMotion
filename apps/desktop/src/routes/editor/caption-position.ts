export const CAPTION_POSITION_COORDINATE_SIZE = { x: 1920, y: 1080 } as const;

export type NormalizedCaptionPosition = { x: number; y: number };
export type CaptionTrackPositionSetting = {
	trackId: string;
	position: string;
	manualPosition: NormalizedCaptionPosition | null;
};

export const captionTrackId = (trackId: string | null | undefined) =>
	trackId ?? "default";

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export function normalizedToCenteredPixels(
	position: NormalizedCaptionPosition,
) {
	return {
		x: Math.round((position.x - 0.5) * CAPTION_POSITION_COORDINATE_SIZE.x),
		y: Math.round((position.y - 0.5) * CAPTION_POSITION_COORDINATE_SIZE.y),
	};
}

export function centeredPixelsToNormalized(
	position: NormalizedCaptionPosition,
) {
	return {
		x: clamp01(0.5 + position.x / CAPTION_POSITION_COORDINATE_SIZE.x),
		y: clamp01(0.5 + position.y / CAPTION_POSITION_COORDINATE_SIZE.y),
	};
}

export function getCaptionTrackPosition(
	positions: CaptionTrackPositionSetting[] | null | undefined,
	trackId: string,
) {
	return positions?.find((entry) => entry.trackId === trackId) ?? null;
}

export function setCaptionTrackPosition(
	positions: CaptionTrackPositionSetting[] | null | undefined,
	trackId: string,
	value: Omit<CaptionTrackPositionSetting, "trackId">,
) {
	const next = [...(positions ?? [])];
	const index = next.findIndex((entry) => entry.trackId === trackId);
	const entry = { trackId, ...value };
	if (index < 0) next.push(entry);
	else next[index] = entry;
	return next;
}

export function pruneCaptionTrackPositions(
	positions: CaptionTrackPositionSetting[] | null | undefined,
	activeTrackIds: ReadonlySet<string>,
) {
	return (positions ?? []).filter(({ trackId }) => activeTrackIds.has(trackId));
}

export function resolveCaptionTrackPosition(
	positions: CaptionTrackPositionSetting[] | null | undefined,
	trackId: string,
	fallback: Omit<CaptionTrackPositionSetting, "trackId">,
) {
	return getCaptionTrackPosition(positions, trackId) ?? fallback;
}

/** Track-level styles win; old materialized files remain readable. */
export function resolveCaptionTrackFontSize(
	styles: { trackId: string; fontSize: number }[] | null | undefined,
	trackId: string,
	segments: { trackId?: string | null; fontSizeOverride?: number | null }[],
	fallback: number,
) {
	return (
		styles?.find((s) => s.trackId === trackId)?.fontSize ??
		segments.find(
			(s) =>
				captionTrackId(s.trackId) === trackId && s.fontSizeOverride != null,
		)?.fontSizeOverride ??
		fallback
	);
}
export function setCaptionTrackFontSize(
	styles: { trackId: string; fontSize: number }[] | null | undefined,
	trackId: string,
	fontSize: number,
) {
	return [
		...(styles ?? []).filter((s) => s.trackId !== trackId),
		{ trackId, fontSize },
	];
}

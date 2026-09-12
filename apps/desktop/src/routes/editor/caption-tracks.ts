import type { CaptionTrackSegment } from "~/utils/tauri";

export type CaptionTrackGroup = {
	id: string;
	label: string;
	entries: Array<{ index: number; segment: CaptionTrackSegment }>;
};

const trackId = (segment: CaptionTrackSegment) => segment.trackId ?? "default";

const trackLabel = (segment: CaptionTrackSegment, id: string) => {
	if (segment.trackLabel) return segment.trackLabel;
	if (id === "zh-CN") return "中文字幕";
	if (id === "en") return "English Captions";
	return "Captions";
};

export const captionTrackPositionLabel = (id: string, label: string) => {
	if (id === "zh-CN") return "Chinese Position";
	if (id === "en") return "English Position";
	return `${label} Position`;
};

export function groupCaptionSegmentsByTrack(
	segments: CaptionTrackSegment[],
): CaptionTrackGroup[] {
	const groups = new Map<string, CaptionTrackGroup>();
	segments.forEach((segment, index) => {
		const id = trackId(segment);
		let group = groups.get(id);
		if (!group) {
			group = { id, label: trackLabel(segment, id), entries: [] };
			groups.set(id, group);
		}
		group.entries.push({ index, segment });
	});
	return [...groups.values()];
}

export const shouldMirrorCaptionEditToSource = (
	displayMode: "autoProject" | "materialized" | undefined,
) => displayMode !== "materialized";

export function visibleCaptionEntries(
	entries: CaptionTrackGroup["entries"],
	start: number,
	end: number,
	draggedIndex?: number,
): CaptionTrackGroup["entries"] {
	return entries.filter(
		({ index, segment }) =>
			index === draggedIndex || (segment.end >= start && segment.start <= end),
	);
}

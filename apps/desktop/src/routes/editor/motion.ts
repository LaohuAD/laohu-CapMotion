import type { JsonValue } from "~/utils/tauri";

export type MotionRenderer = "remotion";
export type MotionDurationPolicy = "responsive" | "retime" | "trim";
export type MotionOverlayRole =
	| "animation"
	| "avatar"
	| "aiVideo"
	| "screenRecording"
	| "evidence";
export type MotionDefinitionStatus =
	| "draft"
	| "approved"
	| "published"
	| "deprecated";
export type MotionArtifactQuality = "preview" | "final";
export type MotionArtifactStatus = "ready" | "rendering" | "stale" | "failed";

export type MotionTransform = {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
};

export type MotionDefinition = {
	id: string;
	version: number;
	renderer: MotionRenderer;
	source: string;
	compositionId: string;
	status: MotionDefinitionStatus;
	minDuration: number;
	defaultDuration: number;
	maxDuration: number;
	defaultPolicy: MotionDurationPolicy;
	introDuration: number;
	outroDuration: number;
	defaultProps: Record<string, JsonValue>;
};

export type MotionSegment = {
	id: string;
	definitionId: string;
	definitionVersion: number;
	start: number;
	end: number;
	track: number;
	zIndex: number;
	role: MotionOverlayRole;
	transform: MotionTransform;
	opacity: number;
	durationPolicy: MotionDurationPolicy;
	props: Record<string, JsonValue>;
	artifactId: string | null;
};

export type MotionArtifact = {
	id: string;
	segmentId: string;
	contentHash: string;
	quality: MotionArtifactQuality;
	status: MotionArtifactStatus;
	path: string;
	width: number;
	height: number;
	fps: number;
	hasAlpha: boolean;
	duration: number;
	error: string | null;
};

export type MotionConfiguration = {
	definitions: MotionDefinition[];
	segments: MotionSegment[];
	artifacts: MotionArtifact[];
};

export type MotionProjectFields = {
	projectRevision: number;
	motion: MotionConfiguration;
};

export function normalizeMotionFields(value: unknown): MotionProjectFields {
	const project = (value ?? {}) as Partial<MotionProjectFields>;
	return {
		projectRevision: project.projectRevision ?? 0,
		motion: {
			definitions: project.motion?.definitions ?? [],
			segments: (project.motion?.segments ?? []).map((segment) => ({
				...segment,
				role: segment.role ?? "animation",
			})),
			artifacts: project.motion?.artifacts ?? [],
		},
	};
}

function motionRole(segment: MotionSegment): MotionOverlayRole {
	return segment.role ?? "animation";
}

export function motionSegmentsOverlap(
	first: Pick<MotionSegment, "start" | "end" | "role">,
	second: Pick<MotionSegment, "start" | "end" | "role">,
) {
	return (
		motionRole(first as MotionSegment) ===
			motionRole(second as MotionSegment) &&
		first.start < second.end &&
		second.start < first.end
	);
}

export function moveMotionSegment(
	segment: MotionSegment,
	requestedStart: number,
	totalDuration: number,
	track = segment.track,
	segments: MotionSegment[] = [],
): MotionSegment {
	const duration = segment.end - segment.start;
	let start = Math.min(
		Math.max(0, requestedStart),
		Math.max(0, totalDuration - duration),
	);
	const peers = segments.filter(
		(candidate) =>
			candidate.id !== segment.id &&
			motionRole(candidate) === motionRole(segment),
	);

	for (let attempt = 0; attempt <= peers.length; attempt++) {
		const moved = { ...segment, start, end: start + duration, track };
		const conflict = peers.find((candidate) =>
			motionSegmentsOverlap(moved, candidate),
		);
		if (!conflict) return moved;

		if (segment.end <= conflict.start) {
			start = conflict.start - duration;
		} else if (segment.start >= conflict.end) {
			start = conflict.end;
		} else {
			const leftEdge = conflict.start - duration;
			const rightEdge = conflict.end;
			start =
				Math.abs(start - leftEdge) <= Math.abs(start - rightEdge)
					? leftEdge
					: rightEdge;
		}
		if (start < 0 || start + duration > totalDuration) {
			return { ...segment, track };
		}
	}

	return { ...segment, track };
}

export function resizeMotionSegment(
	segment: MotionSegment,
	requestedDuration: number,
	definition?: MotionDefinition,
	segments: MotionSegment[] = [],
): MotionSegment {
	let duration = Math.max(Number.EPSILON, requestedDuration);
	if (segment.durationPolicy === "responsive" && definition) {
		duration = Math.min(
			Math.max(definition.minDuration, duration),
			definition.maxDuration,
		);
	}
	let end = segment.start + duration;
	const nearestConflict = segments
		.filter(
			(candidate) =>
				candidate.id !== segment.id &&
				motionRole(candidate) === motionRole(segment) &&
				candidate.start >= segment.start &&
				candidate.start < end,
		)
		.sort((a, b) => a.start - b.start)[0];
	if (nearestConflict) end = nearestConflict.start;
	if (definition && end - segment.start < definition.minDuration)
		return segment;
	return { ...segment, end };
}

export function resizeMotionSegmentStart(
	segment: MotionSegment,
	requestedStart: number,
	definition?: MotionDefinition,
	segments: MotionSegment[] = [],
): MotionSegment {
	const minimum = definition?.minDuration ?? Number.EPSILON;
	const maximum = definition?.maxDuration ?? Number.POSITIVE_INFINITY;
	let start = Math.min(
		segment.end - minimum,
		Math.max(0, segment.end - maximum, requestedStart),
	);
	const previousBoundary = segments
		.filter(
			(candidate) =>
				candidate.id !== segment.id &&
				motionRole(candidate) === motionRole(segment) &&
				candidate.start < segment.start &&
				candidate.end > start,
		)
		.reduce((boundary, candidate) => Math.max(boundary, candidate.end), start);
	start = previousBoundary;
	if (segment.end - start < minimum) return segment;
	return { ...segment, start };
}

export function staleLinkedArtifact(
	motion: MotionConfiguration,
	segment: MotionSegment,
) {
	if (!segment.artifactId) return;
	const artifact = motion.artifacts.find(
		(candidate) => candidate.id === segment.artifactId,
	);
	if (artifact) artifact.status = "stale";
}

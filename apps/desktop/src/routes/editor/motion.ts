import type { JsonValue } from "~/utils/tauri";

export type MotionRenderer = "remotion";
export type MotionDurationPolicy = "responsive" | "retime" | "trim";
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
			segments: project.motion?.segments ?? [],
			artifacts: project.motion?.artifacts ?? [],
		},
	};
}

export function moveMotionSegment(
	segment: MotionSegment,
	requestedStart: number,
	totalDuration: number,
	track = segment.track,
): MotionSegment {
	const duration = segment.end - segment.start;
	const start = Math.min(
		Math.max(0, requestedStart),
		Math.max(0, totalDuration - duration),
	);
	return { ...segment, start, end: start + duration, track };
}

export function resizeMotionSegment(
	segment: MotionSegment,
	requestedDuration: number,
	definition?: MotionDefinition,
): MotionSegment {
	let duration = Math.max(Number.EPSILON, requestedDuration);
	if (segment.durationPolicy === "responsive" && definition) {
		duration = Math.min(
			Math.max(definition.minDuration, duration),
			definition.maxDuration,
		);
	}
	return { ...segment, end: segment.start + duration };
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

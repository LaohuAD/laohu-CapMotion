import type { MotionArtifact, MotionSegment, MotionTransform } from "./motion";

export type MotionCanvasSize = { width: number; height: number };
export type MotionCanvasPoint = { x: number; y: number };
export type MotionCanvasRect = MotionCanvasPoint & {
	width: number;
	height: number;
	rotation: number;
};

export function motionOutputRect(
	segment: MotionSegment,
	output: MotionCanvasSize,
): MotionCanvasRect {
	const width = output.width * segment.transform.scaleX;
	const height = output.height * segment.transform.scaleY;
	return {
		x: output.width * 0.5 + segment.transform.x - width * 0.5,
		y: output.height * 0.5 + segment.transform.y - height * 0.5,
		width,
		height,
		rotation: segment.transform.rotation,
	};
}

export function motionPreviewRect(
	segment: MotionSegment,
	output: MotionCanvasSize,
	preview: MotionCanvasSize,
): MotionCanvasRect {
	const rect = motionOutputRect(segment, output);
	const scaleX = preview.width / Math.max(output.width, 1);
	const scaleY = preview.height / Math.max(output.height, 1);
	return {
		x: rect.x * scaleX,
		y: rect.y * scaleY,
		width: rect.width * scaleX,
		height: rect.height * scaleY,
		rotation: rect.rotation,
	};
}

export function moveMotionTransform(
	initial: MotionTransform,
	delta: MotionCanvasPoint,
	output: MotionCanvasSize,
	preview: MotionCanvasSize,
): MotionTransform {
	return {
		...initial,
		x: initial.x + (delta.x * output.width) / Math.max(preview.width, 1),
		y: initial.y + (delta.y * output.height) / Math.max(preview.height, 1),
	};
}

export function resizeMotionTransform(
	initial: MotionTransform,
	factor: number,
): MotionTransform {
	const scale = Math.min(3, Math.max(0.1, initial.scaleX * factor));
	return { ...initial, scaleX: scale, scaleY: scale };
}

export function usableMotionArtifact(
	segment: MotionSegment,
	artifacts: MotionArtifact[],
) {
	if (!segment.artifactId) return null;
	const artifact = artifacts.find(
		(candidate) => candidate.id === segment.artifactId,
	);
	return artifact &&
		(artifact.status === "ready" || artifact.status === "stale")
		? artifact
		: null;
}

export function topmostActiveMotionIndex(
	segments: MotionSegment[],
	artifacts: MotionArtifact[],
	time: number,
) {
	return (
		segments
			.map((segment, index) => ({ segment, index }))
			.filter(
				({ segment }) =>
					time >= segment.start &&
					time < segment.end &&
					usableMotionArtifact(segment, artifacts),
			)
			.sort(
				(a, b) =>
					a.segment.zIndex - b.segment.zIndex ||
					a.segment.track - b.segment.track ||
					a.index - b.index,
			)
			.at(-1)?.index ?? null
	);
}

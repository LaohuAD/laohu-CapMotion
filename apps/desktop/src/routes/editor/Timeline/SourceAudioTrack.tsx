import { cx } from "cva";
import { createMemo, For } from "solid-js";

import { useI18n } from "~/i18n";
import { clipTimelineOffsets } from "../clip-transitions";
import { useEditorContext } from "../context";
import {
	deriveSourceAudioSpans,
	type SourceAudioTrackKind,
} from "../source-audio";
import { effectiveToOutput, holdWindows } from "../timeline-holds";
import { WaveformCanvas } from "./ClipTrack";
import { SegmentLabel, SegmentRoot, TrackRoot } from "./Track";

export function SourceAudioTrack(props: {
	kind: SourceAudioTrackKind;
	handleUpdatePlayhead: (event: MouseEvent) => void;
}) {
	const { text } = useI18n();
	const {
		project,
		editorState,
		setEditorState,
		micWaveforms,
		systemAudioWaveforms,
	} = useEditorContext();
	const track = () =>
		props.kind === "microphone"
			? project.audio.microphoneTrack
			: project.audio.systemAudioTrack;
	const label = () =>
		props.kind === "microphone" ? "Microphone" : "System Audio";
	const color = () => `var(--track-${props.kind})`;
	const holds = createMemo(() => holdWindows(project.timeline?.textSegments));
	const spans = createMemo(() => {
		const timeline = project.timeline;
		if (!timeline) return [];
		const offsets = clipTimelineOffsets(
			timeline.segments,
			timeline.transitions ?? [],
		);
		return deriveSourceAudioSpans(
			timeline.segments.map((segment, index) => ({
				...segment,
				outputStart: offsets[index],
			})),
			track(),
		);
	});
	const selectedIndices = createMemo(() => {
		const selection = editorState.timeline.selection;
		return selection?.type === props.kind
			? new Set(selection.indices)
			: new Set<number>();
	});

	function selectSpan(index: number, event: MouseEvent) {
		const selection = editorState.timeline.selection;
		const isMac = navigator.platform.toUpperCase().includes("MAC");
		const isMultiSelect = isMac ? event.metaKey : event.ctrlKey;

		if (event.shiftKey && selection?.type === props.kind) {
			const lastIndex = selection.indices.at(-1) ?? index;
			const start = Math.min(lastIndex, index);
			const end = Math.max(lastIndex, index);
			setEditorState("timeline", "selection", {
				type: props.kind,
				indices: Array.from(
					{ length: end - start + 1 },
					(_, offset) => start + offset,
				),
			});
		} else if (isMultiSelect && selection?.type === props.kind) {
			const indices = selection.indices.includes(index)
				? selection.indices.filter((candidate) => candidate !== index)
				: [...selection.indices, index];
			setEditorState(
				"timeline",
				"selection",
				indices.length > 0 ? { type: props.kind, indices } : null,
			);
		} else {
			setEditorState("timeline", "selection", {
				type: props.kind,
				indices: [index],
			});
		}

		props.handleUpdatePlayhead(event);
	}

	return (
		<TrackRoot
			onMouseEnter={() =>
				setEditorState("timeline", "hoveredTrack", props.kind)
			}
			onMouseLeave={() => setEditorState("timeline", "hoveredTrack", null)}
		>
			<For each={spans()}>
				{(span, index) => {
					const displaySegment = createMemo(() => ({
						start: effectiveToOutput(holds(), span.outputStart),
						end: effectiveToOutput(holds(), span.outputEnd),
					}));
					const segmentHolds = createMemo(() =>
						holds()
							.map(([start, end]): [number, number] => [
								Math.max(start, displaySegment().start),
								Math.min(end, displaySegment().end),
							])
							.filter(([start, end]) => end > start),
					);
					const waveform = () =>
						props.kind === "microphone"
							? micWaveforms()?.[span.recordingClip]
							: systemAudioWaveforms()?.[span.recordingClip];

					return (
						<SegmentRoot
							segColor={color()}
							innerClass="ring-blue-9"
							class={cx(
								"border transition-colors duration-150",
								selectedIndices().has(index())
									? "border-gray-12"
									: "border-transparent",
							)}
							segment={displaySegment()}
							title={text(label())}
							onMouseDown={(event) => {
								event.stopPropagation();
								if (event.button === 0) selectSpan(index(), event);
							}}
						>
							<WaveformCanvas
								micWaveform={
									props.kind === "microphone" ? waveform() : undefined
								}
								systemWaveform={
									props.kind === "systemAudio" ? waveform() : undefined
								}
								segment={{
									start: span.sourceStart,
									end: span.sourceEnd,
									timescale: span.timescale,
								}}
								segmentOffset={displaySegment().start}
								holds={segmentHolds()}
							/>
							<SegmentLabel
								full={() => (
									<span class="truncate text-[0.6875rem] font-medium text-white/85">
										{text(label())}
									</span>
								)}
							/>
						</SegmentRoot>
					);
				}}
			</For>
		</TrackRoot>
	);
}

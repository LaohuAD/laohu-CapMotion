import { createEventListenerMap } from "@solid-primitives/event-listener";
import { cx } from "cva";
import { createMemo, createRoot, For } from "solid-js";
import { produce } from "solid-js/store";
import { useEditorContext } from "../context";
import {
	type MotionDefinition,
	type MotionSegment,
	moveMotionSegment,
	staleLinkedArtifact,
} from "../motion";
import { useTimelineContext } from "./context";
import {
	SegmentContent,
	SegmentHandle,
	SegmentLabel,
	SegmentRoot,
	TrackRoot,
} from "./Track";

export type MotionSegmentDragState =
	| { type: "idle" }
	| { type: "movePending" }
	| { type: "moving" };

export function MotionTrack(props: {
	laneIndex: number;
	onDragStateChanged: (value: MotionSegmentDragState) => void;
	handleUpdatePlayhead: (event: MouseEvent) => void;
}) {
	const {
		project,
		setProject,
		editorState,
		setEditorState,
		totalDuration,
		projectHistory,
	} = useEditorContext();
	const { secsPerPixel } = useTimelineContext();

	const laneSegments = createMemo(() =>
		project.motion.segments
			.map((segment, index) => ({ segment, index }))
			.filter(({ segment }) => segment.track === props.laneIndex),
	);
	const selectedIndices = createMemo(() => {
		const selection = editorState.timeline.selection;
		return selection?.type === "motion" ? new Set(selection.indices) : null;
	});

	const definitionFor = (segment: MotionSegment) =>
		project.motion.definitions.find(
			(definition) =>
				definition.id === segment.definitionId &&
				definition.version === segment.definitionVersion,
		);

	const setSegment = (
		index: number,
		update: (segment: MotionSegment, definition?: MotionDefinition) => void,
		staleArtifact: boolean,
	) => {
		setProject(
			produce((project) => {
				const segment = project.motion.segments[index];
				if (!segment) return;
				const definition = project.motion.definitions.find(
					(candidate) =>
						candidate.id === segment.definitionId &&
						candidate.version === segment.definitionVersion,
				);
				update(segment, definition);
				if (staleArtifact) staleLinkedArtifact(project.motion, segment);
			}),
		);
	};

	function createMouseDownDrag<T>(
		segmentIndex: number,
		setup: () => T,
		update: (event: MouseEvent, value: T, initialMouseX: number) => void,
	) {
		return (downEvent: MouseEvent) => {
			if (editorState.timeline.interactMode !== "seek") return;
			downEvent.stopPropagation();
			const initial = setup();
			let moved = false;
			let initialMouseX: number | null = null;
			const resumeHistory = projectHistory.pause();
			props.onDragStateChanged({ type: "movePending" });

			const finish = (event: MouseEvent) => {
				resumeHistory();
				if (!moved) {
					const multi = event.metaKey || event.ctrlKey;
					const selection = editorState.timeline.selection;
					const current = selection?.type === "motion" ? selection.indices : [];
					const indices = multi
						? current.includes(segmentIndex)
							? current.filter((index) => index !== segmentIndex)
							: [...current, segmentIndex]
						: [segmentIndex];
					setEditorState(
						"timeline",
						"selection",
						indices.length > 0 ? { type: "motion", indices } : null,
					);
					props.handleUpdatePlayhead(event);
				}
				props.onDragStateChanged({ type: "idle" });
			};

			const handleUpdate = (event: MouseEvent) => {
				if (Math.abs(event.clientX - downEvent.clientX) > 2 && !moved) {
					moved = true;
					initialMouseX = event.clientX;
					props.onDragStateChanged({ type: "moving" });
				}
				if (initialMouseX !== null) update(event, initial, initialMouseX);
			};

			createRoot((dispose) => {
				createEventListenerMap(window, {
					mousemove: handleUpdate,
					mouseup: (event) => {
						handleUpdate(event);
						finish(event);
						dispose();
					},
				});
			});
		};
	}

	return (
		<TrackRoot
			onMouseEnter={() => setEditorState("timeline", "hoveredTrack", "motion")}
			onMouseLeave={() => setEditorState("timeline", "hoveredTrack", null)}
		>
			<For
				each={laneSegments()}
				fallback={
					<div class="flex absolute inset-0 justify-center items-center text-xs rounded-xl pointer-events-none bg-gray-3/20 text-gray-9">
						Animations added by Codex appear here
					</div>
				}
			>
				{(item) => {
					const segment = () => item.segment;
					const definition = () => definitionFor(segment());
					const selected = () => selectedIndices()?.has(item.index) ?? false;
					const label = () =>
						definition()?.compositionId || segment().definitionId;

					return (
						<SegmentRoot
							data-motion-segment
							data-id={segment().id}
							segColor="var(--track-motion)"
							class={cx(
								"border group transition-colors duration-150",
								selected() ? "border-fuchsia-7" : "border-transparent",
							)}
							innerClass="ring-fuchsia-6"
							title={`${label()} · ${segment().durationPolicy}`}
							segment={{ start: segment().start, end: segment().end }}
							onMouseDown={(event) => event.stopPropagation()}
						>
							<SegmentHandle
								position="start"
								onMouseDown={createMouseDownDrag(
									item.index,
									() => ({
										start: segment().start,
										end: segment().end,
										definition: definition(),
									}),
									(event, value, initialMouseX) => {
										const delta =
											(event.clientX - initialMouseX) * secsPerPixel();
										const minimum = value.definition?.minDuration ?? 0.1;
										const maximum = value.definition?.maxDuration ?? value.end;
										const next = Math.min(
											value.end - minimum,
											Math.max(0, value.end - maximum, value.start + delta),
										);
										setSegment(
											item.index,
											(segment) => {
												segment.start = next;
											},
											true,
										);
									},
								)}
							/>
							<SegmentContent
								class="flex justify-center items-center px-2 overflow-hidden cursor-grab"
								onMouseDown={createMouseDownDrag(
									item.index,
									() => ({ ...segment() }),
									(event, original, initialMouseX) => {
										const delta =
											(event.clientX - initialMouseX) * secsPerPixel();
										const moved = moveMotionSegment(
											original,
											original.start + delta,
											totalDuration(),
											props.laneIndex,
										);
										setSegment(
											item.index,
											(segment) => {
												segment.start = moved.start;
												segment.end = moved.end;
												segment.track = moved.track;
											},
											false,
										);
									},
								)}
							>
								<SegmentLabel
									full={() => (
										<span class="text-[10px] font-medium text-white truncate">
											{label()}
										</span>
									)}
									compact={() => <span class="text-[10px] text-white">✦</span>}
									glyph={() => <span class="text-[10px] text-white">✦</span>}
								/>
							</SegmentContent>
							<SegmentHandle
								position="end"
								onMouseDown={createMouseDownDrag(
									item.index,
									() => ({
										start: segment().start,
										end: segment().end,
										definition: definition(),
									}),
									(event, value, initialMouseX) => {
										const delta =
											(event.clientX - initialMouseX) * secsPerPixel();
										const minimum = value.definition?.minDuration ?? 0.1;
										const maximum =
											value.definition?.maxDuration ?? totalDuration();
										const next = Math.max(
											value.start + minimum,
											Math.min(
												value.start + maximum,
												totalDuration(),
												value.end + delta,
											),
										);
										setSegment(
											item.index,
											(segment) => {
												segment.end = next;
											},
											true,
										);
									},
								)}
							/>
						</SegmentRoot>
					);
				}}
			</For>
		</TrackRoot>
	);
}

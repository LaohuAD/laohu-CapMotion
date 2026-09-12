import { createEventListenerMap } from "@solid-primitives/event-listener";
import { cx } from "cva";
import { createMemo, createRoot, createSignal, For, Show } from "solid-js";
import { useI18n } from "~/i18n";

import {
	groupCaptionSegmentsByTrack,
	visibleCaptionEntries,
} from "../caption-tracks";
import { useEditorContext } from "../context";
import { useTimelineContext } from "./context";
import {
	SegmentContent,
	SegmentHandle,
	SegmentLabel,
	SegmentRoot,
	TrackRoot,
} from "./Track";

export type CaptionSegmentDragState =
	| { type: "idle" }
	| { type: "movePending" }
	| { type: "moving" };

const MIN_SEGMENT_SECS = 0.5;
const MIN_SEGMENT_PIXELS = 40;

export function CaptionsTrack(props: {
	trackId: string;
	onDragStateChanged: (v: CaptionSegmentDragState) => void;
	handleUpdatePlayhead: (e: MouseEvent) => void;
	onGenerate: () => void | Promise<void>;
	isGenerating: boolean;
}) {
	const { text } = useI18n();
	const {
		project,
		setProject,
		editorState,
		setEditorState,
		totalDuration,
		projectHistory,
		projectActions,
	} = useEditorContext();
	const { secsPerPixel, visibleTimeRange } = useTimelineContext();
	const [draggedIndex, setDraggedIndex] = createSignal<number>();

	const minDuration = () =>
		Math.max(MIN_SEGMENT_SECS, secsPerPixel() * MIN_SEGMENT_PIXELS);

	const captionEntries = createMemo(
		() =>
			groupCaptionSegmentsByTrack(project.timeline?.captionSegments ?? [])
				.find((group) => group.id === props.trackId)
				?.entries.filter(({ segment }) => segment.start < totalDuration()) ??
			[],
	);
	const selectedCaptionIndices = createMemo(() => {
		const selection = editorState.timeline.selection;
		if (!selection || selection.type !== "caption") return null;
		return new Set(selection.indices);
	});

	const visibleEntries = createMemo(() => {
		const range = visibleTimeRange();
		return visibleCaptionEntries(
			captionEntries(),
			range.start,
			range.end,
			draggedIndex(),
		);
	});

	const neighborBounds = (index: number) => {
		const entries = captionEntries();
		const localIndex = entries.findIndex((entry) => entry.index === index);
		return {
			prevEnd: entries[localIndex - 1]?.segment.end ?? 0,
			nextStart: entries[localIndex + 1]?.segment.start ?? totalDuration(),
		};
	};

	function createMouseDownDrag<T>(
		segmentIndex: () => number,
		setup: () => T,
		update: (e: MouseEvent, value: T, initialMouseX: number) => void,
	) {
		return (downEvent: MouseEvent) => {
			if (editorState.timeline.interactMode !== "seek") return;
			downEvent.stopPropagation();
			const initial = setup();
			setDraggedIndex(segmentIndex());
			let moved = false;
			let initialMouseX: number | null = null;

			const resumeHistory = projectHistory.pause();
			props.onDragStateChanged({ type: "movePending" });

			function finish(e: MouseEvent) {
				resumeHistory();
				if (!moved) {
					e.stopPropagation();
					const index = segmentIndex();
					const isMultiSelect = e.ctrlKey || e.metaKey;

					if (isMultiSelect) {
						const currentSelection = editorState.timeline.selection;
						if (currentSelection?.type === "caption") {
							const base = currentSelection.indices;
							const exists = base.includes(index);
							const next = exists
								? base.filter((i) => i !== index)
								: [...base, index];
							setEditorState(
								"timeline",
								"selection",
								next.length > 0 ? { type: "caption", indices: next } : null,
							);
						} else {
							setEditorState("timeline", "selection", {
								type: "caption",
								indices: [index],
							});
						}
					} else {
						setEditorState("timeline", "selection", {
							type: "caption",
							indices: [index],
						});
					}
					props.handleUpdatePlayhead(e);
				}
				props.onDragStateChanged({ type: "idle" });
				setDraggedIndex(undefined);
			}

			function handleUpdate(event: MouseEvent) {
				if (Math.abs(event.clientX - downEvent.clientX) > 2) {
					if (!moved) {
						moved = true;
						initialMouseX = event.clientX;
						props.onDragStateChanged({ type: "moving" });
					}
				}
				if (initialMouseX === null) return;
				update(event, initial, initialMouseX);
			}

			createRoot((dispose) => {
				createEventListenerMap(window, {
					mousemove: (e) => handleUpdate(e),
					mouseup: (e) => {
						handleUpdate(e);
						finish(e);
						dispose();
					},
				});
			});
		};
	}

	return (
		<TrackRoot
			onMouseEnter={() => setEditorState("timeline", "hoveredTrack", "caption")}
			onMouseLeave={() => setEditorState("timeline", "hoveredTrack", null)}
		>
			<For
				each={visibleEntries()}
				fallback={
					<Show when={captionEntries().length === 0}>
						<div class="text-center text-sm text-(--text-tertiary) flex flex-col gap-2 justify-center items-center inset-0 w-full bg-gray-3/20 dark:bg-gray-3/10 rounded-xl">
							<div>{text("No captions")}</div>
							<button
								class="h-8 px-3 rounded-lg border border-green-7/50 bg-green-6/15 text-green-11 text-xs font-medium transition-colors hover:bg-green-6/25 disabled:opacity-50 disabled:cursor-not-allowed"
								disabled={props.isGenerating}
								onMouseDown={(e) => e.stopPropagation()}
								onClick={(e) => {
									e.stopPropagation();
									void props.onGenerate();
								}}
							>
								{props.isGenerating
									? text("Generating...")
									: text("Generate captions")}
							</button>
						</div>
					</Show>
				}
			>
				{(entry) => {
					const segment = entry.segment;
					const segmentIndex = () => entry.index;
					const isSelected = createMemo(() => {
						const indices = selectedCaptionIndices();
						if (!indices) return false;
						return indices.has(segmentIndex());
					});

					const segmentWidth = () =>
						Math.min(segment.end, totalDuration()) - segment.start;

					// Truncation degrades gracefully, so the same row serves both the
					// full and compact tiers; it just clips against a smaller box.
					const captionLabel = () => (
						<div class="flex gap-1 justify-center items-center text-[10px] text-gray-1 dark:text-gray-12">
							<span class="truncate max-w-full opacity-80">
								{segment.text || "Caption"}
							</span>
						</div>
					);

					return (
						<SegmentRoot
							data-caption-segment
							data-index={segmentIndex()}
							segColor="var(--track-caption)"
							class={cx(
								"border duration-200 transition-colors group",
								isSelected() ? "border-green-7" : "border-transparent",
							)}
							innerClass="ring-green-6"
							title={segment.text || "Caption"}
							segment={{
								start: segment.start,
								end: Math.min(segment.end, totalDuration()),
							}}
							onMouseDown={(e) => {
								e.stopPropagation();
								if (editorState.timeline.interactMode === "split") {
									const rect = e.currentTarget.getBoundingClientRect();
									const fraction = (e.clientX - rect.left) / rect.width;
									const splitTime = fraction * segmentWidth();
									projectActions.splitCaptionSegment(segmentIndex(), splitTime);
								}
							}}
						>
							<SegmentHandle
								position="start"
								onMouseDown={createMouseDownDrag(
									segmentIndex,
									() => {
										const bounds = neighborBounds(segmentIndex());
										const start = segment.start;
										const minValue = bounds.prevEnd;
										const maxValue = Math.max(
											minValue,
											Math.min(
												segment.end - minDuration(),
												bounds.nextStart - minDuration(),
											),
										);
										return { start, minValue, maxValue };
									},
									(e, value, initialMouseX) => {
										const delta = (e.clientX - initialMouseX) * secsPerPixel();
										const next = Math.max(
											value.minValue,
											Math.min(value.maxValue, value.start + delta),
										);
										setProject(
											"timeline",
											"captionSegments",
											segmentIndex(),
											"start",
											next,
										);
									},
								)}
							/>
							<SegmentContent
								class="flex justify-center items-center cursor-grab px-2 overflow-hidden"
								onMouseDown={createMouseDownDrag(
									segmentIndex,
									() => {
										const original = { ...segment };
										const bounds = neighborBounds(segmentIndex());
										const minDelta = bounds.prevEnd - original.start;
										const maxDelta = bounds.nextStart - original.end;
										return { original, minDelta, maxDelta };
									},
									(e, value, initialMouseX) => {
										const delta = (e.clientX - initialMouseX) * secsPerPixel();
										const lowerBound = Math.min(value.minDelta, value.maxDelta);
										const upperBound = Math.max(value.minDelta, value.maxDelta);
										const clampedDelta = Math.min(
											upperBound,
											Math.max(lowerBound, delta),
										);
										setProject("timeline", "captionSegments", segmentIndex(), {
											...value.original,
											start: value.original.start + clampedDelta,
											end: value.original.end + clampedDelta,
										});
									},
								)}
							>
								<SegmentLabel
									compactAt={24}
									full={captionLabel}
									compact={captionLabel}
								/>
							</SegmentContent>
							<SegmentHandle
								position="end"
								onMouseDown={createMouseDownDrag(
									segmentIndex,
									() => {
										const bounds = neighborBounds(segmentIndex());
										const end = segment.end;
										const minValue = segment.start + minDuration();
										const maxValue = Math.max(minValue, bounds.nextStart);
										return { end, minValue, maxValue };
									},
									(e, value, initialMouseX) => {
										const delta = (e.clientX - initialMouseX) * secsPerPixel();
										const next = Math.max(
											value.minValue,
											Math.min(value.maxValue, value.end + delta),
										);
										setProject(
											"timeline",
											"captionSegments",
											segmentIndex(),
											"end",
											next,
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

import { createEventListenerMap } from "@solid-primitives/event-listener";
import { throttle } from "@solid-primitives/scheduled";
import { batch, createMemo, createRoot, For, Show } from "solid-js";
import { useCanvasSnapTargets } from "./CanvasElementsOverlay";
import { FPS, useEditorContext } from "./context";
import type { MotionTransform } from "./motion";
import {
	motionPreviewRect,
	moveMotionTransform,
	resizeMotionTransform,
	usableMotionArtifact,
} from "./motion-canvas";
import { SNAP_PX, snapMovingRect } from "./snapping";

type Size = { width: number; height: number };

export function MotionOverlay(props: { size: Size }) {
	const {
		project,
		setProject,
		editorState,
		setEditorState,
		projectHistory,
		latestFrame,
		setSnapGuides,
	} = useEditorContext();
	const snapTargetsFor = useCanvasSnapTargets();
	let rootRef: HTMLDivElement | undefined;

	const time = () => editorState.previewTime ?? editorState.playbackTime ?? 0;
	const output = () => ({
		width: latestFrame()?.width ?? Math.max(props.size.width, 1),
		height: latestFrame()?.height ?? Math.max(props.size.height, 1),
	});
	const selectedIndex = () => {
		const selection = editorState.timeline.selection;
		return selection?.type === "motion" ? (selection.indices[0] ?? null) : null;
	};
	const active = createMemo(() =>
		(project.motion?.segments ?? [])
			.map((segment, index) => ({ segment, index }))
			.filter(
				({ segment }) =>
					time() >= segment.start &&
					time() < segment.end &&
					usableMotionArtifact(segment, project.motion?.artifacts ?? []),
			)
			.sort(
				(a, b) =>
					a.segment.zIndex - b.segment.zIndex ||
					a.segment.track - b.segment.track ||
					a.index - b.index,
			),
	);
	const select = (index: number) =>
		batch(() => {
			setEditorState("canvasSelection", null);
			setEditorState("timeline", "selection", {
				type: "motion",
				indices: [index],
			});
		});

	function startGesture(
		event: MouseEvent,
		index: number,
		mode: "move" | "resize",
	) {
		if (event.button !== 0) return;
		const segment = project.motion?.segments[index];
		if (!segment || !rootRef) return;
		event.preventDefault();
		event.stopPropagation();
		select(index);

		const initialPointer = { x: event.clientX, y: event.clientY };
		const initialTransform = { ...segment.transform };
		const initialRect = motionPreviewRect(segment, output(), props.size);
		const rootBounds = rootRef.getBoundingClientRect();
		const center = {
			x: rootBounds.left + initialRect.x + initialRect.width / 2,
			y: rootBounds.top + initialRect.y + initialRect.height / 2,
		};
		const initialDistance = Math.max(
			Math.hypot(event.clientX - center.x, event.clientY - center.y),
			1,
		);
		const targets = snapTargetsFor({ motion: index });
		const resumeHistory = projectHistory.pause();

		const updateTransform = (next: MotionTransform) => {
			setProject("motion", "segments", index, "transform", next);
		};
		const update = (moveEvent: MouseEvent) => {
			if (mode === "resize") {
				const distance = Math.hypot(
					moveEvent.clientX - center.x,
					moveEvent.clientY - center.y,
				);
				updateTransform(
					resizeMotionTransform(initialTransform, distance / initialDistance),
				);
				return;
			}

			let delta = {
				x: moveEvent.clientX - initialPointer.x,
				y: moveEvent.clientY - initialPointer.y,
			};
			if (moveEvent.shiftKey) {
				setSnapGuides([]);
			} else {
				const snap = snapMovingRect(
					{
						x: (initialRect.x + delta.x) / Math.max(props.size.width, 1),
						y: (initialRect.y + delta.y) / Math.max(props.size.height, 1),
						w: initialRect.width / Math.max(props.size.width, 1),
						h: initialRect.height / Math.max(props.size.height, 1),
					},
					targets,
					SNAP_PX / Math.max(props.size.width, 1),
					SNAP_PX / Math.max(props.size.height, 1),
				);
				delta = {
					x: delta.x + snap.dx * props.size.width,
					y: delta.y + snap.dy * props.size.height,
				};
				setSnapGuides(snap.guides);
			}
			updateTransform(
				moveMotionTransform(initialTransform, delta, output(), props.size),
			);
		};
		const throttled = throttle(update, 1000 / FPS);
		const finish = (upEvent: MouseEvent) => {
			throttled.clear();
			update(upEvent);
			setSnapGuides([]);
			resumeHistory();
			dispose();
		};
		const dispose = createRoot((dispose) => {
			createEventListenerMap(window, {
				mousemove: throttled,
				mouseup: finish,
			});
			return dispose;
		});
	}

	return (
		<Show when={!editorState.playing}>
			<div
				ref={rootRef}
				class="absolute inset-0 pointer-events-none"
				data-preview-edit-control
			>
				<For each={active()}>
					{({ segment, index }) => {
						const rect = () => motionPreviewRect(segment, output(), props.size);
						const isSelected = () => selectedIndex() === index;
						return (
							<div
								class="absolute pointer-events-auto cursor-move"
								classList={{
									"border-2 border-blue-9": isSelected(),
									"hover:border hover:border-blue-6": !isSelected(),
								}}
								style={{
									left: `${rect().x}px`,
									top: `${rect().y}px`,
									width: `${rect().width}px`,
									height: `${rect().height}px`,
									transform: `rotate(${rect().rotation}deg)`,
									"transform-origin": "center",
								}}
								onMouseDown={(event) => startGesture(event, index, "move")}
							>
								<Show when={isSelected()}>
									<For
										each={[
											"-left-1 -top-1",
											"-right-1 -top-1",
											"-left-1 -bottom-1",
											"-right-1 -bottom-1",
										]}
									>
										{(position) => (
											<button
												type="button"
												aria-label="Resize animation"
												data-preview-edit-control
												class={`absolute size-3 rounded-full border-2 border-white bg-blue-9 ${position}`}
												onMouseDown={(event) =>
													startGesture(event, index, "resize")
												}
											/>
										)}
									</For>
								</Show>
							</div>
						);
					}}
				</For>
			</div>
		</Show>
	);
}

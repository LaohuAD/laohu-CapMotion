import {
	createEventListener,
	createEventListenerMap,
} from "@solid-primitives/event-listener";
import { throttle } from "@solid-primitives/scheduled";
import {
	createEffect,
	createMemo,
	createRoot,
	createSignal,
	on,
	Show,
} from "solid-js";
import { produce } from "solid-js/store";
import { defaultCaptionSettings } from "~/store/captions";
import type { CaptionTrackSegment } from "~/utils/tauri";
import { keyboardEventTargetsEditableContent } from "~/utils/editor-shortcuts";
import { useCanvasSnapTargets } from "./CanvasElementsOverlay";
import {
	captionTrackId,
	CAPTION_POSITION_COORDINATE_SIZE,
	resolveCaptionTrackPosition,
	setCaptionTrackPosition,
} from "./caption-position";
import { FPS, useEditorContext } from "./context";
import { SNAP_PX, type SnapTargets, snapMovingRect } from "./snapping";

type CaptionOverlayProps = {
	size: { width: number; height: number };
};

function clamp(value: number, min: number, max: number) {
	if (min > max) return (min + max) / 2;
	return Math.min(Math.max(value, min), max);
}

function fontFamily(font: string) {
	if (font === "System Serif") return "serif";
	if (font === "System Monospace") return "monospace";
	if (font === "System Sans-Serif") return "system-ui, sans-serif";
	return `"${font.replaceAll('"', "")}", system-ui, sans-serif`;
}

function positionYFactor(position: string) {
	switch (position) {
		case "top-left":
		case "top-center":
		case "top":
		case "top-right":
			return 0.08;
		default:
			return 0.85;
	}
}

export function CaptionOverlay(props: CaptionOverlayProps) {
	const {
		project,
		setProject,
		editorState,
		setEditorState,
		projectHistory,
		setSnapGuides,
	} = useEditorContext();
	const snapTargetsFor = useCanvasSnapTargets();
	const [measuredSize, setMeasuredSize] = createSignal({ width: 1, height: 1 });
	let hiddenMeasureRef: HTMLDivElement | undefined;

	const currentAbsoluteTime = () =>
		editorState.previewTime ?? editorState.playbackTime ?? 0;

	const settings = createMemo(() => ({
		...defaultCaptionSettings,
		...project.captions?.settings,
	}));

	const activeCaption = createMemo(() => {
		if (!settings().enabled) return null;
		const time = currentAbsoluteTime();
		const segments = project.timeline?.captionSegments ?? [];
		const selection = editorState.timeline.selection;
		const selectedIndex =
			selection?.type === "caption" ? selection.indices[0] : undefined;
		const selected =
			selectedIndex === undefined ? undefined : segments[selectedIndex];
		if (
			selectedIndex !== undefined &&
			selected &&
			time >= selected.start &&
			time < selected.end
		) {
			return { index: selectedIndex, segment: selected };
		}
		const index = segments.findIndex(
			(segment) => time >= segment.start && time < segment.end,
		);
		if (index < 0) return null;
		const segment = segments[index];
		if (!segment) return null;
		return { index, segment };
	});

	const text = createMemo(() => activeCaption()?.segment.text ?? "");

	const scaledFontSize = createMemo(() =>
		Math.max(
			(activeCaption()?.segment.fontSizeOverride ?? settings().size) *
				(props.size.height / 1080),
			1,
		),
	);

	const presentation = createMemo(() => {
		const segment = activeCaption()?.segment;
		const track = resolveCaptionTrackPosition(
			settings().trackPositions,
			captionTrackId(segment?.trackId),
			{
				position: settings().position,
				manualPosition: settings().manualPosition,
			},
		);
		return {
			position: segment?.positionOverride ?? track.position,
			manualPosition: segment?.manualPositionOverride ?? track.manualPosition,
		};
	});

	const margin = createMemo(() => props.size.width * 0.05);
	const availableWidth = createMemo(() =>
		Math.max(props.size.width - margin() * 2, scaledFontSize()),
	);
	const fitScale = createMemo(() => {
		const padding = scaledFontSize() * 0.5;
		const measuredWidth = measuredSize().width + padding * 2;
		return measuredWidth > availableWidth()
			? Math.min(Math.max(availableWidth() / measuredWidth, 0.35), 1)
			: 1;
	});
	const effectiveFontSize = createMemo(() => scaledFontSize() * fitScale());

	createEffect(
		on(
			() =>
				[
					text(),
					scaledFontSize(),
					availableWidth(),
					settings().font,
					settings().fontWeight,
					settings().letterSpacing,
					fitScale(),
				] as const,
			() => {
				queueMicrotask(() => {
					requestAnimationFrame(() => {
						if (!hiddenMeasureRef) return;
						const measuredRect = hiddenMeasureRef.getBoundingClientRect();
						setMeasuredSize({
							width: Math.max(measuredRect.width, scaledFontSize()),
							height: Math.max(measuredRect.height, scaledFontSize() * 1.2),
						});
					});
				});
			},
		),
	);

	const rect = createMemo(() => {
		const padding = effectiveFontSize() * 0.5;
		const width = Math.min(
			measuredSize().width * fitScale() + padding * 2,
			availableWidth(),
		);
		const height = Math.min(
			measuredSize().height * fitScale() + padding * 2,
			Math.max(props.size.height, 1),
		);
		const currentSettings = presentation();
		let left: number;
		let top: number;

		if (
			currentSettings.position === "manual" &&
			currentSettings.manualPosition
		) {
			left = clamp(
				currentSettings.manualPosition.x * props.size.width - width / 2,
				0,
				props.size.width - width,
			);
			top = clamp(
				currentSettings.manualPosition.y * props.size.height - height / 2,
				0,
				props.size.height - height,
			);
		} else {
			switch (currentSettings.position) {
				case "top-left":
				case "bottom-left":
					left = margin();
					break;
				case "top-right":
				case "bottom-right":
					left = props.size.width - margin() - width;
					break;
				default:
					left = (props.size.width - width) / 2;
					break;
			}

			top =
				props.size.height * positionYFactor(currentSettings.position) -
				height / 2;
			left = clamp(left, 0, props.size.width - width);
			top = clamp(top, 0, props.size.height - height);
		}

		return { left, top, width, height };
	});

	const selectedCaptionIndex = createMemo(() => {
		const selection = editorState.timeline.selection;
		if (!selection || selection.type !== "caption") return null;
		return selection.indices[0] ?? null;
	});

	const updateManualPosition = (position: { x: number; y: number }) => {
		if (!project.captions) return;
		const active = activeCaption();
		const trackId = captionTrackId(active?.segment.trackId);
		setProject(
			produce((currentProject: typeof project) => {
				const captionSettings = currentProject.captions?.settings;
				if (!captionSettings) return;
				captionSettings.trackPositions = setCaptionTrackPosition(
					captionSettings.trackPositions,
					trackId,
					{ position: "manual", manualPosition: position },
				);
				for (const segment of currentProject.timeline?.captionSegments ?? []) {
					if (captionTrackId(segment.trackId) !== trackId) continue;
					segment.positionOverride = null;
					segment.manualPositionOverride = null;
				}
			}),
		);
	};

	// Caption nudging is deliberately outside the generic shortcut helper so
	// native key-repeat keeps moving while an arrow key is held.
	createEventListener(document, "keydown", (event: KeyboardEvent) => {
		if (!activeCaption() || selectedCaptionIndex() === null) return;
		if (keyboardEventTargetsEditableContent(event, document.activeElement))
			return;
		const direction: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
		};
		const delta = direction[event.key];
		if (!delta) return;
		event.preventDefault();
		const current = presentation().manualPosition ?? {
			x: (rect().left + rect().width / 2) / props.size.width,
			y: (rect().top + rect().height / 2) / props.size.height,
		};
		updateManualPosition({
			x: clamp(current.x + delta[0] / CAPTION_POSITION_COORDINATE_SIZE.x, 0, 1),
			y: clamp(current.y + delta[1] / CAPTION_POSITION_COORDINATE_SIZE.y, 0, 1),
		});
	});

	const createMouseDownDrag = (
		setup: () => {
			center: { x: number; y: number };
			rect: ReturnType<typeof rect>;
			targets: SnapTargets;
		},
		update: (
			event: MouseEvent,
			initial: {
				center: { x: number; y: number };
				rect: ReturnType<typeof rect>;
				targets: SnapTargets;
			},
			initialMouse: { x: number; y: number },
		) => void,
	) => {
		return (downEvent: MouseEvent) => {
			downEvent.preventDefault();
			downEvent.stopPropagation();

			const initial = setup();
			const initialMouse = { x: downEvent.clientX, y: downEvent.clientY };
			const resumeHistory = projectHistory.pause();

			function handleUpdate(event: MouseEvent) {
				update(event, initial, initialMouse);
			}

			const throttledUpdate = throttle(handleUpdate, 1000 / FPS);

			function finish(finalEvent: MouseEvent) {
				throttledUpdate.clear();
				handleUpdate(finalEvent);
				resumeHistory();
				setSnapGuides([]);
				dispose();
			}

			handleUpdate(downEvent);

			const dispose = createRoot((dispose) => {
				createEventListenerMap(window, {
					mousemove: throttledUpdate,
					mouseup: finish,
				});
				return dispose;
			});
		};
	};

	const onMove = createMouseDownDrag(
		() => {
			const currentRect = rect();
			const currentSettings = presentation();
			const center =
				currentSettings.position === "manual" && currentSettings.manualPosition
					? { ...currentSettings.manualPosition }
					: {
							x: (currentRect.left + currentRect.width / 2) / props.size.width,
							y: (currentRect.top + currentRect.height / 2) / props.size.height,
						};
			return { center, rect: currentRect, targets: snapTargetsFor(null) };
		},
		(event, initial, initialMouse) => {
			if (props.size.width <= 0 || props.size.height <= 0) return;

			const dx = (event.clientX - initialMouse.x) / props.size.width;
			const dy = (event.clientY - initialMouse.y) / props.size.height;
			const halfWidth = initial.rect.width / props.size.width / 2;
			const halfHeight = initial.rect.height / props.size.height / 2;

			let snapDx = 0;
			let snapDy = 0;
			if (event.shiftKey) {
				setSnapGuides([]);
			} else {
				const snap = snapMovingRect(
					{
						x: initial.center.x + dx - halfWidth,
						y: initial.center.y + dy - halfHeight,
						w: halfWidth * 2,
						h: halfHeight * 2,
					},
					initial.targets,
					SNAP_PX / props.size.width,
					SNAP_PX / props.size.height,
				);
				snapDx = snap.dx;
				snapDy = snap.dy;
				setSnapGuides(snap.guides);
			}

			updateManualPosition({
				x: clamp(initial.center.x + dx + snapDx, halfWidth, 1 - halfWidth),
				y: clamp(initial.center.y + dy + snapDy, halfHeight, 1 - halfHeight),
			});
		},
	);

	const handleMouseDown = (
		caption: { index: number; segment: CaptionTrackSegment },
		event: MouseEvent,
	) => {
		setEditorState("timeline", "selection", {
			type: "caption",
			indices: [caption.index],
		});
		onMove(event);
	};

	return (
		<div class="absolute inset-0 pointer-events-none" data-preview-edit-control>
			<div
				ref={hiddenMeasureRef}
				class="absolute invisible pointer-events-none"
				style={{
					"white-space": "nowrap",
					"word-break": "break-word",
					"font-family": fontFamily(settings().font),
					"font-size": `${scaledFontSize()}px`,
					"font-weight": settings().fontWeight,
					"letter-spacing": `${settings().letterSpacing}px`,
					"line-height": 1.2,
					"max-width": `${availableWidth()}px`,
					width: "fit-content",
					height: "auto",
					top: "0",
					left: "0",
				}}
			>
				{text()}
			</div>
			<Show when={activeCaption()}>
				{(caption) => (
					<div
						class="absolute pointer-events-auto rounded-md border-2 transition-colors"
						classList={{
							"border-blue-9 bg-blue-9/10 cursor-move":
								selectedCaptionIndex() === caption().index,
							"border-transparent hover:border-blue-6 hover:bg-blue-9/5":
								selectedCaptionIndex() !== caption().index,
						}}
						style={{
							left: `${rect().left}px`,
							top: `${rect().top}px`,
							width: `${rect().width}px`,
							height: `${rect().height}px`,
						}}
						onMouseDown={(event) => handleMouseDown(caption(), event)}
					/>
				)}
			</Show>
		</div>
	);
}

import { createElementSize } from "@solid-primitives/resize-observer";
import { createMemo, type ParentComponent } from "solid-js";

type Size = { width: number; height: number };

const SAFE_MARGIN = 16;
const VERTICAL_CENTER_RATIO = 0.4;

const clamp = (value: number, minimum: number, maximum: number) =>
	Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export function preRecordingControlsOrigin(viewport: Size, controls: Size) {
	return {
		left: clamp(
			(viewport.width - controls.width) / 2,
			SAFE_MARGIN,
			viewport.width - controls.width - SAFE_MARGIN,
		),
		top: clamp(
			viewport.height * VERTICAL_CENTER_RATIO - controls.height / 2,
			SAFE_MARGIN,
			viewport.height - controls.height - SAFE_MARGIN,
		),
	};
}

export const CenterUpperRecordingControls: ParentComponent = (props) => {
	let root: HTMLDivElement | undefined;
	const size = createElementSize(() => root);
	const origin = createMemo(() => {
		if (!size.width || !size.height) return null;
		return preRecordingControlsOrigin(
			{ width: window.innerWidth, height: window.innerHeight },
			{ width: size.width, height: size.height },
		);
	});
	const style = createMemo(() => {
		const position = origin();
		return position
			? { left: `${position.left}px`, top: `${position.top}px` }
			: { left: "-1000px", top: "-1000px" };
	});

	return (
		<div
			ref={root}
			class="fixed z-[60] max-w-[calc(100vw-2rem)]"
			style={style()}
		>
			{props.children}
		</div>
	);
};

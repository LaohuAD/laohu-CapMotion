import { useSearchParams } from "@solidjs/router";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
	advanceManualZoomFollow,
	manualZoomViewport,
} from "~/utils/manual-zoom-overlay";

export default function ManualZoomOverlay() {
	const [params] = useSearchParams<{ x: string; y: string; amount: string }>();
	const amount = createMemo(() => Number.parseFloat(params.amount ?? ""));
	const [center, setCenter] = createSignal({
		x: Number.parseFloat(params.x ?? ""),
		y: Number.parseFloat(params.y ?? ""),
	});
	const viewport = createMemo(() =>
		manualZoomViewport(center().x, center().y, amount()),
	);

	onMount(() => {
		let disposed = false;
		let frame = 0;
		let sampleInFlight = false;
		let lastRequestedAt = performance.now();
		let lastAppliedAt = lastRequestedAt;
		let bounds:
			| { x: number; y: number; width: number; height: number }
			| undefined;
		const overlayWindow = getCurrentWindow();

		void Promise.all([
			overlayWindow.outerPosition(),
			overlayWindow.outerSize(),
		]).then(([position, size]) => {
			if (disposed) return;
			bounds = {
				x: position.x,
				y: position.y,
				width: size.width,
				height: size.height,
			};
		});

		const tick = (now: number) => {
			if (disposed) return;
			frame = requestAnimationFrame(tick);
			if (!bounds || sampleInFlight || now - lastRequestedAt < 1000 / 30) {
				return;
			}
			lastRequestedAt = now;
			sampleInFlight = true;
			void cursorPosition()
				.then((cursor) => {
					if (disposed || !bounds) return;
					const currentBounds = bounds;
					const dt = Math.max(0, (now - lastAppliedAt) / 1000);
					lastAppliedAt = now;
					setCenter((current) =>
						advanceManualZoomFollow(
							current,
							{
								x: (cursor.x - currentBounds.x) / currentBounds.width,
								y: (cursor.y - currentBounds.y) / currentBounds.height,
							},
							amount(),
							dt,
						),
					);
				})
				.finally(() => {
					sampleInFlight = false;
				});
		};
		frame = requestAnimationFrame(tick);

		onCleanup(() => {
			disposed = true;
			cancelAnimationFrame(frame);
		});
	});

	return (
		<div class="fixed inset-0 overflow-hidden pointer-events-none select-none">
			<div
				class="absolute rounded-xl border-2 border-blue-8/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.30),0_0_0_1px_rgba(255,255,255,0.42)]"
				style={{
					left: `${viewport().left}%`,
					top: `${viewport().top}%`,
					width: `${viewport().width}%`,
					height: `${viewport().height}%`,
				}}
			/>
		</div>
	);
}

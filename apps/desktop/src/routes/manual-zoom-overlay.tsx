import { useSearchParams } from "@solidjs/router";
import { createMemo } from "solid-js";
import { useI18n } from "~/i18n";
import { manualZoomViewport } from "~/utils/manual-zoom-overlay";

export default function ManualZoomOverlay() {
	const { t } = useI18n();
	const [params] = useSearchParams<{ x: string; y: string; amount: string }>();
	const viewport = createMemo(() =>
		manualZoomViewport(
			Number.parseFloat(params.x ?? ""),
			Number.parseFloat(params.y ?? ""),
			Number.parseFloat(params.amount ?? ""),
		),
	);

	return (
		<div class="fixed inset-0 overflow-hidden pointer-events-none select-none">
			<div
				class="absolute rounded-xl border-2 border-blue-8/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.46),0_0_0_1px_rgba(255,255,255,0.42),0_14px_44px_rgba(0,0,0,0.35)]"
				style={{
					left: `${viewport().left}%`,
					top: `${viewport().top}%`,
					width: `${viewport().width}%`,
					height: `${viewport().height}%`,
				}}
			>
				<div class="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/65 text-white text-xs font-semibold tracking-wide backdrop-blur-md">
					{viewport().amount.toFixed(1)}× {t("manualZoom.overlay")}
				</div>
			</div>
		</div>
	);
}

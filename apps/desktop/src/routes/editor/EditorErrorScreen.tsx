import { Button } from "@cap/ui-solid";
import { createMutation } from "@tanstack/solid-query";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { type as ostype } from "@tauri-apps/plugin-os";
import { Show } from "solid-js";
import CaptionControlsWindows11 from "~/components/titlebar/controls/CaptionControlsWindows11";
import { useI18n } from "~/i18n";
import { commands } from "~/utils/tauri";
import IconAlertTriangle from "~icons/lucide/alert-triangle";
import IconFolder from "~icons/lucide/folder";
import IconLoaderCircle from "~icons/lucide/loader-circle";
import IconRefreshCw from "~icons/lucide/refresh-cw";

const NEEDS_RECOVERY_PATTERN = /may need to be recovered/i;

function isRecoveryNeededError(error: string): boolean {
	return NEEDS_RECOVERY_PATTERN.test(error);
}

export function EditorErrorScreen(props: {
	error: string;
	projectPath: string;
}) {
	const { text } = useI18n();
	const needsRecovery = () => isRecoveryNeededError(props.error);
	const isMac = () => ostype() === "macos";

	const recoverMutation = createMutation(() => ({
		mutationFn: async () => {
			const result = await commands.recoverRecording(props.projectPath);
			await commands.showWindow({ Editor: { project_path: result } });
			return result;
		},
		onSuccess: () => {
			window.location.reload();
		},
	}));

	const handleOpenFolder = () => {
		revealItemInDir(props.projectPath);
	};

	return (
		<div class="flex flex-col flex-1 min-h-0">
			<div
				data-tauri-drag-region
				class="flex relative flex-row items-center w-full h-14 px-4"
			>
				{isMac() && <div class="h-full w-16" />}
				<div data-tauri-drag-region class="flex-1 h-full" />
				{ostype() === "windows" && <CaptionControlsWindows11 />}
			</div>

			<div class="flex-1 flex items-center justify-center p-8">
				<div class="max-w-md w-full space-y-6">
					<div class="flex flex-col items-center text-center space-y-3">
						<div class="size-16 rounded-full bg-red-2 flex items-center justify-center">
							<IconAlertTriangle class="size-8 text-red-9" />
						</div>
						<h2 class="text-xl font-semibold text-gray-12">
							{needsRecovery()
								? text("Recording Needs Recovery")
								: text("Unable to Open Recording")}
						</h2>
						<p class="text-sm text-gray-11">{props.error}</p>
					</div>

					<Show when={needsRecovery()}>
						<div class="bg-gray-2 border border-gray-4 rounded-xl p-4 space-y-4">
							<div class="space-y-2">
								<h3 class="font-medium text-gray-12 text-sm">
									{text("Automatic Recovery")}
								</h3>
								<p class="text-xs text-gray-11">
									{text(
										"Cap can attempt to recover your recording automatically. This will reconstruct the recording from available segment data.",
									)}
								</p>
							</div>

							<Button
								onClick={() => recoverMutation.mutate()}
								disabled={recoverMutation.isPending}
								variant="primary"
								class="w-full"
							>
								<Show
									when={recoverMutation.isPending}
									fallback={
										<>
											<IconRefreshCw class="size-4 mr-2" />
											{text("Recover Recording")}
										</>
									}
								>
									<IconLoaderCircle class="size-4 mr-2 animate-spin" />
									{text("Recovering...")}
								</Show>
							</Button>

							<Show when={recoverMutation.error}>
								<div class="bg-red-2 border border-red-6 rounded-lg p-3">
									<p class="text-red-11 text-xs">
										{text("Recovery failed")}:{" "}
										{recoverMutation.error instanceof Error
											? recoverMutation.error.message
											: String(recoverMutation.error)}
									</p>
								</div>
							</Show>
						</div>
					</Show>

					<div class="bg-gray-2 border border-gray-4 rounded-xl p-4 space-y-4">
						<div class="space-y-2">
							<h3 class="font-medium text-gray-12 text-sm">
								{text("Manual Investigation")}
							</h3>
							<p class="text-xs text-gray-11">
								{text(
									"You can open the recording folder to inspect the raw files directly.",
								)}
							</p>

							<div class="bg-gray-3 rounded-lg p-3 space-y-2">
								<p class="text-xs font-mono text-gray-11 break-all">
									{props.projectPath}
								</p>
								<Show
									when={isMac()}
									fallback={
										<p class="text-xs text-gray-10 italic">
											{text(
												"Tip: Double-click inside the folder to browse the contents.",
											)}
										</p>
									}
								>
									<p class="text-xs text-gray-10 italic">
										{text(
											'Tip: Right-click and select "Show Enclosing Folder" to see the .cap bundle contents.',
										)}
									</p>
								</Show>
							</div>
						</div>

						<Button onClick={handleOpenFolder} variant="outline" class="w-full">
							<IconFolder class="size-4 mr-2" />
							{text("Open Folder")}
						</Button>
					</div>

					<div class="flex justify-center">
						<button
							type="button"
							onClick={() => window.close()}
							class="text-sm text-gray-10 hover:text-gray-11 transition-colors"
						>
							{text("Close Window")}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

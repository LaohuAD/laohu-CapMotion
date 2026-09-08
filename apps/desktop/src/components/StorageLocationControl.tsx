import { Button } from "@cap/ui-solid";
import { open } from "@tauri-apps/plugin-dialog";
import { createResource, createSignal, Show } from "solid-js";
import { useI18n } from "~/i18n";
import { commands } from "~/utils/tauri";

/** Shared by first-run setup and Settings; no preference is saved until confirmed. */
export function StorageLocationControl(props: {
	onboarding?: boolean;
	onSaved: (path: string | null) => Promise<void> | void;
}) {
	const { t } = useI18n();
	const [draft, setDraft] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal("");
	const [info, { refetch }] = createResource(async () => {
		try {
			const result = await commands.getStorageLocation();
			setDraft(result.path);
			return result;
		} catch (e) {
			setError(String(e));
			return undefined;
		}
	});
	const browse = async () => {
		try {
			const path = await open({
				directory: true,
				multiple: false,
				title: t("settings.storage.title"),
			});
			if (typeof path === "string") {
				setDraft(path);
				setError("");
			}
		} catch (e) {
			setError(String(e));
		}
	};
	const save = async () => {
		if (busy() || !draft().trim()) return;
		setBusy(true);
		setError("");
		try {
			const selected =
				draft().trim() === info()?.defaultPath ? null : draft().trim();
			await commands.setRecordingsFolder(selected);
			await refetch();
			await props.onSaved(selected);
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	};
	return (
		<div class="flex flex-col gap-3 text-left">
			<label class="text-sm font-medium text-gray-12" for="cap-storage-path">
				{t("settings.storage.pathLabel")}
			</label>
			<div class="flex gap-2">
				<input
					id="cap-storage-path"
					class="min-w-0 flex-1 rounded-lg border border-gray-5 bg-gray-2 p-3 text-xs font-mono text-gray-12"
					value={draft()}
					disabled={busy() || info.loading}
					onInput={(e) => {
						setDraft(e.currentTarget.value);
						setError("");
					}}
				/>
				<Button variant="gray" disabled={busy()} onClick={browse}>
					{t("common.chooseFolder")}
				</Button>
			</div>
			<Show when={info()?.availableBytes != null && draft() === info()?.path}>
				<p class="text-xs text-gray-10">
					{t("settings.storage.freeSpace")}{" "}
					{((info()?.availableBytes ?? 0) / 1073741824).toFixed(1)} GB
				</p>
			</Show>
			<p class="text-xs leading-5 text-gray-10">
				{t("settings.storage.layout")}
			</p>
			<p class="text-xs leading-5 text-gray-10">
				{t("settings.storage.offline")}
			</p>
			<Show when={error() || info.error}>
				<p role="alert" class="text-sm text-red-11">
					{error() || String(info.error)}
				</p>
			</Show>
			<div class="flex flex-wrap justify-end gap-2">
				<Button
					variant="gray"
					disabled={busy() || !info()}
					onClick={() => setDraft(info()?.defaultPath ?? "")}
				>
					{t("settings.storage.useDefault")}
				</Button>
				<Button
					variant="dark"
					disabled={busy() || !draft().trim() || info.loading}
					onClick={save}
				>
					{t(
						props.onboarding
							? "onboarding.storage.continue"
							: "settings.storage.save",
					)}
				</Button>
			</div>
		</div>
	);
}

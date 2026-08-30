import { createEventListener } from "@solid-primitives/event-listener";
import { type as ostype } from "@tauri-apps/plugin-os";
import {
	batch,
	createEffect,
	createResource,
	createSignal,
	For,
	Index,
	Match,
	Show,
	Switch,
} from "solid-js";
import { createStore } from "solid-js/store";
import toast from "solid-toast";
import { type TranslationKey, useI18n } from "~/i18n";
import { editorShortcutsStore, hotkeysStore } from "~/store";
import {
	DEFAULT_EDITOR_SHORTCUTS,
	EDITOR_SHORTCUT_ACTIONS,
	type EditorShortcutAction,
	type EditorShortcutBinding,
	type EditorShortcutsStore,
	editorShortcutConflict,
	normalizeEditorShortcuts,
} from "~/utils/editor-shortcuts";

import {
	commands,
	type Hotkey,
	type HotkeyAction,
	type HotkeysStore,
} from "~/utils/tauri";
import { Section, SectionCard, SettingsPageContent } from "./Setting";

const ACTION_TEXT = {
	restartRecording: "shortcuts.action.restartRecording",
	stopRecording: "shortcuts.action.stopRecording",
	togglePauseRecording: "shortcuts.action.togglePauseRecording",
	toggleManualZoom: "shortcuts.manualZoom",
	cycleRecordingMode: "shortcuts.action.cycleRecordingMode",
	openRecordingPicker: "shortcuts.action.openRecordingPicker",
	openRecordingPickerDisplay: "shortcuts.action.openRecordingPickerDisplay",
	openRecordingPickerWindow: "shortcuts.action.openRecordingPickerWindow",
	openRecordingPickerArea: "shortcuts.action.openRecordingPickerArea",
	screenshotDisplay: "shortcuts.action.screenshotDisplay",
	screenshotWindow: "shortcuts.action.screenshotWindow",
	screenshotArea: "shortcuts.action.screenshotArea",
} satisfies { [K in HotkeyAction]?: TranslationKey };

const EDITOR_ACTION_TEXT: Record<EditorShortcutAction, TranslationKey> = {
	trimPrevious: "shortcuts.editor.trimPrevious",
	splitAtCursor: "shortcuts.editor.splitAtCursor",
	trimNext: "shortcuts.editor.trimNext",
};

export default function () {
	const [stores] = createResource(async () =>
		Promise.all([hotkeysStore.get(), editorShortcutsStore.get()]),
	);

	return (
		<Show when={stores.state === "ready" && ([stores()] as const)}>
			{(stores) => (
				<Inner
					initialStore={stores()[0]?.[0] ?? null}
					initialEditorStore={stores()[0]?.[1] ?? null}
				/>
			)}
		</Show>
	);
}

const MODIFIER_KEYS = new Set(["Meta", "Shift", "Control", "Alt"]);
function Inner(props: {
	initialStore: HotkeysStore | null;
	initialEditorStore: EditorShortcutsStore | null;
}) {
	const { t } = useI18n();
	const [hotkeys, setHotkeys] = createStore<{
		[K in HotkeyAction]?: Hotkey;
	}>(props.initialStore?.hotkeys ?? {});

	createEffect(() => {
		hotkeysStore.set({ hotkeys: { ...hotkeys } as HotkeysStore["hotkeys"] });
	});
	const [editorHotkeys, setEditorHotkeys] = createStore(
		normalizeEditorShortcuts(props.initialEditorStore),
	);
	createEffect(() => {
		editorShortcutsStore.set({ version: 1, bindings: { ...editorHotkeys } });
	});

	const [listening, setListening] = createSignal<
		| { scope: "global"; action: HotkeyAction; prev?: Hotkey }
		| {
				scope: "editor";
				action: EditorShortcutAction;
				prev: EditorShortcutBinding | null;
		  }
	>();

	createEventListener(window, "keydown", (e) => {
		if (MODIFIER_KEYS.has(e.key)) return;

		const data = {
			code: e.code,
			ctrl: e.ctrlKey,
			shift: e.shiftKey,
			alt: e.altKey,
			meta: e.metaKey,
		};

		const l = listening();
		if (l) {
			e.preventDefault();
			if (l.scope === "global") {
				setHotkeys(l.action, data);
			} else {
				const conflict = editorShortcutConflict(editorHotkeys, l.action, data);
				if (conflict) {
					toast.error(
						t("shortcuts.editor.conflict").replace(
							"{action}",
							t(EDITOR_ACTION_TEXT[conflict]),
						),
					);
					return;
				}
				setEditorHotkeys(l.action, data);
			}
		}
	});

	const actions = () =>
		[
			"screenshotDisplay",
			"screenshotWindow",
			"screenshotArea",
			"openRecordingPicker",
			"stopRecording",
			"restartRecording",
			"togglePauseRecording",
			"toggleManualZoom",
			"cycleRecordingMode",
			"openRecordingPickerDisplay",
			"openRecordingPickerWindow",
			"openRecordingPickerArea",
		] satisfies Array<keyof typeof ACTION_TEXT>;

	return (
		<div class="cap-settings-page flex flex-col h-full custom-scroll">
			<SettingsPageContent>
				<Section
					title={t("shortcuts.title")}
					description={t("shortcuts.description")}
				>
					<SectionCard class="flex flex-col gap-3 p-4">
						<Index each={actions()}>
							{(item, idx) => {
								createEventListener(window, "click", () => {
									const current = listening();
									if (current?.scope !== "global" || current.action !== item())
										return;

									batch(() => {
										setHotkeys(item(), current.prev);
										setListening();
									});
								});

								return (
									<>
										<div class="flex flex-row justify-between items-center w-full h-8">
											<p class="text-[13px] text-gray-12">
												{t(ACTION_TEXT[item()])}
											</p>
											<Switch>
												<Match
													when={
														listening()?.scope === "global" &&
														listening()?.action === item()
													}
												>
													<div class="flex flex-row-reverse gap-2 justify-between items-center h-full text-sm rounded-lg w-fit">
														<Show
															when={hotkeys[item()]}
															fallback={
																<p class="text-[13px] text-gray-11">
																	{t("shortcuts.setPrompt")}
																</p>
															}
														>
															{(binding) => <HotkeyText binding={binding()} />}
														</Show>
														<div class="flex flex-row items-center gap-0.5">
															<Show when={hotkeys[item()]}>
																<button
																	class="w-fit"
																	type="button"
																	onBlur={(e) => console.log(e)}
																	onClick={(e) => {
																		e.stopPropagation();

																		setListening();
																		commands.setHotkey(
																			item(),
																			hotkeys[item()] ?? null,
																		);
																	}}
																>
																	<IconCapCircleCheck class="transition-colors text-gray-12 hover:text-gray-10 size-5" />
																</button>
															</Show>
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	batch(() => {
																		setListening();
																		// biome-ignore lint/style/noNonNullAssertion: store
																		setHotkeys(item(), undefined!);
																		commands.setHotkey(item(), null);
																	});
																}}
															>
																<IconCapCircleX class="text-red-500 transition-colors hover:text-red-700 size-5" />
															</button>
														</div>
													</div>
												</Match>
												<Match
													when={
														listening()?.scope !== "global" ||
														listening()?.action !== item()
													}
												>
													<button
														type="button"
														class="text-sm bg-transparent rounded-lg"
														onClick={() => {
															// ensures that previously selected hotkey is cleared by letting the event propagate before listening to the new hotkey
															setTimeout(() => {
																setListening({
																	scope: "global",
																	action: item(),
																	prev: hotkeys[item()],
																});
															}, 1);
														}}
													>
														<Show
															when={hotkeys[item()]}
															fallback={
																<p
																	class="flex items-center text-[11px] uppercase transition-colors hover:bg-gray-6 hover:border-gray-7
                        py-3 px-2.5 h-5 bg-gray-4 border border-gray-5 rounded-lg text-gray-11 hover:text-gray-12"
																>
																	{t("shortcuts.none")}
																</p>
															}
														>
															{(binding) => <HotkeyText binding={binding()} />}
														</Show>
													</button>
												</Match>
											</Switch>
										</div>
										{idx !== actions().length - 1 && (
											<div class="w-full h-px bg-gray-3" />
										)}
									</>
								);
							}}
						</Index>
					</SectionCard>
				</Section>
				<Section
					title={t("shortcuts.editor.title")}
					description={t("shortcuts.editor.description")}
				>
					<div class="flex justify-end mb-2">
						<button
							type="button"
							class="px-3 h-8 text-[12px] rounded-lg border border-gray-5 bg-gray-3 text-gray-11 hover:text-gray-12 hover:bg-gray-4"
							onClick={() => {
								batch(() => {
									for (const action of EDITOR_SHORTCUT_ACTIONS) {
										setEditorHotkeys(action, {
											...DEFAULT_EDITOR_SHORTCUTS[action],
										});
									}
									setListening();
								});
							}}
						>
							{t("shortcuts.editor.reset")}
						</button>
					</div>
					<SectionCard class="flex flex-col gap-3 p-4">
						<Index each={EDITOR_SHORTCUT_ACTIONS}>
							{(item, idx) => {
								createEventListener(window, "click", () => {
									const current = listening();
									if (current?.scope !== "editor" || current.action !== item())
										return;
									batch(() => {
										setEditorHotkeys(item(), current.prev);
										setListening();
									});
								});

								return (
									<>
										<div class="flex flex-row justify-between items-center w-full h-8">
											<p class="text-[13px] text-gray-12">
												{t(EDITOR_ACTION_TEXT[item()])}
											</p>
											<Show
												when={
													listening()?.scope === "editor" &&
													listening()?.action === item()
												}
												fallback={
													<button
														type="button"
														class="text-sm bg-transparent rounded-lg"
														onClick={() =>
															setTimeout(
																() =>
																	setListening({
																		scope: "editor",
																		action: item(),
																		prev: editorHotkeys[item()],
																	}),
																1,
															)
														}
													>
														<Show
															when={editorHotkeys[item()]}
															fallback={
																<p class="flex items-center text-[11px] uppercase py-3 px-2.5 h-5 bg-gray-4 border border-gray-5 rounded-lg text-gray-11 hover:text-gray-12">
																	{t("shortcuts.none")}
																</p>
															}
														>
															{(binding) => <HotkeyText binding={binding()} />}
														</Show>
													</button>
												}
											>
												<div class="flex flex-row-reverse gap-2 items-center h-full">
													<Show
														when={editorHotkeys[item()]}
														fallback={
															<p class="text-[13px] text-gray-11">
																{t("shortcuts.setPrompt")}
															</p>
														}
													>
														{(binding) => <HotkeyText binding={binding()} />}
													</Show>
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															setListening();
														}}
													>
														<IconCapCircleCheck class="size-5 text-gray-12" />
													</button>
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															batch(() => {
																setEditorHotkeys(item(), null);
																setListening();
															});
														}}
													>
														<IconCapCircleX class="size-5 text-red-500" />
													</button>
												</div>
											</Show>
										</div>
										{idx !== EDITOR_SHORTCUT_ACTIONS.length - 1 && (
											<div class="w-full h-px bg-gray-3" />
										)}
									</>
								);
							}}
						</Index>
					</SectionCard>
				</Section>
			</SettingsPageContent>
		</div>
	);
}

function HotkeyText(props: { binding: Hotkey }) {
	const os = ostype();
	const keys: string[] = [];

	if (os === "macos") {
		if (props.binding.meta) keys.push("⌘");
		if (props.binding.ctrl) keys.push("⌃");
		if (props.binding.alt) keys.push("⌥");
		if (props.binding.shift) keys.push("⇧");
	} else {
		if (props.binding.meta) keys.push("Win");
		if (props.binding.ctrl) keys.push("Ctrl");
		if (props.binding.alt) keys.push("Alt");
		if (props.binding.shift) keys.push("Shift");
	}

	const mainKey = props.binding.code.startsWith("Key")
		? props.binding.code[3]
		: props.binding.code;
	keys.push(mainKey);

	return (
		<div class="flex gap-1 items-center w-fit group">
			<For each={keys}>
				{(key) => (
					<kbd class="inline-flex justify-center w-fit text-xs items-center p-2 text-[13px] font-medium rounded-sm border size-6 text-gray-11 bg-gray-5 border-gray-6 group-hover:border-gray-8 transition-colors duration-200 group-hover:bg-gray-7">
						{key}
					</kbd>
				)}
			</For>
		</div>
	);
}

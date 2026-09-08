import { unwrap } from "solid-js/store";
import {
	clonePresetValue,
	createReusablePresetConfig,
	mergeProjectChangesIntoPreset,
	removePresetAndSelectFallback,
} from "~/routes/editor/preset-config";
import { presetsStore } from "~/store";
import type { PresetsStore, ProjectConfiguration } from "~/utils/tauri";

export type CreatePreset = {
	name: string;
	config: Omit<ProjectConfiguration, "timeline">;
	default: boolean;
};

export function createPresets() {
	const query = presetsStore.createQuery();
	let projectBaseline: ProjectConfiguration | undefined;

	async function updatePresets<Result>(
		fn: (next: PresetsStore) => Result,
	): Promise<Result> {
		if (query.isLoading) throw new Error("Presets not loaded");

		let p = query.data;
		if (!p) {
			p = { presets: [], default: null, revision: 0 };
			await presetsStore.set(p);
		}

		const newValue = clonePresetValue(p);
		const result = fn(newValue);

		newValue.revision = (p.revision ?? 0) + 1;
		await presetsStore.set(newValue);
		return result;
	}

	return {
		query,
		captureProjectBaseline: (
			config: Omit<ProjectConfiguration, "timeline">,
		) => {
			projectBaseline = createReusablePresetConfig(config as never);
		},
		createPreset: async (preset: CreatePreset) => {
			const config = createReusablePresetConfig(preset.config as never);
			if (config.captions) {
				config.captions.settings.preset = `user:${preset.name}`;
			}

			await updatePresets((store) => {
				store.presets.push({ name: preset.name, config });
				store.default = preset.default
					? store.presets.length - 1
					: store.default;
			});
			projectBaseline = clonePresetValue(config);
		},
		deletePreset: (index: number) =>
			updatePresets((store) => {
				const result = removePresetAndSelectFallback(store, index);
				store.presets = result.store.presets;
				store.default = result.store.default;
				return {
					selectedIndex: result.selectedIndex,
					selectedPreset: result.selectedPreset,
				};
			}),
		setDefault: (index: number) =>
			updatePresets((store) => {
				store.default = index;
			}),
		renamePreset: (index: number, name: string) =>
			updatePresets((store) => {
				store.presets[index].name = name;
				const captions = store.presets[index].config.captions;
				if (captions) captions.settings.preset = `user:${name}`;
			}),
		saveToPreset: (
			index: number,
			config: Omit<ProjectConfiguration, "timeline">,
		) => {
			const preset = query.data?.presets[index];
			if (!preset) throw new Error("Preset not found");
			const reusable = createReusablePresetConfig(config as never);
			const baseline = clonePresetValue(projectBaseline ?? reusable);
			return updatePresets((store) => {
				const entry = store.presets[index];
				if (!entry || entry.name !== preset.name) {
					throw new Error(
						"Preset changed while saving; reopen the menu and try again",
					);
				}
				entry.config = mergeProjectChangesIntoPreset(
					clonePresetValue(unwrap(entry.config)),
					baseline,
					reusable,
					preset.name,
				);
			}).then(() => {
				projectBaseline = reusable;
			});
		},
	};
}

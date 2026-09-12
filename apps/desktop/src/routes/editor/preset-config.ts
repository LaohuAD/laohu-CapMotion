import type { Preset, PresetsStore, ProjectConfiguration } from "~/utils/tauri";
import type { EditorProjectConfiguration } from "./context";
import {
	captionTrackId,
	resolveCaptionTrackFontSize,
} from "./caption-position";

const emptySourceAudioTrack = () => ({
	expanded: false,
	mutedRanges: [],
	cuts: [],
});

function reusableBackgroundSource(
	source: ProjectConfiguration["background"]["source"],
): ProjectConfiguration["background"]["source"] {
	if (source.type === "image" || source.type === "wallpaper") {
		return { type: "wallpaper", path: null };
	}
	return source;
}

const isDesktopBackgroundPath = (path: string | null | undefined) =>
	Boolean(path?.includes("current-desktop-background"));

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const presetValuesEqual = (left: unknown, right: unknown): boolean => {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right)) return false;
		return (
			left.length === right.length &&
			left.every((value, index) => presetValuesEqual(value, right[index]))
		);
	}
	if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every(
			(key) =>
				Object.hasOwn(right, key) && presetValuesEqual(left[key], right[key]),
		)
	);
};

export function clonePresetValue<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => clonePresetValue(item)) as T;
	}
	if (!isPlainRecord(value)) return value;

	const clone: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		clone[key] = clonePresetValue(entry);
	}
	return clone as T;
}

export function removePresetAndSelectFallback(
	store: PresetsStore,
	index: number,
): {
	store: PresetsStore;
	selectedIndex: number | null;
	selectedPreset: Preset | null;
} {
	if (index < 0 || index >= store.presets.length) {
		throw new Error("Preset not found");
	}

	const next = clonePresetValue(store);
	next.presets.splice(index, 1);
	const selectedIndex =
		next.presets.length > 0 ? Math.min(index, next.presets.length - 1) : null;

	if (next.presets.length === 0) {
		next.default = null;
	} else if (store.default !== null) {
		if (index === store.default) {
			next.default = selectedIndex;
		} else {
			next.default = Math.min(
				store.default > index ? store.default - 1 : store.default,
				next.presets.length - 1,
			);
		}
	}

	return {
		store: next,
		selectedIndex,
		selectedPreset:
			selectedIndex === null ? null : (next.presets[selectedIndex] ?? null),
	};
}

/**
 * Merge only the fields changed during the current editor session. `baseline`
 * is the reusable project configuration captured when the editor opened (or
 * after an explicit Apply/Save), `current` is the reusable configuration now,
 * and `saved` is the latest stored preset. This preserves unrelated values
 * that another UI or Agent updated meanwhile.
 */
export function mergeChangedPresetFields<T>(
	saved: T,
	baseline: T,
	current: T,
): T {
	if (presetValuesEqual(baseline, current)) return clonePresetValue(saved);
	if (!isPlainRecord(baseline) || !isPlainRecord(current)) {
		return clonePresetValue(current);
	}

	const result: Record<string, unknown> = isPlainRecord(saved)
		? clonePresetValue(saved)
		: {};
	const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
	for (const key of keys) {
		const hadBaseline = Object.hasOwn(baseline, key);
		const hasCurrent = Object.hasOwn(current, key);
		if (!hasCurrent) {
			if (hadBaseline) delete result[key];
			continue;
		}
		if (!hadBaseline) {
			result[key] = clonePresetValue(current[key]);
			continue;
		}
		result[key] = mergeChangedPresetFields(
			result[key],
			baseline[key],
			current[key],
		);
	}
	return result as T;
}

/**
 * Apply only presentation values that changed after this editor session's
 * baseline was captured. The target preset may have been changed elsewhere in
 * the meantime; untouched values remain owned by the latest saved preset.
 */
export function mergeProjectChangesIntoPreset(
	saved: ProjectConfiguration,
	baseline: ProjectConfiguration,
	current: ProjectConfiguration,
	presetName: string,
): ProjectConfiguration {
	const merged = mergeChangedPresetFields(saved, baseline, current);
	if (merged.captions) {
		merged.captions.settings.preset = `user:${presetName}`;
	}
	return merged;
}

function appliedBackgroundSource(
	projectSource: ProjectConfiguration["background"]["source"],
	presetSource: ProjectConfiguration["background"]["source"],
): ProjectConfiguration["background"]["source"] {
	return presetSource.type === "image" || presetSource.type === "wallpaper"
		? projectSource
		: presetSource;
}

/**
 * Convert an open project into a reusable preference document. The existing
 * store still accepts ProjectConfiguration for backwards compatibility, but
 * project-owned content is removed before the document is persisted.
 */
export function createReusablePresetConfig(
	project: EditorProjectConfiguration,
): ProjectConfiguration {
	const reusable = JSON.parse(JSON.stringify(project)) as ProjectConfiguration;

	reusable.projectRevision = 0;
	reusable.timeline = null;
	reusable.clips = [];
	reusable.annotations = [];
	reusable.keyboard = null;
	reusable.motion = { definitions: [], segments: [], artifacts: [] };
	const source = reusable.background.source;
	const existingBinding = reusable.background.sourceBinding;
	reusable.background.sourceBinding =
		(source.type === "image" || source.type === "wallpaper") &&
		(isDesktopBackgroundPath(source.path) ||
			existingBinding === "currentDesktop")
			? "currentDesktop"
			: null;
	reusable.background.source = reusableBackgroundSource(
		reusable.background.source,
	);
	reusable.background.crop = null;
	reusable.background.notch = null;
	reusable.audio.microphoneTrack = emptySourceAudioTrack();
	reusable.audio.systemAudioTrack = emptySourceAudioTrack();
	if (reusable.captions) {
		const rows = project.timeline?.captionSegments ?? [];
		const settings = reusable.captions.settings;
		const ids = new Set(rows.map((s) => captionTrackId(s.trackId)));
		settings.trackStyles = [
			...(settings.trackStyles ?? []).filter((s) => !ids.has(s.trackId)),
			...[...ids].map((trackId) => ({
				trackId,
				fontSize: resolveCaptionTrackFontSize(
					settings.trackStyles,
					trackId,
					rows,
					settings.size,
				),
			})),
		];
		reusable.captions.segments = [];
		reusable.captions.sourceTimed = true;
	}

	return reusable;
}

/**
 * Presets contain reusable presentation settings, not a second copy of the
 * open project's content. Preserve every project-owned track and revision so
 * an old preset cannot delete edits, captions, or Remotion overlays.
 */
export function mergePresetIntoProject(
	project: EditorProjectConfiguration,
	preset: ProjectConfiguration,
): ProjectConfiguration {
	const captions = project.captions
		? {
				...project.captions,
				settings: {
					...project.captions.settings,
					...(preset.captions?.settings ?? {}),
				},
			}
		: preset.captions
			? { ...preset.captions, segments: [], sourceTimed: true }
			: null;

	return {
		...project,
		aspectRatio: preset.aspectRatio,
		projectRevision: project.projectRevision,
		timeline: project.timeline ?? null,
		clips: project.clips,
		motion: project.motion,
		annotations: project.annotations,
		keyboard: project.keyboard,
		hotkeys: project.hotkeys,
		captions,
		camera: {
			...project.camera,
			...preset.camera,
		},
		cursor: {
			...project.cursor,
			...preset.cursor,
		},
		audio: {
			...project.audio,
			...preset.audio,
			// These tracks contain edits tied to the current recording. Legacy
			// presets predate them, and presentation presets must not replace them.
			microphoneTrack: project.audio.microphoneTrack,
			systemAudioTrack: project.audio.systemAudioTrack,
		},
		background: {
			...project.background,
			...preset.background,
			// File paths belong to the current project. Saved presets may outlive
			// a checkout or worktree and must never reintroduce a dead path.
			source: appliedBackgroundSource(
				project.background.source,
				preset.background.source,
			),
			crop: project.background.crop,
			notch: project.background.notch,
		},
		screenMotionBlur: preset.screenMotionBlur,
		screenMovementSpring: preset.screenMovementSpring,
		colorCorrection: preset.colorCorrection,
	};
}

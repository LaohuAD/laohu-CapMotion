import { describe, expect, it } from "vitest";
import {
	createReusablePresetConfig,
	mergeChangedPresetFields,
	mergePresetIntoProject,
	mergeProjectChangesIntoPreset,
	removePresetAndSelectFallback,
} from "./preset-config";

const project = {
	projectRevision: 28,
	audio: {
		mute: false,
		improve: false,
		micVolumeDb: 0,
		micStereoMode: "stereo",
		systemVolumeDb: 0,
		microphoneTrack: {
			expanded: true,
			mutedRanges: [{ recordingClip: 0, start: 1, end: 2 }],
			cuts: [{ recordingClip: 0, time: 3 }],
		},
		systemAudioTrack: {
			expanded: false,
			mutedRanges: [],
			cuts: [{ recordingClip: 0, time: 4 }],
		},
	},
	timeline: { segments: [{ start: 0, end: 10 }] },
	clips: [{ id: "clip-1" }],
	motion: {
		definitions: [{ id: "motion-1" }],
		segments: [{ id: "motion-segment-1" }],
		artifacts: [{ id: "artifact-1", path: "/current/render.mp4" }],
	},
	annotations: [{ id: "annotation-1" }],
	keyboard: { settings: { enabled: true } },
	hotkeys: { show: true },
	background: {
		source: { type: "wallpaper", path: "/current/project/background.jpg" },
		blur: 8,
	},
	captions: {
		sourceTimed: true,
		segments: [{ id: "caption-1", start: 1, end: 2, text: "保留字幕" }],
		settings: { font: "System Sans-Serif", size: 24 },
	},
};

const legacyPreset = {
	projectRevision: 0,
	audio: {
		mute: true,
		improve: true,
		micVolumeDb: 2,
		micStereoMode: "monoL",
		systemVolumeDb: -3,
	},
	timeline: null,
	clips: [],
	motion: { definitions: [], segments: [] },
	annotations: [],
	keyboard: null,
	hotkeys: { show: false },
	background: {
		source: {
			type: "wallpaper",
			path: "/deleted/.worktrees/old/background.jpg",
		},
		blur: 20,
	},
	captions: {
		sourceTimed: false,
		segments: [],
		settings: { font: "Source Han Sans CN", size: 50, preset: "laohu" },
	},
};

describe("mergePresetIntoProject", () => {
	it("applies reusable styles but preserves project-owned content and revision", () => {
		const merged = mergePresetIntoProject(
			project as never,
			legacyPreset as never,
		) as unknown as typeof project;

		expect(merged.projectRevision).toBe(28);
		expect(merged.audio).toMatchObject({
			mute: true,
			improve: true,
			micVolumeDb: 2,
			micStereoMode: "monoL",
			systemVolumeDb: -3,
		});
		expect(merged.audio.microphoneTrack).toEqual(project.audio.microphoneTrack);
		expect(merged.audio.systemAudioTrack).toEqual(
			project.audio.systemAudioTrack,
		);
		expect(merged.timeline).toEqual(project.timeline);
		expect(merged.clips).toEqual(project.clips);
		expect(merged.motion).toEqual(project.motion);
		expect(merged.captions.segments).toEqual(project.captions.segments);
		expect(merged.captions.sourceTimed).toBe(true);
		expect(merged.captions.settings).toMatchObject({
			font: "Source Han Sans CN",
			size: 50,
			preset: "laohu",
		});
		expect(merged.background.source).toEqual(project.background.source);
		expect(merged.background.blur).toBe(20);
	});

	it("stores only reusable presentation settings", () => {
		const reusable = createReusablePresetConfig(
			project as never,
		) as unknown as typeof project;

		expect(reusable.projectRevision).toBe(0);
		expect(reusable.timeline).toBeNull();
		expect(reusable.clips).toEqual([]);
		expect(reusable.motion).toEqual({
			definitions: [],
			segments: [],
			artifacts: [],
		});
		expect(reusable.annotations).toEqual([]);
		expect(reusable.keyboard).toBeNull();
		expect(reusable.audio.microphoneTrack).toEqual({
			expanded: false,
			mutedRanges: [],
			cuts: [],
		});
		expect(reusable.audio.systemAudioTrack).toEqual({
			expanded: false,
			mutedRanges: [],
			cuts: [],
		});
		expect(reusable.captions.segments).toEqual([]);
		expect(reusable.captions.sourceTimed).toBe(true);
		expect(reusable.background.source).toEqual({
			type: "wallpaper",
			path: null,
		});
	});

	it("keeps portable color backgrounds reusable but rejects file-backed sources", () => {
		const portableProject = {
			...project,
			background: {
				...project.background,
				source: { type: "color", value: [20, 30, 40], alpha: 255 },
			},
		};
		const reusable = createReusablePresetConfig(
			portableProject as never,
		) as unknown as typeof portableProject;
		expect(reusable.background.source).toEqual(
			portableProject.background.source,
		);

		const merged = mergePresetIntoProject(
			project as never,
			reusable as never,
		) as unknown as typeof project;
		expect(merged.background.source).toEqual(portableProject.background.source);
	});

	it("stores the desktop background as a portable binding instead of a project path", () => {
		const desktopProject = {
			...project,
			background: {
				...project.background,
				source: {
					type: "wallpaper",
					path: "/recording/assets/current-desktop-background.jpg",
				},
			},
		};

		const reusable = createReusablePresetConfig(
			desktopProject as never,
		) as unknown as typeof desktopProject & {
			background: { sourceBinding?: string };
		};

		expect(reusable.background.source).toEqual({
			type: "wallpaper",
			path: null,
		});
		expect(reusable.background.sourceBinding).toBe("currentDesktop");
	});

	it("does not apply project-owned keyboard or hotkey data from a preset", () => {
		const merged = mergePresetIntoProject(
			project as never,
			legacyPreset as never,
		) as unknown as typeof project;

		expect(merged.keyboard).toEqual(project.keyboard);
		expect(merged.hotkeys).toEqual(project.hotkeys);
	});
});

describe("mergeChangedPresetFields", () => {
	it("accepts reactive preset values without using the platform structured clone", () => {
		const saved = new Proxy(
			{
				background: { blur: 24 },
				captions: { settings: { size: 64 } },
			},
			{},
		);
		const baseline = {
			background: { blur: 18 },
			captions: { settings: { size: 64 } },
		};
		const current = {
			background: { blur: 18 },
			captions: { settings: { size: 72 } },
		};

		expect(mergeChangedPresetFields(saved, baseline, current)).toEqual({
			background: { blur: 24 },
			captions: { settings: { size: 72 } },
		});
	});

	it("updates only fields changed since the preset was applied", () => {
		const saved = {
			background: { blur: 18, padding: 12 },
			captions: { settings: { size: 64, font: "Source Han Sans CN VF" } },
		};
		const applied = structuredClone(saved);
		const current = structuredClone(applied);
		current.captions.settings.size = 72;

		// The saved preset may have been updated externally after it was applied.
		// A local font-size edit must not roll that unrelated background value back.
		saved.background.blur = 24;

		expect(mergeChangedPresetFields(saved, applied, current)).toEqual({
			background: { blur: 24, padding: 12 },
			captions: {
				settings: { size: 72, font: "Source Han Sans CN VF" },
			},
		});
	});

	it("handles added and removed optional fields without replacing siblings", () => {
		const saved = {
			camera: { size: 40, shadow: 25 },
			captions: { settings: { size: 64, italic: false } },
		};
		const applied = {
			camera: { size: 40, shadow: 20, crop: { x: 0.1 } },
			captions: { settings: { size: 64, italic: false } },
		};
		const current = {
			camera: { size: 40, shadow: 20 },
			captions: {
				settings: { size: 64, italic: false, letterSpacing: 1.5 },
			},
		};

		expect(mergeChangedPresetFields(saved, applied, current)).toEqual({
			camera: { size: 40, shadow: 25 },
			captions: {
				settings: { size: 64, italic: false, letterSpacing: 1.5 },
			},
		});
	});

	it("saves only fields changed during the current editor session", () => {
		const saved = {
			background: { blur: 24, padding: 12 },
			captions: { settings: { size: 64, font: "Source Han Sans CN VF" } },
		};
		const editorOpenBaseline = {
			background: { blur: 10, padding: 12 },
			captions: { settings: { size: 64, font: "Source Han Sans CN VF" } },
		};
		const current = structuredClone(editorOpenBaseline);
		current.captions.settings.size = 72;

		expect(
			mergeProjectChangesIntoPreset(
				saved as never,
				editorOpenBaseline as never,
				current as never,
				"Laohu",
			),
		).toEqual({
			background: { blur: 24, padding: 12 },
			captions: {
				settings: {
					size: 72,
					font: "Source Han Sans CN VF",
					preset: "user:Laohu",
				},
			},
		});
	});
});

describe("removePresetAndSelectFallback", () => {
	it("selects the preset that moves into the deleted preset's position", () => {
		const original = {
			presets: [
				{ name: "A", config: { id: "a" } },
				{ name: "B", config: { id: "b" } },
				{ name: "C", config: { id: "c" } },
			],
			default: 1,
			revision: 4,
		};

		const result = removePresetAndSelectFallback(original as never, 1);

		expect(original.presets.map((preset) => preset.name)).toEqual([
			"A",
			"B",
			"C",
		]);
		expect(result.store.presets.map((preset) => preset.name)).toEqual([
			"A",
			"C",
		]);
		expect(result.selectedIndex).toBe(1);
		expect(result.selectedPreset?.name).toBe("C");
		expect(result.store.default).toBe(1);
	});

	it("selects the previous preset when the last preset is deleted", () => {
		const result = removePresetAndSelectFallback(
			{
				presets: [
					{ name: "A", config: { id: "a" } },
					{ name: "B", config: { id: "b" } },
				],
				default: 0,
				revision: 2,
			} as never,
			1,
		);

		expect(result.selectedIndex).toBe(0);
		expect(result.selectedPreset?.name).toBe("A");
	});

	it("returns no selected preset only after the final preset is deleted", () => {
		const result = removePresetAndSelectFallback(
			{
				presets: [{ name: "A", config: { id: "a" } }],
				default: 0,
				revision: 1,
			} as never,
			0,
		);

		expect(result.store.presets).toEqual([]);
		expect(result.store.default).toBeNull();
		expect(result.selectedIndex).toBeNull();
		expect(result.selectedPreset).toBeNull();
	});
});

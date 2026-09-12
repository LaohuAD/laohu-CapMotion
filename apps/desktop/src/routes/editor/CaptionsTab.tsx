import { Button } from "@cap/ui-solid";
import { Select as KSelect } from "@kobalte/core/select";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { cx } from "cva";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { produce } from "solid-js/store";
import toast from "solid-toast";
import { Toggle } from "~/components/Toggle";
import Tooltip from "~/components/Tooltip";
import { useI18n } from "~/i18n";
import {
	CAPTION_STYLE_PRESETS,
	type CaptionAnimation,
	type CaptionHighlightStyle,
	type CaptionStylePreset,
	defaultCaptionSettings,
	type EditorCaptionSettings,
	getUserCaptionStylePresets,
	normalizeCaptionSettings,
} from "~/store/captions";
import type { OrganizationBrandColorSwatch } from "~/utils/organization-branding";
import { commands, events } from "~/utils/tauri";
import IconCapChevronDown from "~icons/cap/chevron-down";
import IconCapCircleCheck from "~icons/cap/circle-check";
import IconLucideDownload from "~icons/lucide/download";
import IconLucideInfo from "~icons/lucide/info";
import IconLucideTrash2 from "~icons/lucide/trash-2";
import {
	captionTrackId,
	centeredPixelsToNormalized,
	normalizedToCenteredPixels,
	resolveCaptionTrackFontSize,
	resolveCaptionTrackPosition,
	setCaptionTrackFontSize,
	setCaptionTrackPosition,
} from "./caption-position";
import {
	captionTrackPositionLabel,
	groupCaptionSegmentsByTrack,
	shouldMirrorCaptionEditToSource,
} from "./caption-tracks";
import {
	applyCaptionResultToProject,
	CAPTION_MODEL_FOLDER,
	DEFAULT_CAPTION_MODEL,
	DEFAULT_WHISPER_CAPTION_MODEL,
	getCaptionGenerationErrorMessage,
	getModelPath,
	mapEditedTimeToSource,
	PARAKEET_DIR_MODELS,
	resolveCaptionModel,
	sourceCaptionId,
	supportsParakeetTranscription,
	syncCaptionWordsWithText,
	transcribeEditorCaptions,
} from "./captions";
import { useEditorContext } from "./context";
import {
	CAPTION_ANIMATION_OPTIONS,
	CAPTION_HIGHLIGHT_STYLE_OPTIONS,
	CAPTION_POSITION_OPTIONS,
	FONT_OPTIONS,
	getCaptionWeightOptions,
	getTextWeightLabel,
	HexColorInput,
	normalizeCaptionFontWeight,
} from "./text-style";
import {
	Field,
	Input,
	MenuItem,
	MenuItemList,
	PopperContent,
	Slider,
	Subfield,
	topLeftAnimateClasses,
	topSlideAnimateClasses,
} from "./ui";

interface ModelOption {
	name: string;
	label: string;
	modelName: string;
	size: string;
	description: string;
}

interface LanguageOption {
	code: string;
	label: string;
}

const MODEL_DOWNLOAD_STATUS_POLL_MS = 1000;

const MODEL_OPTIONS: ModelOption[] = [
	{
		name: "best",
		label: "Recommended",
		modelName: "parakeet-tdt-0.6b-v3 int8",
		size: "~640MB",
		description: "Best balance for most recordings",
	},
	{
		name: "best-max",
		label: "High Accuracy",
		modelName: "parakeet-tdt-0.6b-v3",
		size: "~2.4GB",
		description: "Larger download, higher accuracy",
	},
	{
		name: "small",
		modelName: "whisper.cpp small",
		label: "Small",
		size: "466MB",
		description: "Smallest download",
	},
	{
		name: "medium",
		modelName: "whisper.cpp medium",
		label: "Medium",
		size: "1.5GB",
		description: "Slower, more accurate",
	},
];

const LANGUAGE_OPTIONS: LanguageOption[] = [
	{ code: "auto", label: "Auto Detect" },
	{ code: "en", label: "English" },
	{ code: "es", label: "Spanish" },
	{ code: "fr", label: "French" },
	{ code: "de", label: "German" },
	{ code: "it", label: "Italian" },
	{ code: "pt", label: "Portuguese" },
	{ code: "nl", label: "Dutch" },
	{ code: "pl", label: "Polish" },
	{ code: "ru", label: "Russian" },
	{ code: "sk", label: "Slovak" },
	{ code: "tr", label: "Turkish" },
	{ code: "ja", label: "Japanese" },
	{ code: "ko", label: "Korean" },
	{ code: "zh", label: "Chinese" },
	{ code: "ar", label: "Arabic" },
	{ code: "hi", label: "Hindi" },
	{ code: "bn", label: "Bengali" },
	{ code: "ta", label: "Tamil" },
	{ code: "te", label: "Telugu" },
	{ code: "mr", label: "Marathi" },
	{ code: "gu", label: "Gujarati" },
	{ code: "pa", label: "Punjabi" },
	{ code: "ur", label: "Urdu" },
	{ code: "fa", label: "Persian" },
	{ code: "he", label: "Hebrew" },
	{ code: "ar", label: "Arabic" },
	{ code: "hi", label: "Hindi" },
	{ code: "bn", label: "Bengali" },
	{ code: "ta", label: "Tamil" },
];

const STYLE_PRESET_KEYS = new Set<keyof EditorCaptionSettings>([
	"font",
	"fontWeight",
	"size",
	"color",
	"backgroundColor",
	"backgroundOpacity",
	"outline",
	"outlineColor",
	"outlineWidth",
	"shadow",
	"shadowColor",
	"shadowOpacity",
	"shadowBlur",
	"shadowDistance",
	"shadowAngle",
	"letterSpacing",
	"highlightColor",
	"activeWordHighlight",
	"highlightStyle",
	"animation",
	"uppercase",
	"fadeDuration",
]);

function hexToRgba(hex: string, opacityPercent: number) {
	const value = hex.replace("#", "");
	const alpha = Math.min(Math.max(opacityPercent / 100, 0), 1);
	if (value.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
	const r = Number.parseInt(value.slice(0, 2), 16);
	const g = Number.parseInt(value.slice(2, 4), 16);
	const b = Number.parseInt(value.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clampDownloadProgress(progress: number) {
	return Math.min(Math.max(progress, 0), 100);
}

function CaptionPresetPreview(props: { preset: CaptionStylePreset }) {
	const style = () => props.preset.style;
	const words = ["Make", "it", "pop"];
	const emphasizeIndex = 2;

	const textShadow = () => {
		const outlineColor = style().outlineColor;
		return style().outline
			? `-1px -1px 0 ${outlineColor}, 1px -1px 0 ${outlineColor}, -1px 1px 0 ${outlineColor}, 1px 1px 0 ${outlineColor}`
			: "0 1px 2px rgba(0, 0, 0, 0.55)";
	};

	return (
		<div
			class="flex h-12 items-center justify-center overflow-hidden rounded-md"
			style={{ background: "linear-gradient(135deg, #4b4f57, #232427)" }}
		>
			<div
				class="flex items-center gap-1 rounded px-2 py-1"
				style={{
					background:
						style().backgroundOpacity > 0
							? hexToRgba(style().backgroundColor, style().backgroundOpacity)
							: "transparent",
				}}
			>
				<For each={words}>
					{(word, index) => {
						const isEmphasized = () =>
							style().activeWordHighlight && index() === emphasizeIndex;
						const usePill = () =>
							isEmphasized() && style().highlightStyle === "pill";
						const useColor = () =>
							isEmphasized() && style().highlightStyle === "color";
						return (
							<span
								style={{
									"font-weight": `${style().fontWeight}`,
									"font-size": "11px",
									"line-height": "1.4",
									"text-transform": style().uppercase ? "uppercase" : "none",
									color: useColor() ? style().highlightColor : style().color,
									"text-shadow": textShadow(),
									background: usePill()
										? style().highlightColor
										: "transparent",
									"border-radius": usePill() ? "4px" : undefined,
									padding: usePill() ? "0 4px" : undefined,
								}}
							>
								{word}
							</span>
						);
					}}
				</For>
			</div>
		</div>
	);
}

export function CaptionsTab(props: {
	brandColorSwatches: OrganizationBrandColorSwatch[];
}) {
	const { text, language } = useI18n();
	const {
		project,
		setProject,
		editorInstance,
		editorState,
		setEditorState,
		presets,
	} = useEditorContext();
	const captionStylePresets = createMemo(() => [
		...CAPTION_STYLE_PRESETS,
		...getUserCaptionStylePresets(presets.query.data),
	]);

	const selectedCaptionIndex = () =>
		editorState.timeline.selection?.type === "caption" &&
		editorState.timeline.selection.indices.length === 1
			? editorState.timeline.selection.indices[0]
			: -1;

	const selectedCaptionSegment = () =>
		project.timeline?.captionSegments?.[selectedCaptionIndex()];

	const updateSelectedCaption = (
		update: (
			segment: NonNullable<ReturnType<typeof selectedCaptionSegment>>,
		) => void,
	) => {
		const index = selectedCaptionIndex();
		if (index < 0) return;

		setProject(
			produce((currentProject: typeof project) => {
				const timeline = currentProject.timeline;
				const timelineSegment = timeline?.captionSegments?.[index];
				if (!timeline || !timelineSegment) return;

				// Apply the edit to the rendered (output-time) segment so style
				// overrides take effect immediately and survive re-derivation.
				update(timelineSegment);
				if (
					!shouldMirrorCaptionEditToSource(currentProject.captions?.displayMode)
				)
					return;

				// Route content/timing onto the source-time caption master so the
				// edit persists across future clip changes. Style overrides stay on
				// the track and are carried across by source id when re-derived.
				const sourceId = sourceCaptionId(timelineSegment.id);
				const source = currentProject.captions?.segments?.find(
					(segment) => segment.id === sourceId,
				);
				if (!source) return;

				const recordingSegments = editorInstance.recordings.segments;
				const sourceRange = { start: source.start, end: source.end };
				const start = mapEditedTimeToSource(
					timelineSegment.start,
					timeline.segments,
					recordingSegments,
					timeline.transitions ?? [],
					sourceRange,
					"outgoing",
					timeline.textSegments,
				);
				const end = mapEditedTimeToSource(
					timelineSegment.end,
					timeline.segments,
					recordingSegments,
					timeline.transitions ?? [],
					sourceRange,
					"outgoing",
					timeline.textSegments,
				);
				if (start !== null) source.start = start;
				if (end !== null) source.end = end;
				source.text = timelineSegment.text;
				source.words = syncCaptionWordsWithText(
					source.text,
					source.words,
					source.start,
					source.end,
				);
			}),
		);
	};

	const getSetting = <K extends keyof EditorCaptionSettings>(
		key: K,
	): NonNullable<EditorCaptionSettings[K]> =>
		(normalizeCaptionSettings(project?.captions?.settings)[key] ??
			defaultCaptionSettings[key]) as NonNullable<EditorCaptionSettings[K]>;

	const updateCaptionSetting = <K extends keyof EditorCaptionSettings>(
		key: K,
		value: EditorCaptionSettings[K],
	) => {
		if (!project?.captions) return;

		setProject(
			"captions",
			"settings",
			produce((settings) => {
				Object.assign(settings, normalizeCaptionSettings(settings));
				settings[key] = value;
				if (key === "shadow" && value === false) {
					settings.outlineShadow = false;
				}
				if (STYLE_PRESET_KEYS.has(key)) {
					settings.preset = "custom";
				}
			}),
		);
	};

	const updateCaptionFont = (font: string) => {
		if (!project?.captions) return;
		setProject(
			"captions",
			"settings",
			produce((settings) => {
				Object.assign(settings, normalizeCaptionSettings(settings));
				settings.font = font;
				settings.fontWeight = normalizeCaptionFontWeight(
					font,
					settings.fontWeight,
				);
				settings.preset = "custom";
			}),
		);
	};

	const captionWeightOptions = () =>
		getCaptionWeightOptions(getSetting("font"));

	const selectedPresetId = () => getSetting("preset");

	const applyCaptionPreset = (preset: CaptionStylePreset) => {
		if (!project?.captions) return;

		setProject(
			"captions",
			"settings",
			produce((settings) => {
				Object.assign(settings, preset.style);
				Object.assign(settings, normalizeCaptionSettings(settings));
				settings.preset = preset.id;
			}),
		);
	};

	const captionPositionCenter = (position: string) => {
		switch (position) {
			case "top-left":
				return { x: 0.05, y: 0.08 };
			case "top-center":
			case "top":
				return { x: 0.5, y: 0.08 };
			case "top-right":
				return { x: 0.95, y: 0.08 };
			case "bottom-left":
				return { x: 0.05, y: 0.85 };
			case "bottom-right":
				return { x: 0.95, y: 0.85 };
			default:
				return { x: 0.5, y: 0.85 };
		}
	};

	const captionPositionTracks = createMemo(() =>
		groupCaptionSegmentsByTrack(project.timeline?.captionSegments ?? []),
	);

	const captionSizeForTrack = (trackId: string) =>
		resolveCaptionTrackFontSize(
			getSetting("trackStyles"),
			trackId,
			project.timeline?.captionSegments ?? [],
			getSetting("size"),
		);
	const updateCaptionTrackSize = (trackId: string, fontSize: number) => {
		setProject(
			produce((current: typeof project) => {
				if (!current.captions) return;
				current.captions.settings.trackStyles = setCaptionTrackFontSize(
					current.captions.settings.trackStyles,
					trackId,
					fontSize,
				);
				current.captions.settings.preset = "custom";
				for (const segment of current.timeline?.captionSegments ?? []) {
					if (captionTrackId(segment.trackId) === trackId)
						segment.fontSizeOverride = null;
				}
			}),
		);
	};

	const captionPositionForTrack = (trackId: string) =>
		resolveCaptionTrackPosition(getSetting("trackPositions"), trackId, {
			position:
				project.timeline?.captionSegments?.find(
					(s) => captionTrackId(s.trackId) === trackId,
				)?.positionOverride ?? getSetting("position"),
			manualPosition:
				project.timeline?.captionSegments?.find(
					(s) => captionTrackId(s.trackId) === trackId,
				)?.manualPositionOverride ?? getSetting("manualPosition"),
		});

	const updateCaptionPosition = (trackId: string, position: string) => {
		if (!project?.captions) return;

		const previous = captionPositionForTrack(trackId);
		setProject(
			produce((currentProject: typeof project) => {
				const settings = currentProject.captions?.settings;
				if (!settings) return;
				const manualPosition =
					position === "manual"
						? (previous.manualPosition ??
							captionPositionCenter(previous.position))
						: previous.manualPosition;
				settings.trackPositions = setCaptionTrackPosition(
					settings.trackPositions,
					trackId,
					{ position, manualPosition },
				);
				for (const segment of currentProject.timeline?.captionSegments ?? []) {
					if (captionTrackId(segment.trackId) !== trackId) continue;
					segment.positionOverride = null;
					segment.manualPositionOverride = null;
				}
			}),
		);
	};

	const updateCaptionManualPosition = (
		trackId: string,
		position: { x: number; y: number },
	) => {
		if (!project?.captions) return;
		setProject(
			produce((currentProject: typeof project) => {
				const settings = currentProject.captions?.settings;
				if (!settings) return;
				settings.trackPositions = setCaptionTrackPosition(
					settings.trackPositions,
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

	const manualPositionPixels = (trackId: string) =>
		normalizedToCenteredPixels(
			captionPositionForTrack(trackId).manualPosition ?? { x: 0.5, y: 0.5 },
		);

	const updateManualCoordinate = (
		trackId: string,
		axis: "x" | "y",
		raw: string,
	) => {
		const value = Number.parseFloat(raw);
		if (!Number.isFinite(value)) return;
		updateCaptionManualPosition(
			trackId,
			centeredPixelsToNormalized({
				...manualPositionPixels(trackId),
				[axis]: value,
			}),
		);
	};

	const [selectedModel, setSelectedModel] = createSignal(
		resolveCaptionModel(DEFAULT_CAPTION_MODEL),
	);
	const [selectedLanguage, setSelectedLanguage] = createSignal("auto");
	const [downloadedModels, setDownloadedModels] = createSignal<string[]>([]);
	const [deletingModel, setDeletingModel] = createSignal<string | null>(null);
	const [downloadMessage, setDownloadMessage] = createSignal("");
	let downloadStatusPoll: ReturnType<typeof setInterval> | undefined;
	let unlistenDownloadProgress: (() => void) | undefined;

	const isDownloading = () => editorState.captions.isDownloading;
	const setIsDownloading = (value: boolean) =>
		setEditorState("captions", "isDownloading", value);
	const downloadProgress = () => editorState.captions.downloadProgress;
	const setDownloadProgress = (value: number) =>
		setEditorState("captions", "downloadProgress", value);
	const downloadPercent = createMemo(() =>
		Math.round(clampDownloadProgress(downloadProgress())),
	);
	const downloadingModel = () => editorState.captions.downloadingModel;
	const setDownloadingModel = (value: string | null) =>
		setEditorState("captions", "downloadingModel", value);
	const isGenerating = () => editorState.captions.isGenerating;
	const setIsGenerating = (value: boolean) =>
		setEditorState("captions", "isGenerating", value);
	const [hasAudio, setHasAudio] = createSignal(false);
	const availableModelOptions = createMemo(() =>
		supportsParakeetTranscription()
			? MODEL_OPTIONS
			: MODEL_OPTIONS.filter((model) => !PARAKEET_DIR_MODELS.has(model.name)),
	);
	const selectedModelOption = createMemo(
		() =>
			availableModelOptions().find((model) => model.name === selectedModel()) ??
			null,
	);
	const downloadingModelOption = createMemo(
		() =>
			availableModelOptions().find(
				(model) => model.name === downloadingModel(),
			) ?? selectedModelOption(),
	);

	createEffect(
		on(
			() => project && editorInstance && !project.captions,
			(shouldInit) => {
				if (shouldInit) {
					setProject("captions", {
						segments: [],
						settings: { ...defaultCaptionSettings },
						sourceTimed: true,
					});
				}
			},
		),
	);

	const getModelDownloadTargetPath = async (modelName: string) => {
		if (PARAKEET_DIR_MODELS.has(modelName))
			return await getModelPath(modelName);

		const appDataDirPath = await appLocalDataDir();
		const modelsPath = await join(appDataDirPath, CAPTION_MODEL_FOLDER);
		return await join(modelsPath, `${modelName}.bin`);
	};

	const checkModelExists = async (modelName: string) => {
		if (PARAKEET_DIR_MODELS.has(modelName)) {
			const modelPath = await getModelDownloadTargetPath(modelName);
			return await commands.checkParakeetModelExists(modelPath);
		}
		const modelPath = await getModelDownloadTargetPath(modelName);
		return await commands.checkModelExists(modelPath);
	};

	const getModelDownloadStatus = async (modelName: string) => {
		const targetPath = await getModelDownloadTargetPath(modelName);
		return await commands.getModelDownloadStatus(targetPath);
	};

	const addDownloadedModel = (modelName: string) => {
		setDownloadedModels((prev) =>
			prev.includes(modelName) ? prev : [...prev, modelName],
		);
	};

	const removeDownloadedModel = (modelName: string) => {
		setDownloadedModels((prev) => prev.filter((name) => name !== modelName));
	};

	const refreshDownloadedModels = async () => {
		const models = await Promise.all(
			availableModelOptions().map(async (model) => {
				const downloaded = await checkModelExists(model.name);
				return { name: model.name, downloaded };
			}),
		);

		setDownloadedModels(
			models.filter((model) => model.downloaded).map((model) => model.name),
		);
	};

	const stopDownloadStatusPolling = () => {
		if (!downloadStatusPoll) return;
		clearInterval(downloadStatusPoll);
		downloadStatusPoll = undefined;
	};

	const syncModelDownloadStatus = async (modelName: string) => {
		const status = await getModelDownloadStatus(modelName);
		if (!status) return false;

		const progress = clampDownloadProgress(status.progress);
		setDownloadMessage(status.message);

		if (status.state === "downloading") {
			setDownloadingModel(modelName);
			setDownloadProgress(progress);
			setIsDownloading(true);
			return true;
		}

		if (status.state === "completed") {
			addDownloadedModel(modelName);
			setDownloadProgress(100);
			setIsDownloading(false);
			setDownloadingModel(null);
			setDownloadMessage("");
			return false;
		}

		setDownloadProgress(0);
		setIsDownloading(false);
		setDownloadingModel(null);
		return false;
	};

	const syncAnyActiveDownloadStatus = async () => {
		for (const model of availableModelOptions()) {
			const active = await syncModelDownloadStatus(model.name);
			if (active) return true;
		}

		return false;
	};

	const pollDownloadStatus = async () => {
		const model = downloadingModel();
		const active = model
			? await syncModelDownloadStatus(model)
			: await syncAnyActiveDownloadStatus();

		if (!active) {
			stopDownloadStatusPolling();
			await refreshDownloadedModels();
		}
	};

	const startDownloadStatusPolling = () => {
		if (downloadStatusPoll) return;
		downloadStatusPoll = setInterval(() => {
			void pollDownloadStatus();
		}, MODEL_DOWNLOAD_STATUS_POLL_MS);
	};

	onMount(async () => {
		try {
			unlistenDownloadProgress = await events.downloadProgress.listen(
				(event) => {
					if (!downloadingModel()) return;
					setDownloadProgress(clampDownloadProgress(event.payload.progress));
					setDownloadMessage(event.payload.message);
				},
			);

			const appDataDirPath = await appLocalDataDir();
			const modelsPath = await join(appDataDirPath, CAPTION_MODEL_FOLDER);

			if (!(await exists(modelsPath))) {
				await commands.createDir(modelsPath, true);
			}

			await refreshDownloadedModels();

			const savedModel = resolveCaptionModel(
				localStorage.getItem("selectedTranscriptionModel"),
			);
			if (
				savedModel &&
				availableModelOptions().some((model) => model.name === savedModel)
			) {
				setSelectedModel(savedModel);
			} else {
				setSelectedModel(
					availableModelOptions()[0]?.name ?? DEFAULT_WHISPER_CAPTION_MODEL,
				);
			}

			const savedLanguage = localStorage.getItem(
				"selectedTranscriptionLanguage",
			);
			if (
				savedLanguage &&
				LANGUAGE_OPTIONS.some((l) => l.code === savedLanguage)
			) {
				setSelectedLanguage(savedLanguage);
			}

			if (editorInstance?.recordings) {
				const hasAudioTrack = editorInstance.recordings.segments.some(
					(segment) => segment.mic !== null || segment.system_audio !== null,
				);
				setHasAudio(hasAudioTrack);
			}

			localStorage.removeItem("modelDownloadState");

			if (await syncAnyActiveDownloadStatus()) {
				startDownloadStatusPolling();
			}
		} catch (error) {
			console.error("Error checking models:", error);
		}
	});

	onCleanup(() => {
		if (unlistenDownloadProgress) unlistenDownloadProgress();
		stopDownloadStatusPolling();
	});

	createEffect(
		on(
			selectedModel,
			(model) => {
				if (model) localStorage.setItem("selectedTranscriptionModel", model);
			},
			{ defer: true },
		),
	);

	createEffect(
		on(
			selectedLanguage,
			(language) => {
				if (language)
					localStorage.setItem("selectedTranscriptionLanguage", language);
			},
			{ defer: true },
		),
	);

	const downloadModel = async () => {
		const modelToDownload = selectedModel();
		try {
			setIsDownloading(true);
			setDownloadProgress(0);
			setDownloadingModel(modelToDownload);
			setDownloadMessage("Preparing model download");
			startDownloadStatusPolling();

			if (PARAKEET_DIR_MODELS.has(modelToDownload)) {
				const modelDir = await getModelDownloadTargetPath(modelToDownload);
				try {
					await commands.createDir(modelDir, true);
				} catch (err) {
					console.error("Error creating directory:", err);
				}
				await commands.downloadParakeetModel(modelDir);
			} else {
				const appDataDirPath = await appLocalDataDir();
				const modelsPath = await join(appDataDirPath, CAPTION_MODEL_FOLDER);
				const modelPath = await getModelDownloadTargetPath(modelToDownload);

				try {
					await commands.createDir(modelsPath, true);
				} catch (err) {
					console.error("Error creating directory:", err);
				}
				await commands.downloadWhisperModel(modelToDownload, modelPath);
			}

			await syncModelDownloadStatus(modelToDownload);
			addDownloadedModel(modelToDownload);
			toast.success(text("Caption model downloaded"));
		} catch (error) {
			console.error("Error downloading model:", error);
			const active = await syncModelDownloadStatus(modelToDownload).catch(
				() => false,
			);
			if (!active) {
				toast.error(text("Failed to download caption model"));
				setDownloadProgress(0);
				setIsDownloading(false);
				setDownloadingModel(null);
			}
		} finally {
			void pollDownloadStatus();
		}
	};

	const deleteModel = async () => {
		const modelToDelete = selectedModel();
		setDeletingModel(modelToDelete);

		try {
			const modelPath = await getModelDownloadTargetPath(modelToDelete);
			if (PARAKEET_DIR_MODELS.has(modelToDelete)) {
				await commands.deleteParakeetModel(modelPath);
			} else {
				await commands.deleteWhisperModel(modelPath);
			}

			removeDownloadedModel(modelToDelete);
			toast.success(text("Caption model deleted"));
		} catch (error) {
			console.error("Error deleting model:", error);
			toast.error(text("Failed to delete caption model"));
			await refreshDownloadedModels();
		} finally {
			setDeletingModel(null);
		}
	};

	const generateCaptions = async () => {
		if (!editorInstance) {
			toast.error(text("Editor instance not found"));
			return;
		}

		setIsGenerating(true);

		try {
			const result = await transcribeEditorCaptions(
				editorInstance.path,
				selectedModel(),
				selectedLanguage(),
			);

			if (result && result.segments.length > 0) {
				setProject(
					produce((p) => {
						applyCaptionResultToProject(
							p,
							result.segments,
							editorInstance.recordings.segments,
							editorInstance.recordingDuration,
						);
					}),
				);
				setEditorState("timeline", "tracks", "caption", true);
				setEditorState("captions", "isStale", false);

				toast.success(text("Captions generated successfully!"));
			} else {
				toast.error(
					"No captions were generated. The audio might be too quiet or unclear.",
				);
			}
		} catch (error) {
			console.error("Error generating captions:", error);
			const errorMessage = getCaptionGenerationErrorMessage(error);
			toast.error(`Failed to generate captions: ${errorMessage}`);
		} finally {
			setIsGenerating(false);
		}
	};

	const hasCaptions = createMemo(
		() =>
			(project.timeline?.captionSegments?.length ?? 0) > 0 ||
			(project.captions?.segments?.length ?? 0) > 0,
	);

	return (
		<Field name="Captions" icon={<IconCapMessageBubble />} badge="Beta">
			<div class="flex flex-col gap-4">
				<div class="space-y-6 transition-all duration-200">
					<div class="space-y-4">
						<Subfield name="Model" class="items-start">
							<KSelect<string>
								options={availableModelOptions().map((model) => model.name)}
								value={selectedModel()}
								onChange={(value: string | null) => {
									if (value) setSelectedModel(value);
								}}
								itemComponent={(props) => {
									const model = availableModelOptions().find(
										(option) => option.name === props.item.rawValue,
									);

									return (
										<MenuItem<typeof KSelect.Item>
											as={KSelect.Item}
											item={props.item}
										>
											<div class="flex w-full items-center gap-3">
												<div class="min-w-0 flex-1">
													<div class="flex items-center gap-1.5 text-gray-12">
														<KSelect.ItemLabel class="truncate font-medium">
															{model?.label ?? props.item.rawValue}
														</KSelect.ItemLabel>
														<Show when={model}>
															<Tooltip openDelay={0} content={model?.modelName}>
																<button
																	type="button"
																	class="flex shrink-0 text-gray-9 transition-colors hover:text-gray-12"
																	onPointerDown={(event) =>
																		event.stopPropagation()
																	}
																	onClick={(event) => event.stopPropagation()}
																>
																	<IconLucideInfo class="size-3.5" />
																</button>
															</Tooltip>
														</Show>
													</div>
													<Show when={model}>
														<div class="truncate text-xs text-gray-11">
															{model?.description}
														</div>
													</Show>
												</div>
												<Show when={model}>
													<span class="shrink-0 text-[10px] text-gray-10">
														{model?.size}
													</span>
												</Show>
											</div>
										</MenuItem>
									);
								}}
							>
								<KSelect.Trigger class="flex min-w-0 flex-row items-center gap-2 rounded-lg border border-gray-3 bg-gray-2 px-3 py-2 text-sm text-gray-12 transition-colors hover:border-gray-4 hover:bg-gray-3 focus:border-blue-9 focus:ring-1 focus:ring-blue-9">
									<div class="min-w-0 flex-1 text-left">
										<div class="flex items-center gap-1.5">
											<span class="truncate font-medium">
												{selectedModelOption()?.label || text("Select a model")}
											</span>
											<Show when={selectedModelOption()}>
												<Tooltip
													openDelay={0}
													content={selectedModelOption()?.modelName}
												>
													<button
														type="button"
														class="flex shrink-0 text-gray-9 transition-colors hover:text-gray-12"
														onPointerDown={(event) => event.stopPropagation()}
														onClick={(event) => event.stopPropagation()}
													>
														<IconLucideInfo class="size-3.5" />
													</button>
												</Tooltip>
											</Show>
										</div>
										<Show when={selectedModelOption()}>
											<div class="truncate text-xs text-gray-11">
												{selectedModelOption()?.description}
											</div>
										</Show>
									</div>
									<Show when={selectedModelOption()}>
										<span class="shrink-0 text-[10px] text-gray-10">
											{selectedModelOption()?.size}
										</span>
									</Show>
									<KSelect.Icon>
										<IconCapChevronDown class="size-4 shrink-0 transform transition-transform data-expanded:rotate-180" />
									</KSelect.Icon>
								</KSelect.Trigger>
								<KSelect.Portal>
									<PopperContent<typeof KSelect.Content>
										as={KSelect.Content}
										class={topLeftAnimateClasses}
									>
										<MenuItemList<typeof KSelect.Listbox>
											as={KSelect.Listbox}
										/>
									</PopperContent>
								</KSelect.Portal>
							</KSelect>
						</Subfield>

						<Show when={!supportsParakeetTranscription()}>
							<p class="text-xs text-gray-10">
								{text(
									"Parakeet caption models are unavailable on Intel Macs. Whisper models remain available.",
								)}
							</p>
						</Show>

						<p class="text-xs leading-relaxed text-gray-10">
							{text(
								"One time download to your system. All captions are stored locally.",
							)}
						</p>

						<Subfield name="Language">
							<KSelect<string>
								options={LANGUAGE_OPTIONS.map((l) => l.code)}
								value={selectedLanguage()}
								onChange={(value: string | null) => {
									if (value) setSelectedLanguage(value);
								}}
								itemComponent={(props) => (
									<MenuItem<typeof KSelect.Item>
										as={KSelect.Item}
										item={props.item}
									>
										<KSelect.ItemLabel class="flex-1">
											{
												LANGUAGE_OPTIONS.find(
													(l) => l.code === props.item.rawValue,
												)?.label
											}
										</KSelect.ItemLabel>
									</MenuItem>
								)}
							>
								<KSelect.Trigger class="flex flex-row items-center h-9 px-3 gap-2 border rounded-lg border-gray-3 bg-gray-2 w-full text-gray-12 text-sm hover:border-gray-4 hover:bg-gray-3 focus:border-blue-9 focus:ring-1 focus:ring-blue-9 transition-colors">
									<KSelect.Value<string> class="flex-1 text-left truncate">
										{(state) => {
											const language = LANGUAGE_OPTIONS.find(
												(l) => l.code === state.selectedOption(),
											);
											return (
												<span>
													{language?.label || text("Select a language")}
												</span>
											);
										}}
									</KSelect.Value>
									<KSelect.Icon>
										<IconCapChevronDown class="size-4 shrink-0 transform transition-transform data-expanded:rotate-180" />
									</KSelect.Icon>
								</KSelect.Trigger>
								<KSelect.Portal>
									<PopperContent<typeof KSelect.Content>
										as={KSelect.Content}
										class={topLeftAnimateClasses}
									>
										<MenuItemList<typeof KSelect.Listbox>
											class="max-h-48 overflow-y-auto"
											as={KSelect.Listbox}
										/>
									</PopperContent>
								</KSelect.Portal>
							</KSelect>
						</Subfield>

						<div class="pt-2">
							<Show
								when={downloadedModels().includes(selectedModel())}
								fallback={
									<div class="space-y-2">
										<Button
											class="w-full flex items-center justify-center gap-2"
											onClick={downloadModel}
											disabled={isDownloading()}
										>
											<Show
												when={isDownloading()}
												fallback={
													<>
														<IconLucideDownload class="size-4" />
														{text("Download")}{" "}
														{
															availableModelOptions().find(
																(m) => m.name === selectedModel(),
															)?.label
														}{" "}
														{text("Model")}
													</>
												}
											>
												{language() === "zh-CN"
													? `正在下载 ${downloadingModelOption()?.label ?? "模型"}… ${downloadPercent()}%`
													: `Downloading ${downloadingModelOption()?.label ?? "model"}... ${downloadPercent()}%`}
											</Show>
										</Button>
										<Show when={isDownloading()}>
											<div class="space-y-1.5">
												<div
													class="w-full bg-gray-3 rounded-full h-1.5 overflow-hidden"
													role="progressbar"
													aria-valuemin="0"
													aria-valuemax="100"
													aria-valuenow={downloadPercent()}
												>
													<div
														class="bg-blue-9 h-1.5 rounded-full transition-all duration-300"
														style={{
															width: `${clampDownloadProgress(downloadProgress())}%`,
														}}
													/>
												</div>
												<p class="text-xs leading-relaxed text-gray-10">
													{downloadMessage() ||
														text(
															"Keep Cap open while the model downloads. Editor reloads will reconnect automatically.",
														)}
												</p>
											</div>
										</Show>
									</div>
								}
							>
								<div class="space-y-2">
									<Show when={hasAudio()}>
										<Button
											onClick={generateCaptions}
											disabled={isGenerating() || deletingModel() !== null}
											class="w-full"
										>
											{isGenerating()
												? text("Generating...")
												: hasCaptions()
													? text("Regenerate Captions")
													: text("Generate Captions")}
										</Button>
									</Show>
									<div class="flex items-center justify-between gap-2 text-xs text-gray-10">
										<span class="flex min-w-0 items-center gap-1.5">
											<IconCapCircleCheck class="size-3.5 shrink-0 text-gray-9" />
											<span class="truncate">
												{language() === "zh-CN"
													? `${selectedModelOption()?.label ?? "字幕"} 模型已下载`
													: `${selectedModelOption()?.label ?? "Caption"} model downloaded`}
											</span>
										</span>
										<Button
											variant="gray"
											size="sm"
											class="shrink-0 gap-1.5 px-2"
											onClick={deleteModel}
											disabled={
												isGenerating() ||
												isDownloading() ||
												deletingModel() === selectedModel()
											}
										>
											<IconLucideTrash2 class="size-3.5" />
											{deletingModel() === selectedModel()
												? text("Deleting...")
												: text("Delete")}
										</Button>
									</div>
								</div>
							</Show>
						</div>
					</div>

					<div
						class={cx(
							"space-y-4",
							!hasCaptions() && "opacity-50 pointer-events-none",
						)}
					>
						<Field name="Style" icon={<IconCapMessageBubble />}>
							<div class="grid grid-cols-2 gap-2">
								<For each={captionStylePresets()}>
									{(preset) => (
										<button
											type="button"
											title={preset.description}
											onClick={() => applyCaptionPreset(preset)}
											disabled={!hasCaptions()}
											class={cx(
												"flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors",
												selectedPresetId() === preset.id
													? "border-blue-9 ring-1 ring-blue-9"
													: "border-gray-3 hover:border-gray-5",
											)}
										>
											<CaptionPresetPreview preset={preset} />
											<span class="px-0.5 text-xs font-medium text-gray-12">
												{text(preset.label)}
											</span>
										</button>
									)}
								</For>
								<Show when={selectedPresetId() === "custom"}>
									<div class="flex flex-col gap-1.5 rounded-lg border border-blue-9 p-1.5 text-left ring-1 ring-blue-9">
										<div class="flex h-12 items-center justify-center rounded-md bg-gray-2 text-xs text-gray-10">
											{text("Custom")}
										</div>
										<span class="px-0.5 text-xs font-medium text-gray-12">
											{text("Custom")}
										</span>
									</div>
								</Show>
							</div>
						</Field>

						<Field name="Font Settings" icon={<IconCapMessageBubble />}>
							<div class="space-y-3">
								<div class="flex flex-col gap-2">
									<span class="text-gray-11 text-sm">
										{text("Font Family")}
									</span>
									<KSelect<string>
										options={FONT_OPTIONS.map((f) => f.value)}
										value={getSetting("font")}
										onChange={(value) => {
											if (value === null) return;
											updateCaptionFont(value);
										}}
										disabled={!hasCaptions()}
										itemComponent={(props) => (
											<MenuItem<typeof KSelect.Item>
												as={KSelect.Item}
												item={props.item}
											>
												<KSelect.ItemLabel class="flex-1">
													{text(
														FONT_OPTIONS.find(
															(f) => f.value === props.item.rawValue,
														)?.label ?? props.item.rawValue,
													)}
												</KSelect.ItemLabel>
											</MenuItem>
										)}
									>
										<KSelect.Trigger class="w-full flex items-center justify-between rounded-lg px-3 py-2 bg-gray-2 border border-gray-3 text-gray-12 hover:border-gray-4 hover:bg-gray-3 focus:border-blue-9 focus:ring-1 focus:ring-blue-9 transition-colors">
											<KSelect.Value<string>>
												{(state) =>
													text(
														FONT_OPTIONS.find(
															(f) => f.value === state.selectedOption(),
														)?.label ?? state.selectedOption(),
													)
												}
											</KSelect.Value>
											<KSelect.Icon>
												<IconCapChevronDown />
											</KSelect.Icon>
										</KSelect.Trigger>
										<KSelect.Portal>
											<PopperContent<typeof KSelect.Content>
												as={KSelect.Content}
												class={topLeftAnimateClasses}
											>
												<MenuItemList<typeof KSelect.Listbox>
													class="max-h-48 overflow-y-auto"
													as={KSelect.Listbox}
												/>
											</PopperContent>
										</KSelect.Portal>
									</KSelect>
								</div>

								<For each={captionPositionTracks()}>
									{(track) => (
										<div class="flex flex-col gap-2">
											<span class="text-gray-11 text-sm">
												{text(track.label)} · {text("Size")} (
												{captionSizeForTrack(track.id)})
											</span>
											<Slider
												value={[captionSizeForTrack(track.id)]}
												onChange={(v) => updateCaptionTrackSize(track.id, v[0])}
												minValue={12}
												maxValue={100}
												step={1}
												disabled={!hasCaptions()}
											/>
										</div>
									)}
								</For>

								<div class="flex items-center justify-between">
									<span class="text-gray-11 text-sm">{text("Uppercase")}</span>
									<Toggle
										checked={getSetting("uppercase")}
										onChange={(checked) =>
											updateCaptionSetting("uppercase", checked)
										}
										disabled={!hasCaptions()}
									/>
								</div>

								<div class="flex flex-col gap-2">
									<div class="flex items-center justify-between">
										<span class="text-gray-11 text-sm">
											{text("Active Word Highlight")}
										</span>
										<Toggle
											checked={getSetting("activeWordHighlight")}
											onChange={(checked) =>
												updateCaptionSetting("activeWordHighlight", checked)
											}
											disabled={!hasCaptions()}
										/>
									</div>
									<p class="text-xs text-gray-10">
										{text(
											"This is the first version of captions in Cap. Active word highlighting may be inaccurate in some situations. We're working on a fix for this and it will be released in upcoming versions.",
										)}
									</p>
								</div>

								<Show when={getSetting("activeWordHighlight")}>
									<div class="flex flex-col gap-2">
										<span class="text-gray-11 text-sm">
											{text("Highlight Style")}
										</span>
										<KSelect<string>
											options={CAPTION_HIGHLIGHT_STYLE_OPTIONS.map(
												(o) => o.value,
											)}
											value={getSetting("highlightStyle")}
											onChange={(value) => {
												if (value === null) return;
												updateCaptionSetting(
													"highlightStyle",
													value as CaptionHighlightStyle,
												);
											}}
											disabled={!hasCaptions()}
											itemComponent={(itemProps) => (
												<MenuItem<typeof KSelect.Item>
													as={KSelect.Item}
													item={itemProps.item}
												>
													<KSelect.ItemLabel class="flex-1">
														{text(
															CAPTION_HIGHLIGHT_STYLE_OPTIONS.find(
																(o) => o.value === itemProps.item.rawValue,
															)?.label ?? itemProps.item.rawValue,
														)}
													</KSelect.ItemLabel>
												</MenuItem>
											)}
										>
											<KSelect.Trigger class="w-full flex items-center justify-between rounded-lg px-3 py-2 bg-gray-2 border border-gray-3 text-gray-12 hover:border-gray-4 hover:bg-gray-3 focus:border-blue-9 focus:ring-1 focus:ring-blue-9 transition-colors">
												<KSelect.Value<string>>
													{(state) =>
														text(
															CAPTION_HIGHLIGHT_STYLE_OPTIONS.find(
																(o) => o.value === state.selectedOption(),
															)?.label ?? state.selectedOption(),
														)
													}
												</KSelect.Value>
												<KSelect.Icon>
													<IconCapChevronDown />
												</KSelect.Icon>
											</KSelect.Trigger>
											<KSelect.Portal>
												<PopperContent<typeof KSelect.Content>
													as={KSelect.Content}
													class={topLeftAnimateClasses}
												>
													<MenuItemList<typeof KSelect.Listbox>
														as={KSelect.Listbox}
													/>
												</PopperContent>
											</KSelect.Portal>
										</KSelect>
									</div>
								</Show>

								<div class="flex flex-col gap-2">
									<span class="text-gray-11 text-sm">{text("Text Color")}</span>
									<HexColorInput
										value={getSetting("color")}
										brandColorSwatches={props.brandColorSwatches}
										onChange={(value) => updateCaptionSetting("color", value)}
									/>
								</div>
							</div>
						</Field>

						<Field name="Background Settings" icon={<IconCapMessageBubble />}>
							<div class="space-y-3">
								<div class="flex flex-col gap-2">
									<span class="text-gray-11 text-sm">
										{text("Background Color")}
									</span>
									<HexColorInput
										value={getSetting("backgroundColor")}
										brandColorSwatches={props.brandColorSwatches}
										onChange={(value) =>
											updateCaptionSetting("backgroundColor", value)
										}
									/>
								</div>

								<div class="flex flex-col gap-2">
									<span class="text-gray-11 text-sm">
										{text("Background Opacity")}
									</span>
									<Slider
										value={[getSetting("backgroundOpacity")]}
										onChange={(v) =>
											updateCaptionSetting("backgroundOpacity", v[0])
										}
										minValue={0}
										maxValue={100}
										step={1}
										disabled={!hasCaptions()}
									/>
								</div>
							</div>
						</Field>

						<Field name="Position" icon={<IconCapMessageBubble />}>
							<div class="space-y-4">
								<For each={captionPositionTracks()}>
									{(track) => (
										<div class="space-y-3 rounded-lg border border-gray-3 bg-gray-2/40 p-3">
											<span class="text-sm font-medium text-gray-12">
												{text(captionTrackPositionLabel(track.id, track.label))}
											</span>
											<KSelect<string>
												options={CAPTION_POSITION_OPTIONS.map((p) => p.value)}
												value={captionPositionForTrack(track.id).position}
												onChange={(value) => {
													if (value === null) return;
													updateCaptionPosition(track.id, value);
												}}
												disabled={!hasCaptions()}
												itemComponent={(props) => (
													<MenuItem<typeof KSelect.Item>
														as={KSelect.Item}
														item={props.item}
													>
														<KSelect.ItemLabel class="flex-1">
															{text(
																CAPTION_POSITION_OPTIONS.find(
																	(p) => p.value === props.item.rawValue,
																)?.label ?? props.item.rawValue,
															)}
														</KSelect.ItemLabel>
													</MenuItem>
												)}
											>
												<KSelect.Trigger class="w-full flex items-center justify-between rounded-lg px-3 py-2 bg-gray-2 border border-gray-3 text-gray-12 hover:border-gray-4 hover:bg-gray-3 focus:border-blue-9 focus:ring-1 focus:ring-blue-9 transition-colors">
													<KSelect.Value<string>>
														{(state) => (
															<span>
																{text(
																	CAPTION_POSITION_OPTIONS.find(
																		(p) => p.value === state.selectedOption(),
																	)?.label ?? state.selectedOption(),
																)}
															</span>
														)}
													</KSelect.Value>
													<KSelect.Icon>
														<IconCapChevronDown />
													</KSelect.Icon>
												</KSelect.Trigger>
												<KSelect.Portal>
													<PopperContent<typeof KSelect.Content>
														as={KSelect.Content}
														class={topLeftAnimateClasses}
													>
														<MenuItemList<typeof KSelect.Listbox>
															as={KSelect.Listbox}
														/>
													</PopperContent>
												</KSelect.Portal>
											</KSelect>
											<Show
												when={
													captionPositionForTrack(track.id).position ===
													"manual"
												}
											>
												<div class="grid grid-cols-2 gap-3">
													<Subfield name="X">
														<Input
															type="number"
															value={manualPositionPixels(track.id).x}
															step="1"
															min={-960}
															max={960}
															onChange={(event) =>
																updateManualCoordinate(
																	track.id,
																	"x",
																	event.currentTarget.value,
																)
															}
														/>
													</Subfield>
													<Subfield name="Y">
														<Input
															type="number"
															value={manualPositionPixels(track.id).y}
															step="1"
															min={-540}
															max={540}
															onChange={(event) =>
																updateManualCoordinate(
																	track.id,
																	"y",
																	event.currentTarget.value,
																)
															}
														/>
													</Subfield>
												</div>
												<p class="text-xs text-gray-10">
													{text(
														"Coordinates use the caption center; the frame center is 0, 0",
													)}
												</p>
											</Show>
										</div>
									)}
								</For>
							</div>
						</Field>

						<Field name="Animation" icon={<IconCapMessageBubble />}>
							<div class="space-y-3">
								<div class="flex flex-col gap-2">
									<span class="text-gray-11 text-sm">
										{text("Animation Style")}
									</span>
									<KSelect<string>
										options={CAPTION_ANIMATION_OPTIONS.map((o) => o.value)}
										value={getSetting("animation")}
										onChange={(value) => {
											if (value === null) return;
											updateCaptionSetting(
												"animation",
												value as CaptionAnimation,
											);
										}}
										disabled={!hasCaptions()}
										itemComponent={(itemProps) => (
											<MenuItem<typeof KSelect.Item>
												as={KSelect.Item}
												item={itemProps.item}
											>
												<KSelect.ItemLabel class="flex-1">
													{text(
														CAPTION_ANIMATION_OPTIONS.find(
															(o) => o.value === itemProps.item.rawValue,
														)?.label ?? itemProps.item.rawValue,
													)}
												</KSelect.ItemLabel>
											</MenuItem>
										)}
									>
										<KSelect.Trigger class="w-full flex items-center justify-between rounded-lg px-3 py-2 bg-gray-2 border border-gray-3 text-gray-12 hover:border-gray-4 hover:bg-gray-3 focus:border-blue-9 focus:ring-1 focus:ring-blue-9 transition-colors">
											<KSelect.Value<string>>
												{(state) =>
													text(
														CAPTION_ANIMATION_OPTIONS.find(
															(o) => o.value === state.selectedOption(),
														)?.label ?? state.selectedOption(),
													)
												}
											</KSelect.Value>
											<KSelect.Icon>
												<IconCapChevronDown />
											</KSelect.Icon>
										</KSelect.Trigger>
										<KSelect.Portal>
											<PopperContent<typeof KSelect.Content>
												as={KSelect.Content}
												class={topLeftAnimateClasses}
											>
												<MenuItemList<typeof KSelect.Listbox>
													as={KSelect.Listbox}
												/>
											</PopperContent>
										</KSelect.Portal>
									</KSelect>
								</div>
								<div class="flex flex-col gap-2">
									<span class="text-gray-11 text-sm">
										{text("Highlight Color")}
									</span>
									<HexColorInput
										value={getSetting("highlightColor")}
										brandColorSwatches={props.brandColorSwatches}
										onChange={(value) =>
											updateCaptionSetting("highlightColor", value)
										}
									/>
								</div>
								<Show when={getSetting("animation") !== "none"}>
									<div class="flex flex-col gap-2">
										<span class="text-gray-11 text-sm">
											{text("Entry Duration")}
										</span>
										<Slider
											value={[getSetting("fadeDuration") * 100]}
											onChange={(v) =>
												updateCaptionSetting("fadeDuration", v[0] / 100)
											}
											minValue={0}
											maxValue={50}
											step={1}
											disabled={!hasCaptions()}
										/>
										<span class="text-xs text-gray-11 text-right">
											{(getSetting("fadeDuration") * 1000).toFixed(0)}ms
										</span>
									</div>
								</Show>
							</div>
						</Field>

						<Field name="Font Weight" icon={<IconCapMessageBubble />}>
							<KSelect
								options={captionWeightOptions()}
								optionValue="value"
								optionTextValue="label"
								value={{
									label: getTextWeightLabel(getSetting("fontWeight")),
									value: normalizeCaptionFontWeight(
										getSetting("font"),
										getSetting("fontWeight"),
									),
								}}
								onChange={(value) => {
									if (!value) return;
									updateCaptionSetting("fontWeight", value.value);
								}}
								disabled={!hasCaptions()}
								itemComponent={(selectItemProps) => (
									<MenuItem<typeof KSelect.Item>
										as={KSelect.Item}
										item={selectItemProps.item}
									>
										<KSelect.ItemLabel class="flex-1">
											{text(selectItemProps.item.rawValue.label)}
										</KSelect.ItemLabel>
										<KSelect.ItemIndicator class="ml-auto text-blue-9">
											<IconCapCircleCheck />
										</KSelect.ItemIndicator>
									</MenuItem>
								)}
							>
								<KSelect.Trigger class="flex w-full items-center justify-between rounded-md border border-gray-3 bg-gray-2 px-3 py-2 text-sm text-gray-12 transition-colors hover:border-gray-4 hover:bg-gray-3 focus:border-blue-9 focus:outline-hidden focus:ring-1 focus:ring-blue-9">
									<KSelect.Value<{
										label: string;
										value: number;
									}> class="truncate">
										{(state) =>
											text(
												state.selectedOption()?.label ??
													getTextWeightLabel(getSetting("fontWeight")),
											)
										}
									</KSelect.Value>
									<KSelect.Icon>
										<IconCapChevronDown class="size-4 shrink-0 transform transition-transform data-expanded:rotate-180 text-(--gray-500)" />
									</KSelect.Icon>
								</KSelect.Trigger>
								<KSelect.Portal>
									<PopperContent<typeof KSelect.Content>
										as={KSelect.Content}
										class={cx(topSlideAnimateClasses, "z-50")}
									>
										<MenuItemList<typeof KSelect.Listbox>
											class="overflow-y-auto max-h-40"
											as={KSelect.Listbox}
										/>
									</PopperContent>
								</KSelect.Portal>
							</KSelect>
						</Field>

						<Field name="Text Effects" icon={<IconCapMessageBubble />}>
							<div class="space-y-4">
								<div class="flex flex-col gap-2">
									<div class="flex items-center justify-between text-sm text-gray-11">
										<span>{text("Letter Spacing")}</span>
										<span>{getSetting("letterSpacing").toFixed(1)} px</span>
									</div>
									<Slider
										value={[getSetting("letterSpacing")]}
										onChange={(value) =>
											updateCaptionSetting("letterSpacing", value[0])
										}
										minValue={-2}
										maxValue={12}
										step={0.1}
										disabled={!hasCaptions()}
									/>
								</div>

								<div class="flex items-center justify-between">
									<span class="text-sm text-gray-11">{text("Outline")}</span>
									<Toggle
										checked={getSetting("outline")}
										onChange={(checked) =>
											updateCaptionSetting("outline", checked)
										}
										disabled={!hasCaptions()}
									/>
								</div>
								<Show when={getSetting("outline")}>
									<div class="grid grid-cols-2 gap-3">
										<div class="flex flex-col gap-2">
											<span class="text-sm text-gray-11">
												{text("Outline Color")}
											</span>
											<HexColorInput
												value={getSetting("outlineColor")}
												brandColorSwatches={props.brandColorSwatches}
												onChange={(value) =>
													updateCaptionSetting("outlineColor", value)
												}
											/>
										</div>
										<div class="flex flex-col gap-2">
											<span class="text-sm text-gray-11">
												{text("Outline Width")} ·{" "}
												{getSetting("outlineWidth").toFixed(1)} px
											</span>
											<Slider
												value={[getSetting("outlineWidth")]}
												onChange={(value) =>
													updateCaptionSetting("outlineWidth", value[0])
												}
												minValue={0}
												maxValue={10}
												step={0.1}
											/>
										</div>
									</div>
								</Show>

								<div class="flex items-center justify-between">
									<span class="text-sm text-gray-11">{text("Shadow")}</span>
									<Toggle
										checked={getSetting("shadow")}
										onChange={(checked) =>
											updateCaptionSetting("shadow", checked)
										}
										disabled={!hasCaptions()}
									/>
								</div>
								<p class="text-xs leading-5 text-gray-10">
									{text(
										"When an outline is enabled, the shadow expands from the outline edge.",
									)}
								</p>
								<Show when={getSetting("shadow")}>
									<div class="space-y-3">
										<div class="flex flex-col gap-2">
											<span class="text-sm text-gray-11">
												{text("Shadow Color")}
											</span>
											<HexColorInput
												value={getSetting("shadowColor")}
												brandColorSwatches={props.brandColorSwatches}
												onChange={(value) =>
													updateCaptionSetting("shadowColor", value)
												}
											/>
										</div>
										{(
											[
												["Shadow Opacity", "shadowOpacity", 0, 100, 1, "%"],
												["Shadow Blur", "shadowBlur", 0, 40, 1, "px"],
												["Shadow Distance", "shadowDistance", 0, 30, 1, "px"],
												["Shadow Angle", "shadowAngle", -180, 180, 1, "°"],
											] as const
										).map(([label, key, min, max, step, suffix]) => (
											<div class="flex flex-col gap-2">
												<div class="flex items-center justify-between text-sm text-gray-11">
													<span>{text(label)}</span>
													<span>
														{getSetting(key).toFixed(0)}
														{suffix}
													</span>
												</div>
												<Slider
													value={[getSetting(key)]}
													onChange={(value) =>
														updateCaptionSetting(key, value[0])
													}
													minValue={min}
													maxValue={max}
													step={step}
												/>
											</div>
										))}
									</div>
								</Show>
							</div>
						</Field>

						<Field name="Export Options" icon={<IconCapMessageBubble />}>
							<Subfield name="Export with Subtitles">
								<Toggle
									checked={getSetting("exportWithSubtitles")}
									onChange={(checked) =>
										updateCaptionSetting("exportWithSubtitles", checked)
									}
									disabled={!hasCaptions()}
								/>
							</Subfield>
						</Field>
					</div>

					<Show
						when={
							editorState.timeline.selection?.type === "caption" &&
							editorState.timeline.selection.indices.length === 1
						}
					>
						{(() => {
							return (
								<Field name="Selected Caption" icon={<IconCapMessageBubble />}>
									<Show when={selectedCaptionSegment()}>
										{(seg) => (
											<div class="space-y-3">
												<Subfield name="Start Time">
													<Input
														type="number"
														value={seg().start.toFixed(2)}
														step="0.1"
														min={0}
														onChange={(e) =>
															updateSelectedCaption((segment) => {
																segment.start = Number.parseFloat(
																	e.target.value,
																);
															})
														}
													/>
												</Subfield>
												<Subfield name="End Time">
													<Input
														type="number"
														value={seg().end.toFixed(2)}
														step="0.1"
														min={seg().start}
														onChange={(e) =>
															updateSelectedCaption((segment) => {
																segment.end = Number.parseFloat(e.target.value);
															})
														}
													/>
												</Subfield>
												<Subfield name="Caption Text">
													<Input
														type="text"
														value={seg().text}
														onChange={(e) =>
															updateSelectedCaption((segment) => {
																segment.text = e.target.value;
																segment.words = syncCaptionWordsWithText(
																	e.target.value,
																	segment.words,
																	segment.start,
																	segment.end,
																);
															})
														}
													/>
												</Subfield>
											</div>
										)}
									</Show>
								</Field>
							);
						})()}
					</Show>
				</div>
			</div>
		</Field>
	);
}

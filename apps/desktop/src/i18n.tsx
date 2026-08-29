import {
	createContext,
	createEffect,
	createSignal,
	type ParentProps,
	useContext,
} from "solid-js";
import { generalSettingsStore } from "~/store";

export type AppLanguage = "en" | "zh-CN";

const en = {
	"language.title": "Choose your language",
	"language.description": "You can change this later in Settings",
	"language.english": "English",
	"language.chinese": "简体中文",
	"language.continue": "Continue",
	"settings.language.title": "Language",
	"settings.language.description": "Choose the language used across Cap",
	"settings.language.label": "Display language",
	"settings.language.hint":
		"Changes apply immediately and are saved for the next launch",
	"settings.appearance.title": "Appearance",
	"settings.appearance.description":
		"Match Cap to your system theme or pick a fixed look",
	"settings.theme.system": "System",
	"settings.theme.light": "Light",
	"settings.theme.dark": "Dark",
	"settings.nav.general": "General",
	"settings.nav.shortcuts": "Shortcuts",
	"settings.nav.cli": "CLI",
	"settings.nav.recordings": "Recordings",
	"settings.nav.screenshots": "Screenshots",
	"settings.nav.automations": "Automations",
	"settings.nav.transcription": "Transcription",
	"settings.nav.integrations": "Integrations",
	"settings.nav.license": "License",
	"settings.nav.experimental": "Experimental",
	"settings.nav.feedback": "Feedback",
	"settings.nav.changelog": "Changelog",
	"shortcuts.title": "Keyboard shortcuts",
	"shortcuts.description":
		"Set global shortcuts for recording and capture actions",
	"shortcuts.manualZoom": "Toggle manual recording zoom",
	"onboarding.welcome.title": "Welcome to Cap",
	"onboarding.welcome.description":
		"Record, edit, and share beautiful screen recordings",
	"onboarding.welcome.owned": "Beautiful screen recordings owned by you",
	"onboarding.getStarted": "Get started",
	"onboarding.continue": "Continue",
	"onboarding.continueToCap": "Continue to Cap",
	"onboarding.startUsing": "Start using Cap",
	"onboarding.back": "Back",
	"onboarding.skip": "Skip onboarding",
	"onboarding.keyboardHint": "Press Enter or use the left and right arrow keys",
	"onboarding.permissions.title": "Set up permissions",
	"onboarding.permissions.description":
		"Cap needs a few permissions to record your screen and capture audio",
	"onboarding.permissions.screen.name": "Screen recording",
	"onboarding.permissions.screen.description":
		"Allow Cap to record the screen or area you select",
	"onboarding.permissions.accessibility.name": "Accessibility",
	"onboarding.permissions.accessibility.description":
		"Used locally to capture mouse activity and create zoom segments",
	"onboarding.permissions.microphone.name": "Microphone",
	"onboarding.permissions.microphone.description":
		"Optional permission for recording your voice",
	"onboarding.permissions.camera.name": "Camera",
	"onboarding.permissions.camera.description":
		"Optional permission for recording your camera",
	"onboarding.permissions.optional": "Optional",
	"onboarding.permissions.granted": "Granted",
	"onboarding.permissions.grant": "Grant",
	"onboarding.permissions.openSettings": "Open settings",
	"onboarding.modes.title": "Three ways to capture",
	"onboarding.modes.description":
		"Choose the workflow that matches what you are making",
	"onboarding.modes.overviewTitle": "One app every workflow",
	"onboarding.modes.overviewDescription":
		"Whether you need speed studio quality or a quick screenshot Cap has a mode for it",
	"onboarding.mode.instant.title": "Instant mode",
	"onboarding.mode.instant.tagline": "Record and share in seconds",
	"onboarding.mode.instant.description":
		"Your recording uploads while you capture so a shareable link is ready as soon as you stop",
	"onboarding.mode.instant.feature1": "Instant shareable link",
	"onboarding.mode.instant.feature2": "Background uploading",
	"onboarding.mode.instant.feature3": "AI transcription and summary",
	"onboarding.mode.instant.feature4": "Browser-based playback",
	"onboarding.mode.studio.title": "Studio mode",
	"onboarding.mode.studio.tagline":
		"Editable recording with professional tools",
	"onboarding.mode.studio.description":
		"Record locally at full quality then edit backgrounds padding cursor effects zooms and more",
	"onboarding.mode.studio.feature1": "Full-quality local recording",
	"onboarding.mode.studio.feature2": "Built-in editor and effects",
	"onboarding.mode.studio.feature3": "Custom backgrounds and padding",
	"onboarding.mode.studio.feature4": "Export or share when ready",
	"onboarding.mode.screenshot.title": "Screenshot mode",
	"onboarding.mode.screenshot.tagline": "Capture and beautify instantly",
	"onboarding.mode.screenshot.description":
		"Take screenshots with a shortcut add annotations and backgrounds then copy save or share",
	"onboarding.mode.screenshot.feature1": "Instant shortcut capture",
	"onboarding.mode.screenshot.feature2": "Annotation and drawing tools",
	"onboarding.mode.screenshot.feature3": "Beautiful backgrounds",
	"onboarding.mode.screenshot.feature4": "Copy save or share",
	"onboarding.toggle.title": "Switch modes anytime",
	"onboarding.toggle.description":
		"Switch workflows with one click from the main Cap window",
	"onboarding.customize.title": "Make Cap yours",
	"onboarding.customize.description":
		"Customize shortcuts storage and recording preferences to fit your workflow",
	"onboarding.customize.shortcuts.title": "Keyboard shortcuts",
	"onboarding.customize.shortcuts.description":
		"Global shortcuts for recording screenshots switching modes and manual zoom",
	"onboarding.customize.storage.title": "Custom S3 storage",
	"onboarding.customize.storage.description":
		"Connect an S3-compatible bucket and control where recordings are stored",
	"onboarding.customize.domain.title": "Custom domain",
	"onboarding.customize.domain.description":
		"Use your own domain for shareable links instead of cap.so",
	"onboarding.customize.recording.title": "Recording preferences",
	"onboarding.customize.recording.description":
		"Configure frame rate quality countdown cursor effects zoom and more",
	"onboarding.customize.hint": "You can change any of these later in Settings",
	"onboarding.faq.title": "Frequently asked questions",
	"onboarding.faq.description": "What you need to know before getting started",
	"onboarding.faq.free.question": "Is Cap free to use",
	"onboarding.faq.free.answer":
		"Cap is free for personal use Teams and commercial use can choose a paid plan",
	"onboarding.faq.modes.question":
		"What is the difference between Instant and Studio",
	"onboarding.faq.modes.answer":
		"Instant uploads while recording and gives you a link immediately Studio records locally at full quality and lets you edit before export",
	"onboarding.faq.storage.question": "Where are my recordings stored",
	"onboarding.faq.storage.answer":
		"All recordings are stored locally Instant recordings can also be uploaded for sharing You can manage storage in Settings",
	"onboarding.faq.shortcuts.question": "Can I change shortcuts later",
	"onboarding.faq.shortcuts.answer":
		"Yes Open Settings then Shortcuts to customize every keyboard shortcut including manual zoom",
	"onboarding.faq.sharing.question": "How does sharing work",
	"onboarding.faq.sharing.answer":
		"Instant creates a link when recording stops Studio lets you export the edited video to Cap cloud or local storage",
	"onboarding.faq.pricing": "View pricing plans",
	"manualZoom.overlay": "REC FRAME",
} as const;

const zhCN: Record<keyof typeof en, string> = {
	"language.title": "选择界面语言",
	"language.description": "以后可以在设置中随时修改",
	"language.english": "English",
	"language.chinese": "简体中文",
	"language.continue": "继续",
	"settings.language.title": "语言",
	"settings.language.description": "选择 Cap 整个界面使用的语言",
	"settings.language.label": "显示语言",
	"settings.language.hint": "修改后立即生效，并会保存到下次启动",
	"settings.appearance.title": "外观",
	"settings.appearance.description": "跟随系统主题，或选择固定的深浅外观",
	"settings.theme.system": "跟随系统",
	"settings.theme.light": "浅色",
	"settings.theme.dark": "深色",
	"settings.nav.general": "通用",
	"settings.nav.shortcuts": "快捷键",
	"settings.nav.cli": "CLI",
	"settings.nav.recordings": "录制",
	"settings.nav.screenshots": "截图",
	"settings.nav.automations": "自动化",
	"settings.nav.transcription": "转录与字幕",
	"settings.nav.integrations": "集成",
	"settings.nav.license": "授权",
	"settings.nav.experimental": "实验功能",
	"settings.nav.feedback": "反馈",
	"settings.nav.changelog": "更新日志",
	"shortcuts.title": "键盘快捷键",
	"shortcuts.description": "为录制和截图动作设置全局快捷键",
	"shortcuts.manualZoom": "切换手动录制放大",
	"onboarding.welcome.title": "欢迎使用 Cap",
	"onboarding.welcome.description": "录制、编辑和分享精美的屏幕视频",
	"onboarding.welcome.owned": "精美的屏幕录像，由你完全掌控",
	"onboarding.getStarted": "开始使用",
	"onboarding.continue": "继续",
	"onboarding.continueToCap": "进入 Cap",
	"onboarding.startUsing": "开始使用 Cap",
	"onboarding.back": "返回",
	"onboarding.skip": "跳过引导",
	"onboarding.keyboardHint": "按回车键，或使用左右方向键",
	"onboarding.permissions.title": "设置权限",
	"onboarding.permissions.description": "Cap 需要一些权限来录制屏幕和声音",
	"onboarding.permissions.screen.name": "屏幕录制",
	"onboarding.permissions.screen.description":
		"允许 Cap 录制你选择的屏幕或区域",
	"onboarding.permissions.accessibility.name": "辅助功能",
	"onboarding.permissions.accessibility.description":
		"仅在本地捕捉鼠标活动，并生成可编辑的放大片段",
	"onboarding.permissions.microphone.name": "麦克风",
	"onboarding.permissions.microphone.description": "用于录制你的声音，可选",
	"onboarding.permissions.camera.name": "摄像头",
	"onboarding.permissions.camera.description": "用于录制摄像头画面，可选",
	"onboarding.permissions.optional": "可选",
	"onboarding.permissions.granted": "已授权",
	"onboarding.permissions.grant": "授权",
	"onboarding.permissions.openSettings": "打开系统设置",
	"onboarding.modes.title": "三种捕捉方式",
	"onboarding.modes.description": "根据你要制作的内容选择合适流程",
	"onboarding.modes.overviewTitle": "一个应用，覆盖所有工作流",
	"onboarding.modes.overviewDescription":
		"无论你需要快速分享、专业编辑还是快速截图，Cap 都有合适的模式",
	"onboarding.mode.instant.title": "快速录制",
	"onboarding.mode.instant.tagline": "录完即可分享",
	"onboarding.mode.instant.description":
		"录制的同时在后台上传，停止录制后立即得到可分享链接",
	"onboarding.mode.instant.feature1": "立即生成分享链接",
	"onboarding.mode.instant.feature2": "录制时后台上传",
	"onboarding.mode.instant.feature3": "AI 转录与摘要",
	"onboarding.mode.instant.feature4": "浏览器在线播放",
	"onboarding.mode.studio.title": "专业录制",
	"onboarding.mode.studio.tagline": "可编辑的录制与专业工具",
	"onboarding.mode.studio.description":
		"在本地以完整质量录制，再编辑背景、留白、鼠标效果、放大片段等内容",
	"onboarding.mode.studio.feature1": "本地高质量录制",
	"onboarding.mode.studio.feature2": "内置编辑器与效果",
	"onboarding.mode.studio.feature3": "自定义背景与留白",
	"onboarding.mode.studio.feature4": "确认后再导出或分享",
	"onboarding.mode.screenshot.title": "截图模式",
	"onboarding.mode.screenshot.tagline": "快速截取并美化",
	"onboarding.mode.screenshot.description":
		"用快捷键截图，添加标注和背景，然后复制、保存或分享",
	"onboarding.mode.screenshot.feature1": "快捷键即时截图",
	"onboarding.mode.screenshot.feature2": "标注与绘图工具",
	"onboarding.mode.screenshot.feature3": "精美的背景效果",
	"onboarding.mode.screenshot.feature4": "复制、保存或分享",
	"onboarding.toggle.title": "随时切换模式",
	"onboarding.toggle.description": "在 Cap 主窗口点击一次即可切换工作流",
	"onboarding.customize.title": "让 Cap 适合你的习惯",
	"onboarding.customize.description":
		"自定义快捷键、存储和录制偏好，让 Cap 贴合你的工作流",
	"onboarding.customize.shortcuts.title": "键盘快捷键",
	"onboarding.customize.shortcuts.description":
		"设置录制、截图、切换模式和手动放大的全局快捷键",
	"onboarding.customize.storage.title": "自定义 S3 存储",
	"onboarding.customize.storage.description":
		"连接兼容 S3 的存储桶，自主掌控录制文件的存放位置",
	"onboarding.customize.domain.title": "自定义域名",
	"onboarding.customize.domain.description":
		"分享链接可使用你自己的域名，而不是 cap.so",
	"onboarding.customize.recording.title": "录制偏好",
	"onboarding.customize.recording.description":
		"设置帧率、质量、倒计时、鼠标效果、放大倍数等内容",
	"onboarding.customize.hint": "以上选项以后都可在设置中修改",
	"onboarding.faq.title": "常见问题",
	"onboarding.faq.description": "开始使用前你需要了解的内容",
	"onboarding.faq.free.question": "Cap 可以免费使用吗",
	"onboarding.faq.free.answer":
		"Cap 个人使用免费，团队和商业用途可以选择付费方案",
	"onboarding.faq.modes.question": "快速录制和专业录制有什么区别",
	"onboarding.faq.modes.answer":
		"快速录制会边录边上传，停止后立即得到链接；专业录制会以完整质量保存在本地，并允许编辑后再导出",
	"onboarding.faq.storage.question": "录制文件保存在哪里",
	"onboarding.faq.storage.answer":
		"所有录制都会保存在本地，快速录制还可上传到云端便于分享，你可以在设置中管理存储位置",
	"onboarding.faq.shortcuts.question": "以后还能修改快捷键吗",
	"onboarding.faq.shortcuts.answer":
		"可以，打开“设置 → 快捷键”即可修改所有快捷键，包括手动放大",
	"onboarding.faq.sharing.question": "视频如何分享",
	"onboarding.faq.sharing.answer":
		"快速录制在停止时会生成链接；专业录制可把编辑后的视频导出到 Cap 云端或本地",
	"onboarding.faq.pricing": "查看付费方案",
	"manualZoom.overlay": "录制取景框",
};

export type TranslationKey = keyof typeof en;

export function translate(language: AppLanguage, key: TranslationKey): string {
	return (language === "zh-CN" ? zhCN : en)[key];
}

type I18nContextValue = {
	ready: () => boolean;
	language: () => AppLanguage;
	languageSelected: () => boolean;
	t: (key: TranslationKey) => string;
	setLanguage: (language: AppLanguage) => Promise<void>;
};

const I18nContext = createContext<I18nContextValue>();

export function I18nProvider(props: ParentProps) {
	const settings = generalSettingsStore.createQuery();
	const [optimisticLanguage, setOptimisticLanguage] =
		createSignal<AppLanguage>();
	const language = (): AppLanguage =>
		optimisticLanguage() ?? settings.data?.uiLanguage ?? "en";
	const languageSelected = () =>
		optimisticLanguage() !== undefined || settings.data?.uiLanguage != null;

	createEffect(() => {
		document.documentElement.lang = language();
	});

	const setLanguage = async (next: AppLanguage) => {
		const previous = optimisticLanguage();
		setOptimisticLanguage(next);
		try {
			await generalSettingsStore.set({ uiLanguage: next });
		} catch (error) {
			setOptimisticLanguage(previous);
			throw error;
		}
	};

	return (
		<I18nContext.Provider
			value={{
				ready: () => settings.data !== undefined,
				language,
				languageSelected,
				t: (key) => translate(language(), key),
				setLanguage,
			}}
		>
			{props.children}
		</I18nContext.Provider>
	);
}

export function useI18n() {
	const context = useContext(I18nContext);
	if (!context) throw new Error("useI18n must be used inside I18nProvider");
	return context;
}

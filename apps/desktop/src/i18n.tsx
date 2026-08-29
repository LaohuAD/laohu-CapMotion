import {
	createContext,
	createEffect,
	createSignal,
	type ParentProps,
	useContext,
} from "solid-js";
import { generalSettingsStore } from "~/store";
import { translateLiteral } from "./i18n-literals";

export type AppLanguage = "en" | "zh-CN";

export type EditorSelectionKind =
	| "caption"
	| "keyboard"
	| "text"
	| "audio"
	| "motion"
	| "mask"
	| "zoom"
	| "3D"
	| "scene";

const zhSelectionKinds: Record<EditorSelectionKind, string> = {
	caption: "字幕",
	keyboard: "键盘",
	text: "文字",
	audio: "音频",
	motion: "动画",
	mask: "遮罩",
	zoom: "放大",
	"3D": "3D",
	scene: "场景",
};

export function formatEditorSelection(
	language: AppLanguage,
	count: number,
	kind: EditorSelectionKind,
	total?: number,
): string {
	if (language === "zh-CN") {
		const noun = zhSelectionKinds[kind];
		if (total !== undefined && count === total)
			return `已选择全部 ${total} 个${noun}片段`;
		if (total !== undefined) return `已选择 ${count}/${total} 个${noun}片段`;
		return `已选择 ${count} 个${noun}片段`;
	}

	const noun = `${kind} segment${count === 1 ? "" : "s"}`;
	if (total !== undefined && count === total)
		return `All ${total} ${kind} segments selected`;
	if (total !== undefined)
		return `${count} of ${total} ${kind} segments selected`;
	return `${count} ${noun} selected`;
}

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
	"shortcuts.action.screenshotDisplay": "Screenshot current display",
	"shortcuts.action.screenshotWindow": "Screenshot current window",
	"shortcuts.action.screenshotArea": "Screenshot area picker",
	"shortcuts.action.openRecordingPicker": "Open recording picker",
	"shortcuts.action.stopRecording": "Stop recording",
	"shortcuts.action.restartRecording": "Restart recording",
	"shortcuts.action.togglePauseRecording": "Pause/resume recording",
	"shortcuts.action.cycleRecordingMode": "Cycle recording mode",
	"shortcuts.action.openRecordingPickerDisplay": "Record display",
	"shortcuts.action.openRecordingPickerWindow": "Record window",
	"shortcuts.action.openRecordingPickerArea": "Record area",
	"shortcuts.none": "None",
	"shortcuts.setPrompt": "Set hotkeys...",
	"settings.account.clickToSignIn": "Click to sign in",
	"settings.account.signedIn": "Signed in",
	"settings.account.label": "Account",
	"settings.account.signIn": "Sign In",
	"settings.account.signOut": "Sign Out",
	"settings.account.previousVersions": "View previous versions",
	"settings.account.checkUpdates": "Check for updates",
	"settings.account.checkingUpdates": "Checking for updates...",
	"settings.account.versionCopied": "Version copied to clipboard",
	"settings.account.versionCopyFailed": "Failed to copy version",
	"settings.account.upToDateTitle": "Cap is up to date",
	"settings.account.upToDateMessage":
		"You already have the latest version of Cap.",
	"settings.account.updateAvailableTitle": "Update available",
	"settings.account.updateCheckFailedTitle": "Unable to check for updates",
	"settings.account.updateCheckFailedMessage":
		"Couldn't check for updates automatically. You can download the latest version of Cap from cap.so/download — your data won't be lost.",
	"settings.projectName.title": "Default project name",
	"settings.projectName.description":
		"Template used for new recordings and exported files.",
	"settings.projectName.availablePlaceholders": "Available placeholders",
	"settings.projectName.placeholderHint":
		"Click any placeholder to copy it. Time supports custom formats via {moment:HH:mm}.",
	"settings.projectName.recordingMode": "Recording mode",
	"settings.projectName.target": "Target",
	"settings.projectName.dateTime": "Date & time",
	"settings.projectName.targetNameHint": "Monitor name or window title.",
	"settings.storage.title": "Storage",
	"settings.storage.description": "Where Cap saves your recordings.",
	"settings.storage.default": "Default (Application Support)",
	"settings.storage.reset": "Reset to Default",
	"settings.excludedWindows.title": "Excluded windows",
	"settings.excludedWindows.description": "Hide windows from recordings.",
	"settings.excludedWindows.windowsDescription":
		"Hide windows from recordings. On Windows, only Cap-related windows can be excluded.",
	"settings.excludedWindows.recommendedMissing":
		"Recommended Cap windows are not excluded",
	"settings.excludedWindows.recommendedMissingDescription":
		"Camera, settings, or recording windows can appear as black boxes in screen recordings. Missing:",
	"settings.excludedWindows.restore": "Restore",
	"settings.excludedWindows.empty": "No windows are currently excluded.",
	"settings.excludedWindows.remove": "Remove excluded window",
	"settings.app.title": "App",
	"settings.app.description": "Choose how Cap shows up on your system.",
	"settings.app.dockIcon": "Always show dock icon",
	"settings.app.dockIconDescription":
		"Keep Cap in the dock even when no windows are open.",
	"settings.app.notifications": "System notifications",
	"settings.app.notificationsDescription":
		"Show notifications for clipboard copies, saved files, and more. You may need to allow Cap in your system's notification settings.",
	"settings.recording.title": "Recording",
	"settings.recording.description":
		"Behaviour while you record and after you stop.",
	"settings.recording.countdown": "Countdown",
	"settings.recording.countdownDescription":
		"Wait before the recording starts.",
	"settings.recording.seconds3": "3 seconds",
	"settings.recording.seconds5": "5 seconds",
	"settings.recording.seconds10": "10 seconds",
	"settings.recording.confirmNoMic":
		"Confirm before recording without a microphone",
	"settings.recording.confirmNoMicDescription":
		"Require confirmation when no microphone is selected or the selected microphone is unavailable.",
	"settings.recording.mainWindow": "Main window when recording starts",
	"settings.recording.mainWindowDescription":
		"What happens to the main window once a recording begins.",
	"settings.recording.close": "Close",
	"settings.recording.minimise": "Minimise",
	"settings.recording.afterStudio": "After a Studio recording",
	"settings.recording.afterStudioDescription":
		"What happens once you stop a Studio recording.",
	"settings.recording.openEditor": "Open editor",
	"settings.recording.showOverlay": "Show in overlay",
	"settings.recording.afterDelete": "After deleting a recording",
	"settings.recording.afterDeleteDescription":
		"Whether the recording window should reopen.",
	"settings.recording.doNothing": "Do nothing",
	"settings.recording.reopenWindow": "Reopen recording window",
	"settings.recording.deleteInstant": "Delete Instant recordings after upload",
	"settings.recording.deleteInstantDescription":
		"Cap removes the local file once it has uploaded successfully.",
	"settings.recording.crashRecovery": "Crash-recoverable recording",
	"settings.recording.crashRecoveryDescription":
		"Record in fragments that can be recovered after a crash or power loss. Slightly larger files during capture.",
	"settings.recording.customCursor": "Custom cursor capture (Studio)",
	"settings.recording.customCursorDescription":
		"Capture cursor state separately so you can adjust size and smoothing in the editor.",
	"settings.recording.autoZoom": "Auto zoom on clicks",
	"settings.recording.autoZoomDescription":
		"Automatically add zoom segments around mouse clicks in Studio recordings.",
	"settings.recording.defaultZoom": "Default zoom amount",
	"settings.recording.defaultZoomDescription":
		"Zoom level for newly created and auto-generated zoom segments.",
	"settings.recording.keyboard": "Capture keyboard presses",
	"settings.recording.keyboardDescription":
		"Record key presses so you can add keyboard overlays in the editor.",
	"settings.recording.notch": "Draw the MacBook notch on screen recordings",
	"settings.recording.notchDescription":
		"Automatically restores the notch for new screen and area recordings when the selected region contains the complete notch. External displays, partial areas, and window recordings are left alone. Each recording can override it in the editor.",
	"settings.recording.maxFps": "Max capture framerate",
	"settings.recording.maxFpsDescription":
		"Maximum framerate for screen capture.",
	"settings.recording.maxFpsHighDescription":
		"Maximum framerate for screen capture. Higher values may cause drops or increased CPU usage on some systems.",
	"settings.privacy.title": "Privacy",
	"settings.privacy.telemetry": "Share anonymous telemetry",
	"settings.privacy.telemetryDescription":
		"Cap uses anonymous telemetry to improve reliability and fix bugs. We never collect recording contents, window titles, file paths, or personal information.",
	"settings.updates.title": "Updates",
	"settings.updates.description": "Choose which Cap builds you receive.",
	"settings.updates.channel": "Update channel",
	"settings.updates.channelDescription":
		"Which release channel Cap updates from.",
	"settings.updates.stable": "Stable",
	"settings.updates.stableDescription": "Versioned releases (recommended)",
	"settings.updates.nightly": "Nightly",
	"settings.updates.nightlyDescription":
		"The newest builds, updated automatically in the background when you're not recording or exporting. May be unstable.",
	"settings.updates.returnStable":
		"Switching back to Stable will return you to the latest stable version, which may be older than your current build.",
	"settings.quality.title": "Quality",
	"settings.quality.description":
		"Pick the right profile for local Studio recordings.",
	"settings.quality.studio": "Studio mode",
	"settings.quality.studioDescription":
		"Encoder profile for local Studio recordings.",
	"settings.quality.bestFor": "Best for:",
	"settings.pro.title": "Cap Pro",
	"settings.pro.description": "Settings available with a Cap Pro license.",
	"settings.pro.autoOpen": "Auto-open shareable links",
	"settings.pro.autoOpenDescription":
		"Open the share link in your browser as soon as the upload finishes.",
	"settings.selfHost.title": "Self-host",
	"settings.selfHost.description":
		"Only change this if you are running your own instance of Cap Web.",
	"settings.selfHost.serverUrl": "Cap Server URL",
	"settings.selfHost.reset": "Reset to Default",
	"settings.selfHost.update": "Update",
	"common.copy": "Click to copy",
	"common.chooseFolder": "Choose Folder",
	"common.reset": "Reset",
	"common.save": "Save",
	"common.add": "Add",
	"common.on": "On",
	"common.off": "Off",
	"common.allow": "Allow",
	"common.notConnected": "Not connected",
	"capture.display": "Display",
	"capture.displayDescription": "Entire screen",
	"capture.window": "Window",
	"capture.windowDescription": "One app",
	"capture.area": "Area",
	"capture.areaDescription": "Custom region",
	"capture.cameraOnly": "Camera Only",
	"capture.cameraOnlyDescription": "No screen",
	"capture.noCamera": "No Camera",
	"capture.noMicrophone": "No Microphone",
	"capture.noSystemAudio": "No System Audio",
	"capture.recordSystemAudio": "Record System Audio",
	"capture.cameraSettings": "Camera settings",
	"capture.microphoneSettings": "Microphone settings",
	"capture.showCameraPreview": "Show camera preview",
	"capture.mode.studio": "Studio Mode",
	"capture.mode.instant": "Instant Mode",
	"capture.mode.screenshot": "Screenshot Mode",
	"capture.start": "Start Recording",
	"capture.preparing": "Preparing...",
	"capture.takeScreenshot": "Take Screenshot",
	"capture.signInToUse": "Sign In To Use",
	"capture.personal": "Personal",
	"capture.settings": "Settings",
	"capture.recordings": "Recordings",
	"capture.screenshots": "Screenshots",
	"capture.teleprompter": "Teleprompter",
	"capture.deviceSettings": "Device settings",
	"capture.default": "Default",
	"capture.back": "Back",
	"capture.help": "Help & Tour",
	"capture.title": "Capture",
	"capture.chooseDisplay": "Choose display",
	"capture.chooseWindow": "Choose window",
	"capture.signingIn": "Signing In...",
	"capture.stop": "Stop Recording",
	"capture.selectCamera": "Please select a camera",
	"capture.loadingCamera": "Loading camera...",
	"capture.cameraConnectionFailed": "Camera connection failed",
	"capture.tryAgain": "Try again",
	"capture.search": "Search...",
	"capture.recordingModes": "Recording Modes",
	"capture.mode.instantTitle": "Instant",
	"capture.mode.instantDescription":
		"Share instantly with a link. Your recording uploads as you record, so you can share it immediately when you're done.",
	"capture.mode.studioTitle": "Studio",
	"capture.mode.studioDescription":
		"Record locally in the highest quality for editing later. Perfect for creating polished content with effects and transitions.",
	"capture.mode.screenshotTitle": "Screenshot",
	"capture.mode.screenshotDescription":
		"Capture and annotate screenshots instantly. Great for quick captures, bug reports, and visual communication.",
	"capture.recents": "Recents",
	"capture.recentsEmpty": "Your latest captures will appear here.",
	"capture.clips": "clips",
	"capture.noRecordings": "No recordings yet",
	"capture.noRecordingsDescription":
		"Your screen recordings will appear here. Start recording to get started!",
	"capture.viewAllRecordings": "View All Recordings",
	"capture.noScreenshots": "No screenshots yet",
	"capture.noScreenshotsDescription":
		"Your screenshots will appear here. Take a screenshot to get started!",
	"capture.viewAllScreenshots": "View All Screenshots",
	"capture.noDisplays": "No displays found",
	"capture.noWindows": "No windows found",
	"capture.noMicrophoneDetected": "No microphone detected",
	"capture.noMicrophoneWarning":
		"This recording will not include your voice. Select a microphone, or continue without one.",
	"capture.goBack": "Go back",
	"capture.recordWithoutMicrophone": "Record without microphone",
	"capture.changelog": "Changelog",
	"capture.none": "None",
	"capture.noMatchingDevices": "No matching devices",
	"capture.noDevices": "No devices found",
	"capture.viewAll": "View All",
	"capture.openItem": "Open",
	"capture.screenshotCopied": "Screenshot copied to clipboard",
	"capture.screenshotCopyFailed": "Failed to copy screenshot",
	"capture.screenshotSaved": "Screenshot saved",
	"capture.screenshotSaveFailed": "Failed to save screenshot",
	"capture.shareLinkCopied": "Share link copied to clipboard",
	"capture.shareLinkFailed": "Failed to create share link",
	"capture.openFolderFailed": "Failed to open folder",
	"capture.recordingFailed": "Recording failed",
	"capture.uploadFailed": "Upload failed",
	"capture.edit": "Edit",
	"capture.copyClipboard": "Copy to clipboard",
	"capture.retryUpload": "Retry upload",
	"capture.reupload": "Reupload",
	"capture.openLink": "Open link",
	"capture.openFolder": "Open folder",
	"capture.delete": "Delete",
	"capture.auto": "Auto",
	"capture.mono": "Mono",
	"capture.stereo": "Stereo",
	"capture.searchDisplays": "Search displays",
	"capture.searchWindows": "Search windows",
	"capture.searchRecordings": "Search recordings",
	"capture.searchScreenshots": "Search screenshots",
	"capture.searchCameras": "Search cameras",
	"capture.searchMicrophones": "Search microphones",
	"capture.noMatchingDisplays": "No matching displays",
	"capture.noMatchingWindows": "No matching windows",
	"capture.noMatchingRecordings": "No matching recordings",
	"capture.noMatchingScreenshots": "No matching screenshots",
	"capture.noMatchingCameras": "No matching cameras",
	"capture.noMatchingMicrophones": "No matching microphones",
	"capture.noCameras": "No cameras found",
	"capture.noMicrophones": "No microphones found",
	"capture.backToList": "Back to list",
	"capture.import": "Import",
	"capture.importImage": "Import image",
	"capture.updateCap": "Update Cap",
	"capture.update": "Update",
	"capture.ignore": "Ignore",
	"capture.restartNow": "Restart now",
	"capture.installRestart": "Install and restart",
	"capture.stopTitle": "Stop Recording",
	"capture.recentLoadFailed": "Unable to load recent captures",
	"capture.collapse": "Collapse",
	"capture.expand": "Expand",
	"capture.collapseWindow": "Collapse window",
	"capture.expandWindow": "Expand window",
	"capture.commercial": "Commercial",
	"capture.recordingsLoadFailed": "Failed to load recordings",
	"capture.screenshotsLoadFailed": "Failed to load screenshots",
	"capture.drawArea": "Draw an area",
	"capture.stopReuseArea": "Stop reusing this area",
	"capture.reuseArea": "Reuse this area for future recordings",
	"capture.locked": "Locked",
	"capture.lock": "Lock",
	"capture.recordingCountdown": "Recording Countdown",
	"capture.moreAspectRatios": "More aspect ratios",
	"capture.resetSelection": "Reset selection",
	"capture.fillDisplay": "Fill display",
	"onboarding.welcome.title": "Welcome to Cap",
	"onboarding.welcome.description":
		"Record, edit, and share beautiful screen recordings",
	"onboarding.welcome.owned": "Beautiful screen recordings owned by you",
	"onboarding.getStarted": "Get started",
	"onboarding.getStartedHint": "Click here, or press",
	"onboarding.demo.stopped": "Stopped",
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
	"shortcuts.action.screenshotDisplay": "截取当前显示器",
	"shortcuts.action.screenshotWindow": "截取当前窗口",
	"shortcuts.action.screenshotArea": "选择区域截图",
	"shortcuts.action.openRecordingPicker": "打开录制目标选择器",
	"shortcuts.action.stopRecording": "停止录制",
	"shortcuts.action.restartRecording": "重新开始录制",
	"shortcuts.action.togglePauseRecording": "暂停或继续录制",
	"shortcuts.action.cycleRecordingMode": "切换录制模式",
	"shortcuts.action.openRecordingPickerDisplay": "录制显示器",
	"shortcuts.action.openRecordingPickerWindow": "录制窗口",
	"shortcuts.action.openRecordingPickerArea": "录制区域",
	"shortcuts.none": "未设置",
	"shortcuts.setPrompt": "请按下快捷键…",
	"settings.account.clickToSignIn": "点击登录",
	"settings.account.signedIn": "已登录",
	"settings.account.label": "账户",
	"settings.account.signIn": "登录",
	"settings.account.signOut": "退出登录",
	"settings.account.previousVersions": "查看历史版本",
	"settings.account.checkUpdates": "检查更新",
	"settings.account.checkingUpdates": "正在检查更新…",
	"settings.account.versionCopied": "版本号已复制到剪贴板",
	"settings.account.versionCopyFailed": "复制版本号失败",
	"settings.account.upToDateTitle": "Cap 已是最新版本",
	"settings.account.upToDateMessage": "你当前使用的已经是 Cap 最新版本",
	"settings.account.updateAvailableTitle": "发现新版本",
	"settings.account.updateCheckFailedTitle": "无法检查更新",
	"settings.account.updateCheckFailedMessage":
		"无法自动检查更新。你可以前往 cap.so/download 下载最新版本，现有数据不会丢失。",
	"settings.projectName.title": "默认项目名称",
	"settings.projectName.description": "用于新录制和导出文件的命名模板",
	"settings.projectName.availablePlaceholders": "可用占位符",
	"settings.projectName.placeholderHint":
		"点击任意占位符即可复制。时间支持 {moment:HH:mm} 这样的自定义格式。",
	"settings.projectName.recordingMode": "录制模式",
	"settings.projectName.target": "录制目标",
	"settings.projectName.dateTime": "日期与时间",
	"settings.projectName.targetNameHint": "显示器名称或窗口标题",
	"settings.storage.title": "存储位置",
	"settings.storage.description": "设置 Cap 保存录制文件的位置",
	"settings.storage.default": "默认（Application Support）",
	"settings.storage.reset": "恢复默认位置",
	"settings.excludedWindows.title": "排除的窗口",
	"settings.excludedWindows.description": "录制时隐藏这些窗口",
	"settings.excludedWindows.windowsDescription":
		"录制时隐藏窗口。在 Windows 上只能排除 Cap 相关窗口。",
	"settings.excludedWindows.recommendedMissing":
		"建议排除的 Cap 窗口尚未全部添加",
	"settings.excludedWindows.recommendedMissingDescription":
		"摄像头、设置或录制控制窗口可能在录屏中显示为黑框。缺少：",
	"settings.excludedWindows.restore": "恢复建议项",
	"settings.excludedWindows.empty": "当前没有排除任何窗口",
	"settings.excludedWindows.remove": "移除排除窗口",
	"settings.app.title": "应用",
	"settings.app.description": "设置 Cap 在系统中的显示方式",
	"settings.app.dockIcon": "始终显示程序坞图标",
	"settings.app.dockIconDescription":
		"即使没有打开窗口，也让 Cap 保留在程序坞中",
	"settings.app.notifications": "系统通知",
	"settings.app.notificationsDescription":
		"显示复制到剪贴板、文件已保存等通知；你可能需要在系统设置中允许 Cap 发送通知",
	"settings.recording.title": "录制",
	"settings.recording.description": "设置录制过程中和停止录制后的行为",
	"settings.recording.countdown": "录制倒计时",
	"settings.recording.countdownDescription": "开始录制前等待一段时间",
	"settings.recording.seconds3": "3 秒",
	"settings.recording.seconds5": "5 秒",
	"settings.recording.seconds10": "10 秒",
	"settings.recording.confirmNoMic": "无麦克风时开始录制前确认",
	"settings.recording.confirmNoMicDescription":
		"未选择麦克风或所选麦克风不可用时，要求再次确认",
	"settings.recording.mainWindow": "开始录制时的主窗口",
	"settings.recording.mainWindowDescription": "设置录制开始后如何处理主窗口",
	"settings.recording.close": "关闭",
	"settings.recording.minimise": "最小化",
	"settings.recording.afterStudio": "专业录制停止后",
	"settings.recording.afterStudioDescription": "设置专业录制停止后的操作",
	"settings.recording.openEditor": "打开编辑器",
	"settings.recording.showOverlay": "在浮层中显示",
	"settings.recording.afterDelete": "删除录制后",
	"settings.recording.afterDeleteDescription": "设置是否重新打开录制窗口",
	"settings.recording.doNothing": "不执行操作",
	"settings.recording.reopenWindow": "重新打开录制窗口",
	"settings.recording.deleteInstant": "上传后删除本地快速录制",
	"settings.recording.deleteInstantDescription": "成功上传后删除本地文件",
	"settings.recording.crashRecovery": "可崩溃恢复录制",
	"settings.recording.crashRecoveryDescription":
		"分片录制，意外崩溃或断电后仍可恢复；录制期间文件会稍大",
	"settings.recording.customCursor": "独立捕获鼠标（专业录制）",
	"settings.recording.customCursorDescription":
		"单独记录鼠标状态，便于在编辑器中调整大小和平滑效果",
	"settings.recording.autoZoom": "点击时自动放大",
	"settings.recording.autoZoomDescription":
		"在专业录制中自动为鼠标点击添加放大片段",
	"settings.recording.defaultZoom": "默认放大倍数",
	"settings.recording.defaultZoomDescription":
		"新建和自动生成放大片段时使用的缩放级别",
	"settings.recording.keyboard": "捕获键盘按键",
	"settings.recording.keyboardDescription":
		"记录按键，以便在编辑器中添加键盘提示层",
	"settings.recording.notch": "在录屏中绘制 MacBook 刘海",
	"settings.recording.notchDescription":
		"当新建屏幕或区域录制完整包含刘海时自动还原刘海；外接显示器、局部区域和窗口录制不受影响，每条录制都可在编辑器中单独覆盖此设置",
	"settings.recording.maxFps": "最高捕获帧率",
	"settings.recording.maxFpsDescription": "屏幕捕获使用的最高帧率",
	"settings.recording.maxFpsHighDescription":
		"屏幕捕获使用的最高帧率；过高可能在部分设备上造成掉帧或增加 CPU 占用",
	"settings.privacy.title": "隐私",
	"settings.privacy.telemetry": "分享匿名遥测数据",
	"settings.privacy.telemetryDescription":
		"Cap 使用匿名遥测数据提高稳定性并修复问题，不会收集录制内容、窗口标题、文件路径或个人信息",
	"settings.updates.title": "更新",
	"settings.updates.description": "选择要接收的 Cap 构建版本",
	"settings.updates.channel": "更新通道",
	"settings.updates.channelDescription": "选择 Cap 从哪个发布通道获取更新",
	"settings.updates.stable": "稳定版",
	"settings.updates.stableDescription": "带版本号的正式发布（推荐）",
	"settings.updates.nightly": "每日构建",
	"settings.updates.nightlyDescription":
		"获取最新构建，并在未录制或导出时后台自动更新；可能不稳定",
	"settings.updates.returnStable":
		"切回稳定版后会回到最新稳定版本，它可能比你当前使用的构建更旧",
	"settings.quality.title": "录制质量",
	"settings.quality.description": "为本地专业录制选择合适的质量档位",
	"settings.quality.studio": "专业录制",
	"settings.quality.studioDescription": "本地专业录制使用的编码配置",
	"settings.quality.bestFor": "适合：",
	"settings.pro.title": "Cap Pro",
	"settings.pro.description": "拥有 Cap Pro 授权后可使用的设置",
	"settings.pro.autoOpen": "自动打开分享链接",
	"settings.pro.autoOpenDescription": "上传完成后立即在浏览器中打开分享链接",
	"settings.selfHost.title": "自托管",
	"settings.selfHost.description": "仅在你自行运行 Cap Web 实例时修改此项",
	"settings.selfHost.serverUrl": "Cap Server URL",
	"settings.selfHost.reset": "恢复默认",
	"settings.selfHost.update": "更新",
	"common.copy": "点击复制",
	"common.chooseFolder": "选择文件夹",
	"common.reset": "重置",
	"common.save": "保存",
	"common.add": "添加",
	"common.on": "开启",
	"common.off": "关闭",
	"common.allow": "授权",
	"common.notConnected": "未连接",
	"capture.display": "显示器",
	"capture.displayDescription": "整个屏幕",
	"capture.window": "窗口",
	"capture.windowDescription": "单个应用",
	"capture.area": "区域",
	"capture.areaDescription": "自定义区域",
	"capture.cameraOnly": "仅摄像头",
	"capture.cameraOnlyDescription": "不录屏幕",
	"capture.noCamera": "未选择摄像头",
	"capture.noMicrophone": "未选择麦克风",
	"capture.noSystemAudio": "不录制系统声音",
	"capture.recordSystemAudio": "录制系统声音",
	"capture.cameraSettings": "摄像头设置",
	"capture.microphoneSettings": "麦克风设置",
	"capture.showCameraPreview": "显示摄像头预览",
	"capture.mode.studio": "专业录制",
	"capture.mode.instant": "快速录制",
	"capture.mode.screenshot": "截图模式",
	"capture.start": "开始录制",
	"capture.preparing": "正在准备…",
	"capture.takeScreenshot": "开始截图",
	"capture.signInToUse": "登录后使用",
	"capture.personal": "个人版",
	"capture.settings": "设置",
	"capture.recordings": "录制",
	"capture.screenshots": "截图",
	"capture.teleprompter": "提词器",
	"capture.deviceSettings": "设备设置",
	"capture.default": "默认",
	"capture.back": "返回",
	"capture.help": "帮助与使用引导",
	"capture.title": "录制",
	"capture.chooseDisplay": "选择显示器",
	"capture.chooseWindow": "选择窗口",
	"capture.signingIn": "正在登录…",
	"capture.stop": "停止录制",
	"capture.selectCamera": "请选择摄像头",
	"capture.loadingCamera": "正在加载摄像头…",
	"capture.cameraConnectionFailed": "摄像头连接失败",
	"capture.tryAgain": "重试",
	"capture.search": "搜索…",
	"capture.recordingModes": "录制模式",
	"capture.mode.instantTitle": "快速录制",
	"capture.mode.instantDescription": "录制时同步上传，结束后立即得到可分享链接",
	"capture.mode.studioTitle": "专业录制",
	"capture.mode.studioDescription":
		"以最高质量保存在本地，适合后续精细编辑、添加效果和转场",
	"capture.mode.screenshotTitle": "截图",
	"capture.mode.screenshotDescription":
		"快速截图并添加标注，适合说明问题、提交反馈和视觉沟通",
	"capture.recents": "最近项目",
	"capture.recentsEmpty": "最近录制和截图会显示在这里",
	"capture.clips": "个片段",
	"capture.noRecordings": "还没有录制",
	"capture.noRecordingsDescription": "开始录制后，屏幕录制会显示在这里",
	"capture.viewAllRecordings": "查看全部录制",
	"capture.noScreenshots": "还没有截图",
	"capture.noScreenshotsDescription": "完成截图后，截图会显示在这里",
	"capture.viewAllScreenshots": "查看全部截图",
	"capture.noDisplays": "未找到显示器",
	"capture.noWindows": "未找到窗口",
	"capture.noMicrophoneDetected": "未检测到麦克风",
	"capture.noMicrophoneWarning":
		"本次录制不会包含你的声音。请选择麦克风，或确认无麦克风继续录制。",
	"capture.goBack": "返回选择",
	"capture.recordWithoutMicrophone": "不使用麦克风继续录制",
	"capture.changelog": "更新日志",
	"capture.none": "无",
	"capture.noMatchingDevices": "没有匹配的设备",
	"capture.noDevices": "未找到设备",
	"capture.viewAll": "查看全部",
	"capture.openItem": "打开",
	"capture.screenshotCopied": "截图已复制到剪贴板",
	"capture.screenshotCopyFailed": "复制截图失败",
	"capture.screenshotSaved": "截图已保存",
	"capture.screenshotSaveFailed": "保存截图失败",
	"capture.shareLinkCopied": "分享链接已复制到剪贴板",
	"capture.shareLinkFailed": "创建分享链接失败",
	"capture.openFolderFailed": "打开文件夹失败",
	"capture.recordingFailed": "录制失败",
	"capture.uploadFailed": "上传失败",
	"capture.edit": "编辑",
	"capture.copyClipboard": "复制到剪贴板",
	"capture.retryUpload": "重试上传",
	"capture.reupload": "重新上传",
	"capture.openLink": "打开链接",
	"capture.openFolder": "打开文件夹",
	"capture.delete": "删除",
	"capture.auto": "自动",
	"capture.mono": "单声道",
	"capture.stereo": "立体声",
	"capture.searchDisplays": "搜索显示器",
	"capture.searchWindows": "搜索窗口",
	"capture.searchRecordings": "搜索录制",
	"capture.searchScreenshots": "搜索截图",
	"capture.searchCameras": "搜索摄像头",
	"capture.searchMicrophones": "搜索麦克风",
	"capture.noMatchingDisplays": "没有匹配的显示器",
	"capture.noMatchingWindows": "没有匹配的窗口",
	"capture.noMatchingRecordings": "没有匹配的录制",
	"capture.noMatchingScreenshots": "没有匹配的截图",
	"capture.noMatchingCameras": "没有匹配的摄像头",
	"capture.noMatchingMicrophones": "没有匹配的麦克风",
	"capture.noCameras": "未找到摄像头",
	"capture.noMicrophones": "未找到麦克风",
	"capture.backToList": "返回列表",
	"capture.import": "导入",
	"capture.importImage": "导入图片",
	"capture.updateCap": "更新 Cap",
	"capture.update": "更新",
	"capture.ignore": "忽略",
	"capture.restartNow": "立即重启",
	"capture.installRestart": "安装并重启",
	"capture.stopTitle": "停止录制",
	"capture.recentLoadFailed": "无法加载最近项目",
	"capture.collapse": "收起",
	"capture.expand": "展开",
	"capture.collapseWindow": "收起窗口",
	"capture.expandWindow": "展开窗口",
	"capture.commercial": "商业版",
	"capture.recordingsLoadFailed": "加载录制失败",
	"capture.screenshotsLoadFailed": "加载截图失败",
	"capture.drawArea": "框选区域",
	"capture.stopReuseArea": "停止复用此区域",
	"capture.reuseArea": "以后录制时复用此区域",
	"capture.locked": "已锁定",
	"capture.lock": "锁定",
	"capture.recordingCountdown": "录制倒计时",
	"capture.moreAspectRatios": "更多画面比例",
	"capture.resetSelection": "重置选区",
	"capture.fillDisplay": "填满显示器",
	"onboarding.welcome.title": "欢迎使用 Cap",
	"onboarding.welcome.description": "录制、编辑和分享精美的屏幕视频",
	"onboarding.welcome.owned": "精美的屏幕录像，由你完全掌控",
	"onboarding.getStarted": "开始使用",
	"onboarding.getStartedHint": "点击这里，或按",
	"onboarding.demo.stopped": "已停止",
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
	text: (source: string) => string;
	selection: (
		count: number,
		kind: EditorSelectionKind,
		total?: number,
	) => string;
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
				text: (source) => translateLiteral(language(), source),
				selection: (count, kind, total) =>
					formatEditorSelection(language(), count, kind, total),
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

import { describe, expect, it } from "vitest";
import {
	formatEditorSelection,
	hasSelectedAppLanguage,
	translate,
} from "./i18n";
import { translateLiteral } from "./i18n-literals";

describe("i18n", () => {
	it("treats only a persisted supported language as an existing choice", () => {
		expect(hasSelectedAppLanguage(undefined)).toBe(false);
		expect(hasSelectedAppLanguage(null)).toBe(false);
		expect(hasSelectedAppLanguage("zh-CN")).toBe(true);
		expect(hasSelectedAppLanguage("en")).toBe(true);
	});

	it("returns the English message", () => {
		expect(translate("en", "settings.nav.shortcuts")).toBe("Shortcuts");
	});

	it("returns the Simplified Chinese message", () => {
		expect(translate("zh-CN", "settings.nav.shortcuts")).toBe("快捷键");
	});

	it("localizes every permission confirmation and recovery action", () => {
		expect(translate("zh-CN", "onboarding.permissions.confirmGranted")).toBe(
			"我已授权，检查一次",
		);
		expect(translate("zh-CN", "onboarding.permissions.continueSetting")).toBe(
			"继续设置其他权限",
		);
		expect(translate("zh-CN", "onboarding.permissions.restartOnce")).toBe(
			"完成授权并重启",
		);
		expect(translate("en", "onboarding.permissions.confirmGranted")).toBe(
			"I've granted access — check once",
		);
		expect(translate("en", "onboarding.permissions.recheck")).toBe(
			"Check again",
		);
	});

	it("localizes the settings shell and every shortcut action", () => {
		expect(translate("zh-CN", "settings.account.clickToSignIn")).toBe(
			"点击登录",
		);
		expect(translate("zh-CN", "settings.account.previousVersions")).toBe(
			"查看历史版本",
		);
		expect(translate("zh-CN", "shortcuts.action.screenshotDisplay")).toBe(
			"截取当前显示器",
		);
		expect(translate("zh-CN", "shortcuts.action.togglePauseRecording")).toBe(
			"暂停或继续录制",
		);
		expect(translate("zh-CN", "shortcuts.action.openRecordingPickerArea")).toBe(
			"录制区域",
		);
		expect(translate("zh-CN", "shortcuts.none")).toBe("未设置");
		expect(translate("zh-CN", "shortcuts.setPrompt")).toBe("请按下快捷键…");
	});

	it("localizes explanations without translating technical placeholders", () => {
		const hint = translate("zh-CN", "settings.projectName.placeholderHint");
		expect(hint).toContain("点击任意占位符即可复制");
		expect(hint).toContain("{moment:HH:mm}");
		expect(translate("zh-CN", "settings.projectName.recordingMode")).toBe(
			"录制模式",
		);
		expect(translate("zh-CN", "settings.projectName.target")).toBe("录制目标");
	});

	it("localizes the recording launcher while preserving device names", () => {
		expect(translate("zh-CN", "capture.display")).toBe("显示器");
		expect(translate("zh-CN", "capture.cameraOnly")).toBe("仅摄像头");
		expect(translate("zh-CN", "capture.noSystemAudio")).toBe("不录制系统声音");
		expect(translate("zh-CN", "capture.mode.instant")).toBe("快速录制");
	});

	it("localizes bundled font names without changing their stored identifiers", () => {
		expect(translateLiteral("zh-CN", "Source Han Sans CN VF")).toBe(
			"思源黑体（简体中文）",
		);
		expect(translateLiteral("zh-CN", "Source Han Serif CN VF")).toBe(
			"思源宋体（简体中文）",
		);
		expect(translateLiteral("zh-CN", "LXGW WenKai")).toBe("霞鹜文楷");
		expect(translateLiteral("en", "Source Han Sans CN VF")).toBe(
			"Source Han Sans CN VF",
		);
	});

	it("localizes each camera failure category instead of reporting every failure as permission", () => {
		expect(translate("zh-CN", "camera.issue.title")).toBe("摄像头不可用");
		expect(translate("zh-CN", "camera.issue.permissionDenied")).toContain(
			"权限",
		);
		expect(translate("zh-CN", "camera.issue.inUse")).toContain("占用");
		expect(translate("zh-CN", "camera.issue.disconnected")).toContain("断开");
		expect(translate("zh-CN", "camera.issue.noFrames")).toContain(
			"没有返回画面",
		);
		expect(translate("zh-CN", "camera.issue.unsupportedFormat")).toContain(
			"支持的画面格式",
		);
		expect(translate("zh-CN", "camera.issue.initialisationFailed")).toContain(
			"启动失败",
		);
	});

	it("formats editor selection summaries in the active language", () => {
		expect(formatEditorSelection("zh-CN", 2, "caption")).toBe(
			"已选择 2 个字幕片段",
		);
		expect(formatEditorSelection("zh-CN", 2, "zoom", 3)).toBe(
			"已选择 2/3 个放大片段",
		);
		expect(formatEditorSelection("en", 1, "text")).toBe(
			"1 text segment selected",
		);
	});
});

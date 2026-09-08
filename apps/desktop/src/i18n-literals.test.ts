import { describe, expect, it } from "vitest";
import { translateLiteral } from "./i18n-literals";
import {
	ACTION_LABELS,
	CONDITION_LABELS,
	TRIGGER_LABELS,
} from "./utils/automations";

describe("legacy user-interface localization", () => {
	it("translates editor actions and labels into Simplified Chinese", () => {
		expect(translateLiteral("zh-CN", "Crop")).toBe("裁剪");
		expect(translateLiteral("zh-CN", "Crop Video")).toBe("裁剪视频");
		expect(translateLiteral("zh-CN", "Background")).toBe("背景");
		expect(translateLiteral("zh-CN", "Show cursor")).toBe("显示鼠标");
		expect(translateLiteral("zh-CN", "Chinese Position")).toBe("中文位置");
		expect(translateLiteral("zh-CN", "English Position")).toBe("英文位置");
	});

	it("returns the source text when English is selected", () => {
		expect(translateLiteral("en", "Crop Video")).toBe("Crop Video");
	});

	it("translates recording source audio controls", () => {
		expect(translateLiteral("zh-CN", "Microphone")).toBe("麦克风");
		expect(translateLiteral("zh-CN", "System Audio")).toBe("系统声音");
		expect(translateLiteral("zh-CN", "Collapse Track")).toBe("收起轨道");
		expect(
			translateLiteral(
				"zh-CN",
				"Expand the recorded microphone audio from Video.",
			),
		).toBe("从视频轨道中展开已录制的麦克风声音");
		expect(
			translateLiteral("zh-CN", "Expand the recorded system audio from Video."),
		).toBe("从视频轨道中展开已录制的系统声音");
		expect(translateLiteral("zh-CN", "Mute microphone")).toBe("将麦克风静音");
		expect(translateLiteral("zh-CN", "Unmute microphone")).toBe(
			"取消麦克风静音",
		);
	});

	it("preserves technical and user-authored values that are not UI copy", () => {
		expect(translateLiteral("zh-CN", "macOS")).toBe("macOS");
		expect(translateLiteral("zh-CN", "pnpm tauri dev")).toBe("pnpm tauri dev");
		expect(translateLiteral("zh-CN", "/Users/a1/Movies/demo.mp4")).toBe(
			"/Users/a1/Movies/demo.mp4",
		);
		expect(translateLiteral("zh-CN", "Insta360 Link 2 Pro")).toBe(
			"Insta360 Link 2 Pro",
		);
	});

	it("translates the automation templates shown in the Chinese interface", () => {
		const expected = new Map([
			["Auto-copy new screenshots to clipboard", "自动把新截图复制到剪贴板"],
			["Pull the text out of screenshots", "提取截图中的文字"],
			["Tuck screenshots into a folder", "把截图自动保存到文件夹"],
			["Jump to each new screenshot", "自动打开每张新截图的位置"],
			["Auto-export when you finish recording", "录制完成后自动导出"],
			["Upload and grab the share link", "上传并复制分享链接"],
			["Ping me when an upload is ready", "上传完成后通知我"],
			["Tell Slack when you share something", "分享后通知 Slack"],
		]);

		for (const [source, translation] of expected) {
			expect(translateLiteral("zh-CN", source)).toBe(translation);
		}
	});

	it("keeps automation protocol values and placeholders unchanged", () => {
		expect(translateLiteral("zh-CN", "POST")).toBe("POST");
		expect(translateLiteral("zh-CN", "{share_link}")).toBe("{share_link}");
		expect(translateLiteral("zh-CN", '{"text":"{share_link}"}')).toBe(
			'{"text":"{share_link}"}',
		);
	});

	it("translates every automation trigger, condition, and action label", () => {
		const labels = [
			...Object.values(TRIGGER_LABELS),
			...Object.values(CONDITION_LABELS),
			...Object.values(ACTION_LABELS),
		];

		for (const label of labels) {
			expect(translateLiteral("zh-CN", label), label).not.toBe(label);
		}
	});
});
